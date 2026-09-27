import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { parseSemanticV4ModelOutput } from '../src/services/canonicalSemanticProducer.service';
import { runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000111';
const CLOCK = new Date('2026-09-27T15:00:00.000Z');
const sourceRoot = path.resolve(process.env.M7_DIRECTED_SOURCE_ROOT ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'real-ledger-directed-20260927'));
const v4Root = path.resolve(process.env.M7_DIRECTED_B2_ARTIFACT_ROOT ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'real-ledger-directed-b2-20260927-v4'));
const priorPath = path.join(sourceRoot, 'conversation-00000000-0000-4000-8000-000000000111-turn-1.final.json');
const legacyPath = path.join(sourceRoot, 'conversation-00000000-0000-4000-8000-000000000111-turn-2.final.json');
const rawPath = path.join(v4Root, 'directed-b2.semantic-v4.raw.json');

function commitment(id: string, title: string, conversationId: string): any {
    return { id, entityType: 'commitment', title, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: '2026-10-01T20:00:00.000Z', proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null,
        rejectionReason: null, ownerUserId: ACTOR, assignedToUserId: null, counterpartyContactId: null, conversationId, messageId: null,
        createdAt: '2026-09-27T10:00:00.000Z', provenance: { sourceType: 'commitment', sourceId: id }, authorizedActorUserIds: [ACTOR] };
}

function repository(): any {
    return createHighFidelityReadOnlyRepositoryForTest({
        commitments: [commitment('00000000-0000-4000-8000-000000000112', 'llamar al proveedor', CONVERSATION_ID)],
        people: [],
    });
}

async function main(): Promise<void> {
    const prior = JSON.parse(fs.readFileSync(priorPath, 'utf8'));
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8')).legacySemanticNormalized;
    const raw = fs.readFileSync(rawPath, 'utf8');
    const parsed = parseSemanticV4ModelOutput(raw);
    if (!parsed.diagnostics.schemaValid || parsed.diagnostics.failure) throw new Error('PERSISTED_V4_OUTPUT_INVALID');
    if (parsed.semantic.openObjectiveRelation !== 'replaces') throw new Error(`V4_SWITCH_NOT_EXPRESSED=${parsed.semantic.openObjectiveRelation}`);

    const state = prior.dialogueStateAfter;
    const dialogue = {
        lifecycle: state.lifecycle,
        activeDialogue: state.openObjective,
        suspendedDialogue: null,
        version: state.version,
        lastAppliedTurnId: null,
        lastAppliedTurnSequence: state.lastTurnSequence,
    };
    const shadow = await runSemanticV4CoreShadow({
        legacy: legacy,
        request: { text: 'Cambiemos eso por revisar el inventario.', modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: null },
        dialogue,
        actorUserId: ACTOR,
        dialogueScopeKey: CONVERSATION_ID,
        turnReferenceInstant: CLOCK.toISOString(),
        semanticResult: {
            semantic: parsed.semantic,
            diagnostics: {
                schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false,
                providerErrorClass: null, providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null,
                finishReason: 'stop', refusalPresent: false, contentPresent: true, contentLength: raw.length,
                normalizationSuccess: true, fallbackReason: null, model: 'gpt-5.6-sol', latencyMs: 0,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
            },
        },
        resolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repository()),
    });
    const report = {
        sourceV4Artifact: rawPath,
        replayOpenAiCalls: 0,
        mainResult: { kind: 'shadow_replay', disposition: shadow.core.disposition },
        shadow: { core: shadow.core, actualSideEffect: shadow.sideEffects },
        after: { lifecycle: state.lifecycle, openObjective: state.openObjective, pendingClarification: state.pendingClarification, lastTurnSequence: state.lastTurnSequence },
        sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 },
    };
    fs.writeFileSync(path.join(v4Root, 'directed-b2.core-replay.report.json'), `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(report));
}

if (require.main === module) void main().catch(error => {
    console.error(JSON.stringify({ status: 'core_replay_error', name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
});
