// M-8 — end-to-end proof that "recuerda que..." reaches a real,
// authorization-ready plan through the exact same runAgentTurn pipeline
// every other write request uses, via the REAL deterministic verb path
// (REMEMBER_FACT_VERB matches "recuerda que"/"acuérdate que"/"remember
// that") -- no LLM interpreter mock needed, mirroring
// agentDialogueTargetEntityClarification.test.ts's/
// agentDialoguePlanDateCorrection.test.ts's own pattern for this session's
// other new write-shaped mechanisms.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ingestMemoryFromEventMock } = vi.hoisted(() => ({ ingestMemoryFromEventMock: vi.fn() }));

vi.mock('../src/services/memory.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/services/memory.service')>();
    return {
        ...actual,
        ingestMemoryFromEvent: (...args: unknown[]) => ingestMemoryFromEventMock(...args),
    };
});

let runAgentTurn: typeof import('../src/services/agentTurn.service').runAgentTurn;
let clearAgentDialogueStateForTests: typeof import('../src/services/agentDialogueState.service').clearAgentDialogueStateForTests;

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(async () => {
    vi.resetModules();
    const turnModule = await import('../src/services/agentTurn.service');
    runAgentTurn = turnModule.runAgentTurn;
    const dialogueModule = await import('../src/services/agentDialogueState.service');
    clearAgentDialogueStateForTests = dialogueModule.clearAgentDialogueStateForTests;
    clearAgentDialogueStateForTests();
    ingestMemoryFromEventMock.mockReset();
}, 30000);

afterEach(() => {
    clearAgentDialogueStateForTests();
    vi.restoreAllMocks();
});

describe('runAgentTurn — "recuerda que..." reaches a real, authorization-ready remember_fact plan', () => {
    it('"Recuerda que mi hermano se llama Andrés" produces a ready_for_authorization plan targeting remember_fact, with no side effect yet (memory ingestion never called before authorization)', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Recuerda que mi hermano se llama Andrés', channel: 'mobile', locale: 'es-CL' });

        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') {
            expect(res.plan.status).toBe('ready_for_authorization');
            expect(res.plan.steps.map((s) => s.toolId)).toEqual(['remember_fact']);
            expect(res.presentation.requiresExplicitConfirmation).toBe(true);
            // Dedicated presentation copy (never the generic 'Confirmar'
            // default fallback), and never a leaked raw toolId/argument key
            // in user-facing text.
            const stepPresentation = res.presentation.stepPresentations[0];
            expect(stepPresentation.confirmationLabel).toBe('Recordar');
            expect(stepPresentation.effectDescription).toContain('mi hermano se llama Andrés');
        }
        // Planning alone must NEVER write memory -- only /agent/execute,
        // after explicit authorization, does. Same invariant every other
        // write tool already holds (plan !== authorization !== execution).
        expect(ingestMemoryFromEventMock).not.toHaveBeenCalled();
    });

    it('"Acuérdate que prefiero reuniones por la mañana" (alternate verb form) also plans correctly', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Acuérdate que prefiero reuniones por la mañana', channel: 'mobile', locale: 'es-CL' });
        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') expect(res.plan.steps.map((s) => s.toolId)).toEqual(['remember_fact']);
    });

    it('English "Remember that my brother\'s name is Andrew" also plans correctly (verb pattern covers both languages)', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Remember that my brother\'s name is Andrew', channel: 'mobile', locale: 'en-US' });
        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') expect(res.plan.steps.map((s) => s.toolId)).toEqual(['remember_fact']);
    });

    it('"Recuérdame comprar pan" (the pre-existing reminder-commitment verb) is UNAFFECTED -- still plans create_personal_commitment, never remember_fact', async () => {
        // Direct regression guard for the exact lexical-collision risk this
        // feature's own design explicitly worked to avoid (REMEMBER_FACT_VERB
        // requires the "que"/"that" clause; PERSONAL_REMINDER_VERB requires
        // the reflexive "-me" suffix -- the two share the "recuerd-" stem but
        // must never cross-match).
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Recuérdame comprar pan mañana', channel: 'mobile', locale: 'es-CL' });
        expect(res.kind).toBe('plan');
        if (res.kind === 'plan') expect(res.plan.steps.map((s) => s.toolId)).toEqual(['create_commitment']);
    });

    it('"Recuerda que" alone (no fact content) produces a clarification asking what to remember, never an empty-content plan', async () => {
        const res = await runAgentTurn({ actorUserId: ACTOR, input: 'Recuerda que', channel: 'mobile', locale: 'es-CL' });
        expect(res.kind).toBe('clarification');
        if (res.kind === 'clarification') {
            expect(res.questions[0].field).toBe('factContent');
        }
    });
});
