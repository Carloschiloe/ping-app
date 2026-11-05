import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';
import * as accountSafety from '../services/accountSafety.service';

function fail(res: Response, error: unknown, fallback: string): void {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({ error: statusCode === 500 ? fallback : (error as Error).message });
}

// POST /user/account/delete
export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        await accountSafety.deleteAccount(req.user!.id);
        res.json({ deleted: true });
    } catch (error) {
        fail(res, error, 'Unable to delete account');
    }
};

// GET /blocks
export const listBlocks = async (req: Request, res: Response): Promise<void> => {
    try {
        res.json({ blocks: await accountSafety.listBlocked(req.user!.id) });
    } catch (error) {
        fail(res, error, 'Unable to load blocks');
    }
};

// POST /blocks/:userId
export const block = async (req: Request, res: Response): Promise<void> => {
    try {
        await accountSafety.blockUser(req.user!.id, req.params.userId as string);
        res.json({ blocked: true });
    } catch (error) {
        fail(res, error, 'Unable to block');
    }
};

// DELETE /blocks/:userId
export const unblock = async (req: Request, res: Response): Promise<void> => {
    try {
        await accountSafety.unblockUser(req.user!.id, req.params.userId as string);
        res.json({ blocked: false });
    } catch (error) {
        fail(res, error, 'Unable to unblock');
    }
};

// GET /conversations/:id/block — whether this direct chat is blocked, either way
export const chatBlock = async (req: Request, res: Response): Promise<void> => {
    try {
        await assertConversationParticipant(req.user!.id, req.params.id as string);
        const block = await accountSafety.directChatBlock(req.user!.id, req.params.id as string);
        res.json(block);
    } catch (error) {
        fail(res, error, 'Unable to check chat');
    }
};

// POST /reports
export const report = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(201).json(await accountSafety.createReport(req.user!.id, req.body));
    } catch (error) {
        fail(res, error, 'Unable to save report');
    }
};

// POST /feedback
export const feedback = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(201).json(await accountSafety.createFeedback(req.user!.id, req.body));
    } catch (error) {
        fail(res, error, 'Unable to save feedback');
    }
};
