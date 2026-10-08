import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductSemanticInterpreters, providerRequestCount, totalTokenUsage, estimateProviderCost } from '../certification/production-semantic-harness';

const runReal = process.env.PING_RUN_REAL_SEMANTIC_CERTIFICATION === '1';

vi.mock('../src/services/retrieval.service', async importOriginal => {
    const actual = await importOriginal<typeof import('../src/services/retrieval.service')>();
    return { ...actual, resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })), resolveDirectConversation: vi.fn(async () => ({ conversationId: null, ambiguous: false, candidateCount: 0 })), retrieveCommitments: vi.fn(async () => []), retrieveCommitmentProposals: vi.fn(async () => []), retrieveCommitmentEvents: vi.fn(async () => []), retrieveMessages: vi.fn(async () => []), retrieveTranscriptions: vi.fn(async () => []), retrieveAttachments: vi.fn(async () => []), retrieveVisibleCommitmentById: vi.fn(async () => null), dedupeProvenance: (items: unknown[]) => items };
});
vi.mock('../src/services/memory.service', () => ({ retrieveMemory: vi.fn(async () => []), ingestMemoryFromEvent: vi.fn(async () => undefined) }));

describe('production semantic GPT-6 certification harness', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps the certification seam offline by default', () => {
        const telemetry = { input: [], objective: [] };
        const configured = createProductSemanticInterpreters('gpt-6-luna', telemetry);
        expect(configured.inputInterpreter).toBeDefined();
        expect(configured.objectiveInterpreter).toBeDefined();
        expect(providerRequestCount(telemetry)).toBe(0);
        expect(totalTokenUsage(telemetry)).toEqual({ inputTokens: null, outputTokens: null, reasoningTokens: null, cachedInputTokens: null });
        expect(estimateProviderCost(telemetry, { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 })).toBeNull();
    });

    it.runIf(runReal)('runs M02 through the real product route with no fallback', async () => {
        process.env.PING_ENVIRONMENT = 'local';
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        const { AgentDialogueStateService, buildDialogueScopeKey } = await import('../src/services/agentDialogueState.service');
        const actorUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const telemetry = { input: [], objective: [] };
        const interpreters = createProductSemanticInterpreters('gpt-6-luna', telemetry);
        const dialogueService = new AgentDialogueStateService();
        const options = { dialogueService, inputInterpreter: interpreters.inputInterpreter, objectiveInterpreter: interpreters.objectiveInterpreter, now: new Date('2026-10-08T12:00:00.000Z') };
        const first = await runAgentTurn({ actorUserId, input: 'Anota revisar las v\u00e1lvulas el viernes.', channel: 'mobile' }, options);
        const scope = buildDialogueScopeKey({ surface: 'mobile_text' });
        const firstState = dialogueService.getSnapshot(actorUserId, scope);
        const second = await runAgentTurn({ actorUserId, input: 'Mejor el s\u00e1bado.', channel: 'mobile' }, options);
        const secondState = dialogueService.getSnapshot(actorUserId, scope);
        expect(first.kind).toBe('plan'); expect(second.kind).toBe('plan');
        expect(firstState?.lifecycle).toBe('plan_pending_authorization');
        expect(secondState?.lifecycle).toBe('plan_pending_authorization');
        expect(secondState?.openObjective?.targetEntities.entityHints).toEqual(firstState?.openObjective?.targetEntities.entityHints);
        expect(secondState?.openObjective?.timeConstraints.rawHint).toContain('s\u00e1bado');
        expect(firstState?.currentPlanDigestRef).not.toBe(secondState?.currentPlanDigestRef);
        expect(providerRequestCount(telemetry)).toBeLessThanOrEqual(3);
        expect(telemetry.input.every(call => !call.fallbackUsed)).toBe(true);
        expect(telemetry.objective.every(call => !call.fallbackUsed)).toBe(true);
        const artifactPath = process.env.PING_SEMANTIC_CERTIFICATION_ARTIFACT ?? 'C:\\Users\\carlo\\AppData\\Local\\Temp\\ping-production-semantic-certification.json';
        const artifact = { source: 'production_semantic_authority', modelRequested: 'gpt-6-luna', turns: [{ turn: 1, resultKind: first.kind, state: firstState }, { turn: 2, resultKind: second.kind, state: secondState }], providerTelemetry: telemetry, providerRequestCount: providerRequestCount(telemetry), usage: totalTokenUsage(telemetry), estimatedCostUsd: estimateProviderCost(telemetry, { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 }) };
        const fs = await import('node:fs/promises'); await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
        const readback = JSON.parse(await fs.readFile(artifactPath, 'utf8')) as typeof artifact;
        expect(readback.providerRequestCount).toBe(artifact.providerRequestCount);
    });
});
