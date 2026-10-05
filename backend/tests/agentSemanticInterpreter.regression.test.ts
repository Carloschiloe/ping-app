import { describe, expect, it, vi } from 'vitest';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';
import type { Interpretation } from '../src/types/agentContext';
import type { AgentObjective } from '../src/types/agentPlan';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function llmWriteInterpretation(): Interpretation {
    return {
        intent: 'commitment_query',
        intentConfidence: 0.9,
        personHints: [],
        topicHints: [],
        textQuery: null,
        timeExpression: null,
        statusHints: null,
        requestedTransition: null,
        wantsCommitments: true,
        wantsMessages: false,
        wantsTranscriptions: false,
        wantsAttachments: false,
        wantsOverdueFocus: false,
        proposalFocus: null,
        isWriteActionRequest: true,
        ambiguityHints: [],
        source: 'llm',
        modelUsed: 'test-fake',
    };
}

function llmReadCommitmentInterpretation(): Interpretation {
    return {
        ...llmWriteInterpretation(),
        isWriteActionRequest: false,
        source: 'llm',
    };
}

function personalCommitmentObjective(): AgentObjective {
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: [], entityHints: ['revisar el inventario'] },
        constraints: { commitmentOwnership: 'personal' },
        desiredOutcome: 'revisar el inventario',
        timeConstraints: { rawHint: 'el lunes' },
        actor: ACTOR,
        sourceUtterance: 'Tengo pendiente revisar el inventario el lunes.',
        confidence: 0.8,
        ambiguities: [],
        source: 'llm',
    };
}

function rememberFactObjective(): AgentObjective {
    return {
        objectiveType: 'remember_fact',
        targetEntities: { personHints: [], entityHints: ['revisi\u00f3n del inventario'] },
        constraints: {},
        desiredOutcome: 'revisi\u00f3n del inventario',
        timeConstraints: { rawHint: null },
        actor: ACTOR,
        sourceUtterance: 'Volvamos a la revisi\u00f3n del inventario; \u00bfqu\u00e9 fecha tiene?',
        confidence: 0.8,
        ambiguities: [],
        source: 'llm',
    };
}

describe('semantic boundary read/write regression', () => {
    it('admits a declarative personal commitment through the normal WRITE planner route', async () => {
        const objectiveInterpreter = { interpret: vi.fn(async () => personalCommitmentObjective()) };
        const result = await interpretAgentSemanticTurn(
            'Tengo pendiente revisar el inventario el lunes.',
            { actorUserId: ACTOR, conversationId: 'conversation-regression' },
            {
                inputInterpreter: { interpret: vi.fn(async () => llmReadCommitmentInterpretation()) },
                objectiveInterpreter,
            },
        );

        expect(result.route).toBe('write');
        expect(result.objective?.objectiveType).toBe('create_personal_commitment');
        expect(objectiveInterpreter.interpret).toHaveBeenCalledOnce();
    });

    it('keeps a novel attribute question on the READ route', async () => {
        const objectiveInterpreter = { interpret: vi.fn(async () => rememberFactObjective()) };
        const result = await interpretAgentSemanticTurn(
            'Volvamos a la revisi\u00f3n del inventario; \u00bfqu\u00e9 fecha tiene?',
            { actorUserId: ACTOR, conversationId: 'conversation-regression' },
            {
                inputInterpreter: { interpret: vi.fn(async () => llmWriteInterpretation()) },
                objectiveInterpreter,
            },
        );

        expect(result.route).toBe('read');
        expect(result.objective).toBeNull();
        expect(objectiveInterpreter.interpret).not.toHaveBeenCalled();
    });

    it('passes pending-plan context to the objective interpreter before Core classifies confirmation, deferral, or replacement', async () => {
        const objectiveInterpreter = {
            interpret: vi.fn(async (_input: string, context: {
                pendingPlan?: { objectiveType: string };
                activeObjective?: { lifecycle: string; objectiveType: string };
            }) => {
                expect(context.pendingPlan).toEqual({ objectiveType: 'create_personal_commitment' });
                expect(context.activeObjective).toMatchObject({
                    lifecycle: 'plan_pending_authorization',
                    objectiveType: 'create_personal_commitment',
                });
                return rememberFactObjective();
            }),
        };
        const result = await interpretAgentSemanticTurn(
            'No lo hagas todavía; prefiero dejarlo pendiente.',
            {
                actorUserId: ACTOR,
                conversationId: 'conversation-regression',
                pendingPlan: { objectiveType: 'create_personal_commitment' },
                activeObjective: {
                    lifecycle: 'plan_pending_authorization',
                    objectiveType: 'create_personal_commitment',
                },
            },
            {
                inputInterpreter: { interpret: vi.fn(async () => llmWriteInterpretation()) },
                objectiveInterpreter,
            },
        );

        expect(result.route).toBe('write');
        expect(objectiveInterpreter.interpret).toHaveBeenCalledOnce();
    });
});
