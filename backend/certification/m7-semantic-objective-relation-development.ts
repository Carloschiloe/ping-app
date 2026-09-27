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

type Relation = 'answers_pending_slot' | 'continues' | 'corrects' | 'replaces' | 'independent' | 'ambiguous';

interface DevelopmentCase {
    id: string;
    utterance: string;
    dialogue: SemanticDialogueContext;
    expected: Relation[];
}

const cases: DevelopmentCase[] = [
    {
        id: 'DEV01', utterance: 'El título será preparar la presentación.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: '', knownSlots: {}, targetHints: [] } },
        expected: ['answers_pending_slot'],
    },
    {
        id: 'DEV02', utterance: 'Déjalo para el miércoles después de almuerzo.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['preparar la presentación'], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: {}, targetHints: ['presentación'] } },
        expected: ['corrects'],
    },
    {
        id: 'DEV03', utterance: 'Mantengamos ese encargo, pero con Fernanda a cargo.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: null, suspendedObjectiveType: null, referentHints: ['preparar la presentación'], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: {}, targetHints: ['presentación'] } },
        expected: ['corrects'],
    },
    {
        id: 'DEV04', utterance: 'En vez de eso, agenda revisar el presupuesto.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: {}, targetHints: ['presentación'] } },
        expected: ['replaces'],
    },
    {
        id: 'DEV05', utterance: 'Además, recuérdame comprar pilas.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: null, suspendedObjectiveType: null, referentHints: ['preparar la presentación'], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: {}, targetHints: ['presentación'] } },
        expected: ['independent'],
    },
    {
        id: 'DEV06', utterance: 'Sigamos con esa tarea como estaba.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: null, suspendedObjectiveType: null, referentHints: ['preparar la presentación'], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: {}, targetHints: ['presentación'] } },
        expected: ['continues'],
    },
    {
        id: 'DEV07', utterance: 'No sé qué corresponde decidir todavía.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'title', suspendedObjectiveType: null, referentHints: [], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: '', knownSlots: {}, targetHints: [] } },
        expected: ['ambiguous'],
    },
    {
        id: 'DEV08', utterance: 'La hora correcta es a las seis.',
        dialogue: { lifecycle: 'active', activeObjectiveType: 'create_personal_commitment', missingSlotType: 'time', suspendedObjectiveType: null, referentHints: ['preparar la presentación'], activeObjective: { objectiveType: 'create_personal_commitment', desiredOutcome: 'preparar la presentación', knownSlots: { time: 'a las cinco' }, targetHints: ['presentación'] } },
        expected: ['corrects'],
    },
];

const artifactRoot = path.resolve(process.env.M7_SEMANTIC_RELATION_DEV_ARTIFACT_ROOT ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'semantic-objective-relation-development-20260927-v1'));

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) { console.log(JSON.stringify({ status: 'blocked', reason: 'OPENAI_API_KEY_NOT_CONFIGURED' })); return; }
    fs.mkdirSync(artifactRoot, { recursive: true });
    const model = new OpenAiSemanticModel('gpt-5.6-sol');
    const results: Array<Record<string, unknown>> = [];
    let pass = 0;
    let schemaInvalid = 0;
    for (const testCase of cases) {
        const response = await model.interpretWithDiagnostics({ text: testCase.utterance, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: testCase.dialogue, semanticVersion: 4 });
        if (response.kind === 'error') {
            results.push({ id: testCase.id, expected: testCase.expected, providerError: response.errorClass });
            continue;
        }
        const raw = response.content ?? '';
        fs.writeFileSync(path.join(artifactRoot, `${testCase.id}.raw.json`), raw, { encoding: 'utf8', flag: 'wx' });
        const parsed = parseSemanticV4ModelOutput(raw);
        const relation = parsed.semantic.openObjectiveRelation ?? null;
        const ok = parsed.diagnostics.schemaValid && parsed.diagnostics.failure === null && testCase.expected.includes(relation as Relation);
        if (parsed.diagnostics.failure) schemaInvalid += 1;
        if (ok) pass += 1;
        results.push({ id: testCase.id, expected: testCase.expected, observed: { kind: parsed.semantic.kind, relation, pendingSlotAnswer: parsed.semantic.pendingSlotAnswer, continuationLike: parsed.semantic.continuationLike, independentObjective: parsed.semantic.independentObjective, objectiveType: parsed.semantic.objectiveType, slots: parsed.semantic.slots }, schemaValid: parsed.diagnostics.schemaValid, failure: parsed.diagnostics.failure, rawSha256: sha256(raw), pass: ok });
    }
    const report = { runId: path.basename(artifactRoot), model: model.modelName, cases: cases.length, pass, fail: cases.length - pass, schemaInvalid, results, sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 } };
    fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(report));
}

if (require.main === module) void main().catch(error => { console.error(JSON.stringify({ status: 'runner_error', name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'unknown' })); process.exitCode = 1; });
