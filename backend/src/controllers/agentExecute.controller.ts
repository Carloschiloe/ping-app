// M-4 — Execute controller. Input is ONLY an authorizationId (sección 3/38)
// — no direct model access, no tool args from the client. Every valid
// execution outcome (done/partially_done/waiting/failed) is HTTP 200 —
// these are real, honest results, never errors (sección 69, same principle
// as agent.controller.ts's needs_clarification/no_evidence).
import { Request, Response } from 'express';
import { executeAuthorization } from '../services/agentExecution.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';

export const execute = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const { authorizationId } = req.body;
        const traceId = generateTraceId();

        const result = await executeAuthorization({ authorizationId, actorUserId, traceId });
        res.status(200).json(result);
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Execution could not be processed right now.' : error.message });
    }
};
