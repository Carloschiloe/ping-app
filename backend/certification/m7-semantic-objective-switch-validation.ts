import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import {
    OpenAiSemanticModel,
    parseSemanticV4ModelOutput,
    type SemanticDialogueContext,
} from '../src/services/canonicalSemanticProducer.service';

type ExpectedRelation = NonNullable<import('../src/types/agentTurnCommit').NormalizedSemanticTurnV4['openObjectiveRelation']>;

interface CaseDefinition {
    id: string;
    utterance: string;
    dialogue: SemanticDialogueContext | null;
    expected: ExpectedRelation[];
    purpose: string;
}

const cases: CaseDefinition[] = [
    { id: 'OR01', utterance: 'La actividad es revisar el inventario.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [] }, expected: ['answers_pending_slot'], purpose: 'respuesta al título pendiente' },
    { id: 'OR02', utterance: 'La persona sería Camila.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'person', suspendedObjectiveType: null, referentHints: [] }, expected: ['answers_pending_slot'], purpose: 'respuesta a persona pendiente' },
    { id: 'OR03', utterance: 'Cambiemos el encargo por revisar el inventario.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [] }, expected: ['replaces'], purpose: 'reemplazo explícito de objetivo' },
    { id: 'OR04', utterance: 'Anota además llamar a la farmacia el jueves.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['revisar informe'] }, expected: ['independent', 'replaces'], purpose: 'nuevo objetivo durante otro abierto' },
    { id: 'OR05', utterance: 'Mejor déjalo para el viernes en la tarde.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['revisar informe'] }, expected: ['corrects', 'continues'], purpose: 'corrección temporal' },
    { id: 'OR06', utterance: 'Sigamos con el mismo encargo, pero después de almuerzo.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['revisar informe'] }, expected: ['continues', 'corrects'], purpose: 'continuación con atributo' },
    { id: 'OR07', utterance: 'No estoy seguro de qué corresponde hacer ahora.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [] }, expected: ['ambiguous'], purpose: 'ambigüedad genuina' },
    { id: 'OR08', utterance: 'En realidad necesito hablar con Paula sobre el contrato.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [] }, expected: ['replaces', 'independent'], purpose: 'cambio de objetivo durante clarificación' },
    { id: 'OR09', utterance: '¿Qué mensajes tengo de esta semana?', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: [] }, expected: ['unrelated', 'independent'], purpose: 'cambio a lectura' },
    { id: 'OR10', utterance: 'No, deja eso; quiero revisar mis compromisos.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: [] }, expected: ['unrelated', 'independent'], purpose: 'abandono y cambio de intención' },
    { id: 'OR11', utterance: 'A las nueve.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['revisar informe'] }, expected: ['answers_pending_slot'], purpose: 'valor corto de hora' },
    { id: 'OR12', utterance: 'También necesito coordinar una visita con Diego.', dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: null, suspendedObjectiveType: null, referentHints: ['revisar informe'] }, expected: ['independent', 'replaces'], purpose: 'objetivo adicional con persona' },
];

const artifactRoot = path.resolve(process.cwd(), '.m7-smoke-artifacts', 'semantic-objective-switch-20260927');
fs.mkdirSync(artifactRoot, { recursive: true });

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function summary(semantic: ReturnType<typeof parseSemanticV4ModelOutput>['semantic']) {
    return {
        kind: semantic.kind,
        domain: semantic.domain,
        objectiveCompleteness: semantic.objectiveCompleteness,
        openObjectiveRelation: semantic.openObjectiveRelation ?? null,
        pendingSlotAnswer: semantic.pendingSlotAnswer,
        continuationLike: semantic.continuationLike,
        independentObjective: semantic.independentObjective,
        candidateSlotType: semantic.candidateSlotType,
        objectiveType: semantic.objectiveType,
        ambiguityFields: semantic.ambiguityFields,
        confidence: semantic.confidence,
    };
}

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) {
        console.log(JSON.stringify({ status: 'blocked', reason: 'OPENAI_API_KEY_NOT_CONFIGURED', cases: cases.length }));
        return;
    }
    const model = new OpenAiSemanticModel('gpt-5.6-sol');
    const results: Array<Record<string, unknown>> = [];
    let providerErrors = 0;
    let schemaInvalid = 0;
    let accepted = 0;
    let calls = 0;

    for (const testCase of cases) {
        calls += 1;
        const response = await model.interpretWithDiagnostics({
            text: testCase.utterance,
            modality: 'text',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            dialogue: testCase.dialogue,
            semanticVersion: 4,
        });
        if (response.kind === 'error') {
            providerErrors += 1;
            results.push({ id: testCase.id, purpose: testCase.purpose, expected: testCase.expected, kind: 'provider_error', diagnostics: response });
            continue;
        }
        const raw = response.content ?? '';
        const rawPath = path.join(artifactRoot, `${testCase.id}.raw.json`);
        // The exact provider content is persisted before parsing or judging.
        fs.writeFileSync(rawPath, raw, { encoding: 'utf8', flag: 'wx' });
        const parsed = parseSemanticV4ModelOutput(raw);
        if (!parsed.diagnostics.schemaValid || parsed.diagnostics.failure) schemaInvalid += 1;
        const observed = summary(parsed.semantic);
        const pass = parsed.diagnostics.schemaValid
            && parsed.diagnostics.failure === null
            && testCase.expected.includes(observed.openObjectiveRelation as ExpectedRelation);
        if (pass) accepted += 1;
        results.push({
            id: testCase.id,
            purpose: testCase.purpose,
            expected: testCase.expected,
            observed,
            diagnostics: {
                finishReason: response.finishReason,
                schemaValid: parsed.diagnostics.schemaValid,
                parseFailure: parsed.diagnostics.failure,
                rawSha256: sha256(raw),
                latencyMs: response.latencyMs,
            },
            pass,
        });
    }

    const report = {
        version: 1,
        model: model.modelName,
        calls,
        cases: cases.length,
        accepted,
        schemaInvalid,
        providerErrors,
        results,
        sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 },
    };
    fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({
        status: 'complete', model: model.modelName, calls, cases: cases.length, accepted, schemaInvalid, providerErrors,
        artifactRoot, sideEffects: report.sideEffects,
        results: results.map(result => ({ id: result.id, expected: result.expected, observed: result.observed, pass: result.pass })),
    }));
}

void main().catch(error => {
    console.error(JSON.stringify({ status: 'runner_error', name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
});
