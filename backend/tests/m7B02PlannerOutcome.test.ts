import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';
import { runAgentPlanning } from '../src/services/agentPlanOrchestrator.service';

if (process.env.M7_B02_REAL_LLM === '1') dotenv.config();

const REAL_LLM = process.env.M7_B02_REAL_LLM === '1';
const ACTOR = '00000000-0000-0000-0000-000000000001';
const B02 = 'Déjame agendado revisar el medidor el jueves a primera hora.';

/**
 * B02 is a planner-outcome check, not another generalization battery. It
 * reuses the corrected blind expression and proves the safety boundary:
 * WRITE may produce a plan or clarification, but Core may not invent a
 * participant and this test never authorizes or executes the plan.
 */
describe.skipIf(!REAL_LLM)('M-7 B02 planner outcome', () => {
    it('reaches planning and keeps participant resolution canonical', async () => {
        const semantic = await interpretAgentSemanticTurn(B02, { actorUserId: ACTOR, channel: 'mobile' });
        expect(semantic.route).toBe('write');
        expect(semantic.objective).not.toBeNull();

        const plan = await runAgentPlanning({
            actorUserId: ACTOR,
            input: B02,
            channel: 'mobile',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            now: new Date('2026-09-22T12:00:00.000Z'),
            preloadedCommitments: [],
        }, { resolvedObjective: semantic.objective! });

        console.log('M7_B02_PLAN_RESULT', {
            status: plan.status,
            objectiveType: plan.objective.objectiveType,
            stepCount: plan.steps.length,
            responsiblePersonIds: plan.steps.map((step) => step.arguments.responsiblePersonId ?? null),
            requiredConfirmations: plan.requiredConfirmations,
        });

        expect(['ready_for_authorization', 'needs_clarification']).toContain(plan.status);
        expect(plan.objective.source).toBe(semantic.objective!.source);
        expect(plan.steps).toHaveLength(plan.status === 'ready_for_authorization' ? 1 : 0);
        expect(plan.steps.every((step) => step.toolId === 'create_commitment')).toBe(true);
        expect(plan.steps.every((step) => step.arguments.responsiblePersonId === null)).toBe(true);
        // AgentPlanStep exposes the resolved participant through arguments;
        // `isShared` is an internal planning input, not a persisted step
        // field. A null responsiblePersonId is the verifiable no-invention
        // contract at this boundary.
        expect(plan.steps.every((step) => !step.arguments.responsiblePersonId)).toBe(true);
        expect(plan.status === 'needs_clarification' ? plan.unresolvedInputs.length : plan.requiredConfirmations.length).toBeGreaterThan(0);
    }, 900000);
});
