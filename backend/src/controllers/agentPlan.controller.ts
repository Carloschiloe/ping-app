// M-3 — Agent Plan controller. Mirrors agent.controller.ts's discipline
// exactly: reads req.user.id, delegates everything to the orchestrator, maps
// the result to the public shape, maps known errors to HTTP. No planning
// logic, no tool logic, no SQL lives here.
import { Request, Response } from 'express';
import { runAgentPlanning, resolveDeterministicRouting } from '../services/agentPlanOrchestrator.service';
import { toPublicAgentPlanResponse } from '../types/agentPlan';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { resolveAgentRequestInput } from '../services/agentInputEnvelope.service';

export const plan = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const traceId = generateTraceId();
        const resolved = resolveAgentRequestInput({ actorUserId, body: req.body, traceId });
        const envelope = resolved.envelope;
        const conversationId = envelope.conversationId ?? undefined;
        // Canonical routing (sección: "no duplicated routing logic") — the
        // exact same resolveDeterministicRouting agentTurn.service.ts and
        // agentAuthorization.service.ts's re-plan call, so a plan built here
        // and later re-derived at /agent/authorize always agree.
        const routing = await resolveDeterministicRouting(envelope.content, { actorUserId, conversationId });
        const result = await runAgentPlanning({
            actorUserId,
            input: envelope.content,
            conversationId,
            channel: envelope.surface,
            locale: envelope.locale ?? undefined,
            timezone: envelope.timeZone ?? undefined,
            traceId: envelope.provenance.traceId,
            inputEnvelope: envelope,
            contextReferents: resolved.referents,
        }, { resolvedObjective: routing.resolvedObjective });

        // Sección 9/44: draft/needs_clarification/ready_for_authorization son
        // TODAS respuestas válidas del planner (nunca un error) — siempre
        // HTTP 200. Ninguna de ellas implica que algo se ejecutó.
        res.status(200).json(toPublicAgentPlanResponse(result));
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'The planner could not process your request right now.' : error.message,
        });
    }
};
