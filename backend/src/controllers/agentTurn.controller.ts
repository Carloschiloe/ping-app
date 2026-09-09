// M-6 — Agent Turn Controller. Single unified entry point for mobile.
// Mirrors agent.controller.ts discipline: reads req.user.id, delegates to service,
// maps result to discriminated union, maps known errors to HTTP.
import { Request, Response } from 'express';
import { runAgentTurn } from '../services/agentTurn.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';

export async function turn(req: Request, res: Response): Promise<void> {
    try {
        const actorUserId = req.user!.id;
        const traceId = generateTraceId();

        const result = await runAgentTurn({
            actorUserId,
            input: req.body.input,
            voiceInputToken: req.body.voiceInputToken,
            conversationId: req.body.conversationId,
            channel: req.body.channel,
            locale: req.body.locale,
            timezone: req.body.timezone,
            traceId,
        });

        // All valid turn results are HTTP 200 — the kind discriminator tells mobile what to render
        res.status(200).json(result);
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'The agent could not process your request right now.' : error.message,
        });
    }
}
