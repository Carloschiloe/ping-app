import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { OpenAiSemanticModel, parseSemanticV4ModelOutput, type SemanticDialogueContext } from '../src/services/canonicalSemanticProducer.service';

const sourceCapture = path.resolve(process.env.M7_DIRECTED_B1_CAPTURE ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'real-ledger-directed-20260927', 'conversation-00000000-0000-4000-8000-000000000111-turn-1.final.json'));
const artifactRoot = path.resolve(process.env.M7_DIRECTED_B2_ARTIFACT_ROOT ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'real-ledger-directed-b2-20260927-v4'));
const utterance = 'Cambiemos eso por revisar el inventario.';

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

function buildDialogue(state: any): SemanticDialogueContext {
    const objective = state.dialogueStateAfter?.openObjective ?? null;
    const pending = state.dialogueStateAfter?.pendingClarification ?? null;
    return {
        lifecycle: state.dialogueStateAfter?.lifecycle ?? 'none',
        activeObjectiveType: objective?.objectiveType ?? null,
        missingSlotType: pending?.field ?? null,
        suspendedObjectiveType: null,
        referentHints: (state.dialogueStateAfter?.referents ?? []).map((item: any) => item.rawText).slice(-3),
        activeObjective: objective ? {
            objectiveType: objective.objectiveType,
            desiredOutcome: objective.desiredOutcome ?? '',
            knownSlots: objective.timeConstraints?.rawHint ? { time: objective.timeConstraints.rawHint } : {},
            targetHints: objective.targetEntities?.entityHints ?? [],
        } : null,
    };
}

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY_REQUIRED');
    const prior = JSON.parse(fs.readFileSync(sourceCapture, 'utf8'));
    const dialogue = buildDialogue(prior);
    process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
    fs.mkdirSync(artifactRoot, { recursive: true });
    const model = new OpenAiSemanticModel('gpt-5.6-sol');
    const response = await model.interpretWithDiagnostics({ text: utterance, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue, semanticVersion: 4 });
    if (response.kind === 'error') throw new Error(`PROVIDER_ERROR=${JSON.stringify({ errorClass: response.errorClass, httpStatus: response.httpStatus, errorCode: response.errorCode, errorMessage: response.errorMessage })}`);
    const raw = response.content ?? '';
    const rawPath = path.join(artifactRoot, 'directed-b2.semantic-v4.raw.json');
    fs.writeFileSync(rawPath, raw, { encoding: 'utf8', flag: 'wx' });
    const parsed = parseSemanticV4ModelOutput(raw);
    const report = {
        utterance,
        sourceCapture,
        dialogue,
        model: model.modelName,
        calls: 1,
        finishReason: response.finishReason,
        schemaValid: parsed.diagnostics.schemaValid,
        failure: parsed.diagnostics.failure,
        observed: { kind: parsed.semantic.kind, relation: parsed.semantic.openObjectiveRelation, objectiveType: parsed.semantic.objectiveType, desiredOutcome: parsed.semantic.slots.desiredOutcome ?? null, slots: parsed.semantic.slots },
        expectedRelation: 'replaces',
        expressedSwitch: parsed.diagnostics.schemaValid && parsed.diagnostics.failure === null && parsed.semantic.openObjectiveRelation === 'replaces',
        rawSha256: sha(raw),
        sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 },
    };
    fs.writeFileSync(path.join(artifactRoot, 'directed-b2.semantic-v4.report.json'), `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(report));
}

if (require.main === module) void main().catch(error => {
    console.error(JSON.stringify({ status: 'runner_error', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
});
