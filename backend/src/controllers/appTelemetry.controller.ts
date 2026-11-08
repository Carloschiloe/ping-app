import { Request, Response } from 'express';
import * as telemetry from '../services/appTelemetry.service';

// POST /app/hello — the app was opened on this phone
export const hello = async (req: Request, res: Response): Promise<void> => {
    try {
        await telemetry.recordInstall(req.user!.id, req.body);
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Unable to save' });
    }
};

// POST /app/errors — something failed inside the app
export const appError = async (req: Request, res: Response): Promise<void> => {
    try {
        await telemetry.recordError({ source: 'app', ...req.body, userId: req.user!.id });
        res.status(201).json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Unable to save' });
    }
};
