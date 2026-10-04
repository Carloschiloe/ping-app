import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AppError } from '../utils/AppError';
import {
    createM8LiveVoiceSession,
    getLatestM8LiveVoiceTelemetry,
    getLatestM8LiveVoiceTelemetryInternal,
    getM8LiveVoiceTelemetry,
    recordM8LiveVoiceTelemetry,
} from '../services/m8LiveVoice.service';
import {
    assertInternalM8LiveVoiceDiagnostics,
    M8_LIVE_VOICE_DIAGNOSTIC_SIGNATURE_HEADER,
    M8_LIVE_VOICE_DIAGNOSTIC_TIMESTAMP_HEADER,
} from '../services/m8LiveVoiceInternalDiagnostics.service';
import { getM8LiveVoiceClientHtml } from '../services/m8LiveVoiceClient.service';
import { sanitizeM8LiveVoiceError, traceM8LiveVoiceDiagnostic } from '../services/m8LiveVoiceDiagnostics.service';

export function client(_req: Request, res: Response): void {
    traceM8LiveVoiceDiagnostic('client_request');
    try {
        const scriptNonce = randomBytes(16).toString('hex');
        const html = getM8LiveVoiceClientHtml(scriptNonce);
        traceM8LiveVoiceDiagnostic('client_served', { status: 200, contentLength: Buffer.byteLength(html), environment: process.env.PING_ENVIRONMENT });
        res.status(200).type('html')
            .set('Cache-Control', 'no-store')
            .set('Content-Security-Policy', `default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' 'nonce-${scriptNonce}'; script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; upgrade-insecure-requests`)
            .send(html);
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
        const diagnostic = sanitizeM8LiveVoiceError(error);
        res.status(status).json({
            error: error instanceof AppError ? error.message : 'Live voice session failed',
            diagnostic: {
                errorCode: diagnostic.errorCode,
                httpStatus: diagnostic.httpStatus,
                providerErrorType: diagnostic.providerErrorType,
                providerErrorMessage: diagnostic.providerErrorMessage,
            },
        });
    }
}

export async function telemetry(req: Request, res: Response): Promise<void> {
    try {
        await recordM8LiveVoiceTelemetry(req.user!.id, req.body);
        traceM8LiveVoiceDiagnostic('client_telemetry', {
            actorUserId: req.user!.id,
            voiceSessionId: req.body?.voiceSessionId,
            deviceSessionId: req.body?.deviceSessionId,
            clientEvent: req.body?.event,
            stage: req.body?.stage,
            detailCode: req.body?.detailCode,
            httpStatus: req.body?.httpStatus,
            latencyMs: req.body?.latencyMs,
            turnId: req.body?.turnId,
            turnSequence: req.body?.turnSequence,
            responseCreateCount: req.body?.responseCreateCount,
            audioResponseCount: req.body?.audioResponseCount,
            cancelCause: req.body?.cancelCause,
            assistantSpeaking: req.body?.assistantSpeaking,
            coreResultReady: req.body?.coreResultReady,
            selfAudioCaptureSuspected: req.body?.selfAudioCaptureSuspected,
            vadState: req.body?.vadState,
            webrtcState: req.body?.webrtcState,
            iceState: req.body?.iceState,
            audioState: req.body?.audioState,
            sideEffects: req.body?.sideEffects,
        });
        res.status(202).json({ accepted: true });
    } catch (error) {
        traceM8LiveVoiceDiagnostic('telemetry_rejected', { ...sanitizeM8LiveVoiceError(error) });
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}

export async function readTelemetry(req: Request, res: Response): Promise<void> {
    try {
        res.status(200).json(await getM8LiveVoiceTelemetry(req.user!.id, String(req.params.voiceSessionId)));
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}

export async function readLatestTelemetry(req: Request, res: Response): Promise<void> {
    try {
        res.status(200).json(await getLatestM8LiveVoiceTelemetry(req.user!.id));
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}

export async function readLatestTelemetryInternal(req: Request, res: Response): Promise<void> {
    try {
        assertInternalM8LiveVoiceDiagnostics(
            req.header(M8_LIVE_VOICE_DIAGNOSTIC_TIMESTAMP_HEADER),
            req.header(M8_LIVE_VOICE_DIAGNOSTIC_SIGNATURE_HEADER),
        );
        res.status(200).json(await getLatestM8LiveVoiceTelemetryInternal());
    } catch (error) {
        const status = error instanceof AppError ? error.statusCode : 500;
        res.status(status).json({ error: error instanceof AppError ? error.message : 'Live voice telemetry failed' });
    }
}
