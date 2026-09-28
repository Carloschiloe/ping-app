import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import {
    createM8LiveVoiceSession,
    getM8LiveVoiceTelemetry,
    recordM8LiveVoiceTelemetry,
} from '../services/m8LiveVoice.service';
import { getM8LiveVoiceClientHtml } from '../services/m8LiveVoiceClient.service';

export function client(_req: Request, res: Response): void {
    try {
        res.status(200).type('html').set('Cache-Control', 'no-store').send(getM8LiveVoiceClientHtml());
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 404;
        res.status(status).send('Not found');
    }
}

export async function createSession(req: Request, res: Response): Promise<void> {
    try {
        const result = await createM8LiveVoiceSession({ actorUserId: req.user!.id, request: req.body });
        res.status(201).json(result);
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 503;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice session failed' });
    }
}

export function telemetry(req: Request, res: Response): void {
    try {
        recordM8LiveVoiceTelemetry(req.user!.id, req.body);
        res.status(202).json({ accepted: true });
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}

export function readTelemetry(req: Request, res: Response): void {
    try {
        res.status(200).json(getM8LiveVoiceTelemetry(req.user!.id, String(req.params.voiceSessionId)));
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}
