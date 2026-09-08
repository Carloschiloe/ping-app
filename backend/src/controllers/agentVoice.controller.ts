import { NextFunction, Request, Response } from 'express';
import { generateTraceId } from '../utils/overdueTrace';
import { AgentVoiceError, transcribeAgentVoiceCapture } from '../services/agentVoice.service';
import { TranscriptionProviderError } from '../services/transcription.service';
import { AppError } from '../utils/AppError';

export function agentVoiceRawBodyError(error: any, _req: Request, res: Response, next: NextFunction): void {
    if (error?.type === 'entity.too.large' || error?.status === 413) {
        res.status(413).json({ error: 'audio_too_large' });
        return;
    }
    next(error);
}

export async function transcribe(req: Request, res: Response): Promise<void> {
    try {
        const traceId = generateTraceId();
        const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const result = await transcribeAgentVoiceCapture({
            actorUserId: req.user!.id,
            bytes: req.body,
            mimeType,
            durationMs: Number(req.query.durationMs),
            capturedAt: String(req.query.capturedAt),
            voiceSessionId: String(req.query.voiceSessionId),
            deviceSessionId: String(req.query.deviceSessionId),
            surface: req.query.surface as any,
            locale: req.query.locale as string | undefined,
            timezone: req.query.timezone as string | undefined,
            activeScreen: req.query.activeScreen as string | undefined,
            currentConversationId: req.query.currentConversationId as string | undefined,
            currentCommitmentId: req.query.currentCommitmentId as string | undefined,
            explicitConsent: req.query.consent === 'explicit_user_action',
            traceId,
        });
        res.status(200).json({
            status: 'final',
            transcript: {
                transcriptId: result.transcript.transcriptId,
                audioRef: result.transcript.audioRef,
                text: result.transcript.text,
                language: result.transcript.language,
                confidence: result.transcript.confidence,
                provider: result.transcript.provider,
                observedAt: result.transcript.observedAt,
                source: result.transcript.source,
            },
            voiceInputToken: result.voiceInputToken,
            tokenExpiresAt: result.tokenExpiresAt,
            agentSessionId: result.agentSessionId,
        });
    } catch (error) {
        if (error instanceof AgentVoiceError) {
            res.status(error.statusCode).json({ error: error.code });
            return;
        }
        if (error instanceof TranscriptionProviderError) {
            const status = error.code === 'provider_rate_limited' ? 429
                : error.code === 'invalid_audio' || error.code === 'empty_transcript' ? 422
                    : 503;
            res.status(status).json({ error: error.code });
            return;
        }
        if (error instanceof AppError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }
        res.status(502).json({ error: 'transcription_failed' });
    }
}
