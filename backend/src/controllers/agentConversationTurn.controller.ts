import { Request, Response } from 'express';
import {
    isAgentConversationTurnPersistenceEnabled,
    listAgentConversationTurns,
} from '../services/agentConversationTurn.service';
import { AppError } from '../utils/AppError';

export async function list(req: Request, res: Response): Promise<void> {
    if (!isAgentConversationTurnPersistenceEnabled()) {
        res.json({ enabled: false, turns: [] });
        return;
    }

    try {
        const turns = await listAgentConversationTurns(req.user!.id, String(req.params.id));
        res.json({ enabled: true, turns });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'Could not load the Agent conversation history.' : error.message,
        });
    }
}
