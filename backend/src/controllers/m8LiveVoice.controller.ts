import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import {
    createM8LiveVoiceSession,
    getM8LiveVoiceTelemetry,
    recordM8LiveVoiceTelemetry,
} from '../services/m8LiveVoice.service';
import { getM8LiveVoiceClientHtml } from '../services/m8LiveVoiceClient.service';
import { sanitizeM8LiveVoiceError, traceM8LiveVoiceDiagnostic } from '../services/m8LiveVoiceDiagnostics.service';

export function client(_req: Request, res: Response): void {
    traceM8LiveVoiceDiagnostic('client_request');
    try {
        const html = getM8LiveVoiceClientHtml();
        traceM8LiveVoiceDiagnostic('client_served', { status: 200, contentLength: Buffer.byteLength(html), environment: process.env.PING_ENVIRONMENT });
        res.status(200).type('html').set('Cache-Control', 'no-store').send(html);
    } catch (error) {
        traceM8LiveVoiceDiagnostic('client_rejected', { status: error instanceof AppError ? error.statusCode : 404, ...sanitizeM8LiveVoiceError(error) });
        const status = error instanceof AppError ? error.statusCode : 404;
        res.status(status).send('Not found');
    }
}

export async function createSession(req: Request, res: Response): Promise<void> {
    traceM8LiveVoiceDiagnostic('session_request_received', {
        voiceSessionId: req.body?.voiceSessionId,
        deviceSessionId: req.body?.deviceSessionId,
        conversationPresent: typeof req.body?.conversationId === 'string',
        sdpLength: typeof req.body?.sdp === 'string' ? req.body.sdp.length : 0,
    });
    try {
        const result = await createM8LiveVoiceSession({ actorUserId: req.user!.id, request: req.body });
        traceM8LiveVoiceDiagnostic('session_accepted', {
            actorUserId: req.user!.id,
            voiceSessionId: req.body?.voiceSessionId,
            deviceSessionId: req.body?.deviceSessionId,
            sessionId: result.sessionId,
            provider: result.provider,
            model: result.model,
            status: 201,
        });
        res.status(201).json(result);
    } catch (error) {
        traceM8LiveVoiceDiagnostic('session_rejected', {
            actorUserId: req.user?.id,
            voiceSessionId: req.body?.voiceSessionId,
            deviceSessionId: req.body?.deviceSessionId,
            ...sanitizeM8LiveVoiceError(error),
        });
        const status = error instanceof AppError ? error.statusCode : 503;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice session failed' });
    }
}

export function telemetry(req: Request, res: Response): void {
    try {
        recordM8LiveVoiceTelemetry(req.user!.id, req.body);
        traceM8LiveVoiceDiagnostic('client_telemetry', {
            actorUserId: req.user!.id,
            voiceSessionId: req.body?.voiceSessionId,
            deviceSessionId: req.body?.deviceSessionId,
            clientEvent: req.body?.event,
            stage: req.body?.stage,
            detailCode: req.body?.detailCode,
            httpStatus: req.body?.httpStatus,
            sideEffects: req.body?.sideEffects,
        });
        res.status(202).json({ accepted: true });
    } catch (error) {
        traceM8LiveVoiceDiagnostic('telemetry_rejected', { ...sanitizeM8LiveVoiceError(error) });
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
