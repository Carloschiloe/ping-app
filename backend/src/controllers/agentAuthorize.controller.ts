// M-4 — Authorize controller. Mirrors agent.controller.ts/agentPlan.controller.ts's
// discipline: reads req.user.id, delegates everything, maps known errors to
// HTTP (sección 51). No planning/authorization LOGIC lives here.
import { Request, Response } from 'express';
import { z } from 'zod';
import { authorizePlan, revokeAuthorization } from '../services/agentAuthorization.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { resolveAgentRequestInput } from '../services/agentInputEnvelope.service';

const uuidParam = z.string().uuid();

const FAILURE_STATUS: Record<string, number> = {
    plan_changed: 409,
    not_authorized: 403,
    tool_not_executable: 422,
};

export const authorize = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const { planDigest, stepIds, confirm, strongConfirm } = req.body;
        const traceId = generateTraceId();
        const resolved = resolveAgentRequestInput({ actorUserId, body: req.body, traceId });
        const envelope = resolved.envelope;

        const result = await authorizePlan({
            actorUserId,
            input: envelope.content,
            conversationId: envelope.conversationId ?? undefined,
            channel: envelope.surface,
            locale: envelope.locale ?? undefined,
            timezone: envelope.timeZone ?? undefined,
            planDigest,
            requestedStepIds: stepIds,
            confirm,
            strongConfirm,
            traceId: envelope.provenance.traceId,
            inputEnvelope: envelope,
            contextReferents: resolved.referents,
        });

        if (!result.ok) {
            res.status(FAILURE_STATUS[result.failureCode] ?? 422).json({ error: result.message, failureCode: result.failureCode });
            return;
        }

        const a = result.authorization;
        res.status(200).json({
            authorizationId: a.id,
            status: a.status,
            expiresAt: a.expiresAt,
            authorizedStepIds: a.authorizedStepIds,
            confirmationLevel: a.confirmationLevel,
        });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Authorization could not be processed right now.' : error.message });
    }
};

export const revoke = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const parsedId = uuidParam.safeParse(req.params.authorizationId);
        if (!parsedId.success) {
            res.status(400).json({ error: 'Invalid authorizationId.' });
            return;
        }
        const authorizationId = parsedId.data;
        const traceId = generateTraceId();
        const authorization = await revokeAuthorization(authorizationId, actorUserId, traceId);
        res.status(200).json({ authorizationId: authorization.id, status: authorization.status });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Revocation could not be processed right now.' : error.message });
    }
};
