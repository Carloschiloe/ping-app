import { Request, Response } from 'express';
import { forgetUserFact, listUserFacts } from '../services/memoryFacts.service';
import { AppError } from '../utils/AppError';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function list(req: Request, res: Response): Promise<void> {
    try {
        res.json({ facts: await listUserFacts(req.user!.id) });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: 'Could not load what Vorian remembers.' });
    }
}

export async function forget(req: Request, res: Response): Promise<void> {
    const factId = String(req.params.id);
    if (!UUID_PATTERN.test(factId)) {
        res.status(400).json({ error: 'Invalid fact id.' });
        return;
    }
    try {
        const forgotten = await forgetUserFact(req.user!.id, factId);
        if (!forgotten) {
            res.status(404).json({ error: 'That fact does not exist.' });
            return;
        }
        res.json({ forgotten: true });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: 'Could not forget that fact.' });
    }
}
