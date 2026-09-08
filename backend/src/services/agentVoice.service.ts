import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { AppError } from '../utils/AppError';
import {
    getDefaultTranscriptionProvider,
    TranscriptionProviderError,
    type TranscriptionProvider,
    type TranscriptionProviderResult,
} from './transcription.service';
import { acceptContextSignals, createAgentSession, type ContextSignalCandidate } from './agentSession.service';
import { issueVoiceInputToken } from './agentInputEnvelope.service';
import { traceContext, traceVoice } from '../utils/voiceTrace';
import type { AgentInputEnvelope, AgentSurface, CanonicalTranscript } from '../types/agentInput';

export const MAX_AGENT_VOICE_BYTES = 10 * 1024 * 1024;
export const MAX_AGENT_VOICE_DURATION_MS = 2 * 60 * 1000;
export const MIN_AGENT_VOICE_DURATION_MS = 250;
export const LOW_CONFIDENCE_ACTION_THRESHOLD = 0.65;

export const AGENT_VOICE_MIME_TYPES = new Set([
    'audio/aac',
    'audio/m4a',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
]);

const MIME_EXTENSIONS: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
};

export class AgentVoiceError extends AppError {
    constructor(public readonly code: string, statusCode: number) {
        super(code, statusCode);
        this.name = 'AgentVoiceError';
    }
}

export interface AgentVoiceCaptureInput {
    actorUserId: string;
    bytes: Buffer;
    mimeType: string;
    durationMs: number;
    capturedAt: string;
    voiceSessionId: string;
    deviceSessionId: string;
    surface: AgentSurface;
    locale?: string;
    timezone?: string;
    activeScreen?: string;
    currentConversationId?: string;
    currentCommitmentId?: string;
    explicitConsent: boolean;
    traceId: string;
}

function durationBucket(durationMs: number): string {
    if (durationMs <= 15_000) return '0-15s';
    if (durationMs <= 60_000) return '16-60s';
    return '61-120s';
}

function validateProviderResult(result: TranscriptionProviderResult): void {
    if (!result || result.status !== 'final' || typeof result.text !== 'string') {
        throw new AgentVoiceError('malformed_provider_response', 502);
    }
    const text = result.text.trim();
    if (!text) throw new AgentVoiceError('empty_transcript', 422);
    if (text.length > 2000) throw new AgentVoiceError('transcript_too_large', 422);
    if (result.confidence !== null && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1)) {
        throw new AgentVoiceError('malformed_provider_response', 502);
    }
    if (result.languageDetected !== null && (typeof result.languageDetected !== 'string' || result.languageDetected.length > 20)) {
        throw new AgentVoiceError('malformed_provider_response', 502);
    }
    if (result.segments !== null && (!Array.isArray(result.segments) || result.segments.length > 200)) {
        throw new AgentVoiceError('malformed_provider_response', 502);
    }
}

function languageHint(locale?: string): string | undefined {
    const language = locale?.split(/[-_]/)[0]?.toLowerCase();
    return language && /^[a-z]{2,3}$/.test(language) ? language : undefined;
}

function contextCandidates(input: AgentVoiceCaptureInput): ContextSignalCandidate[] {
    const candidates: ContextSignalCandidate[] = [
        { signalType: 'active_screen', value: input.activeScreen || 'agent_preview', capturedAt: input.capturedAt, permissionBasis: 'foreground_session' },
        { signalType: 'device_type', value: input.surface === 'tablet' ? 'tablet' : input.surface === 'desktop' || input.surface === 'web' ? 'desktop' : input.surface === 'car' ? 'car' : input.surface === 'device' ? 'device' : 'phone', capturedAt: input.capturedAt, permissionBasis: 'foreground_session' },
    ];
    if (input.timezone) candidates.push({ signalType: 'timezone', value: input.timezone, capturedAt: input.capturedAt, permissionBasis: 'foreground_session' });
    if (input.currentConversationId) candidates.push({ signalType: 'current_conversation', value: input.currentConversationId, capturedAt: input.capturedAt, permissionBasis: 'foreground_session' });
    if (input.currentCommitmentId) candidates.push({ signalType: 'current_commitment', value: input.currentCommitmentId, capturedAt: input.capturedAt, permissionBasis: 'foreground_session' });
    return candidates;
}

export async function transcribeAgentVoiceCapture(
    input: AgentVoiceCaptureInput,
    options: { provider?: TranscriptionProvider; now?: Date } = {},
): Promise<{
    transcript: CanonicalTranscript;
    envelope: AgentInputEnvelope;
    voiceInputToken: string;
    tokenExpiresAt: string;
    agentSessionId: string;
}> {
    const now = options.now ?? new Date();
    if (!input.explicitConsent) throw new AgentVoiceError('explicit_consent_required', 400);
    if (!AGENT_VOICE_MIME_TYPES.has(input.mimeType)) throw new AgentVoiceError('unsupported_audio', 415);
    if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) throw new AgentVoiceError('empty_audio', 400);
    if (input.bytes.length > MAX_AGENT_VOICE_BYTES) throw new AgentVoiceError('audio_too_large', 413);
    if (!Number.isFinite(input.durationMs) || input.durationMs < MIN_AGENT_VOICE_DURATION_MS || input.durationMs > MAX_AGENT_VOICE_DURATION_MS) {
        throw new AgentVoiceError('invalid_audio_duration', 400);
    }
    const capturedAt = new Date(input.capturedAt);
    if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > now.getTime() + 60_000) {
        throw new AgentVoiceError('invalid_capture_time', 400);
    }

    const acceptedContext = await acceptContextSignals({
        actorUserId: input.actorUserId,
        deviceSessionId: input.deviceSessionId,
        sourceTurnId: input.voiceSessionId,
        candidates: contextCandidates(input),
        now,
        traceId: input.traceId,
    });
    const session = createAgentSession({
        actorUserId: input.actorUserId,
        deviceSessionId: input.deviceSessionId,
        surface: input.surface,
        voiceSessionId: input.voiceSessionId,
        signals: acceptedContext.signals,
        referents: acceptedContext.referents,
        now,
    });

    const provider = options.provider ?? getDefaultTranscriptionProvider();
    const audioRef = randomUUID();
    const temporaryFile = join(tmpdir(), `ping_voice_${audioRef}_${randomUUID()}.${MIME_EXTENSIONS[input.mimeType]}`);
    traceVoice(input.traceId, 'CAPTURE_ACCEPTED', {
        voiceSessionId: input.voiceSessionId,
        inputId: audioRef,
        surface: input.surface,
        captureStatus: 'transcribing',
        transcriptionStatus: 'pending',
        audioDurationBucket: durationBucket(input.durationMs),
        provider: provider.providerId,
        agentMode: 'batch',
    });

    try {
        await writeFile(temporaryFile, input.bytes, { flag: 'wx' });
        const result = await provider.transcribe({
            filePath: temporaryFile,
            mimeType: input.mimeType,
            languageHint: languageHint(input.locale),
        });
        validateProviderResult(result);

        const transcript: CanonicalTranscript = {
            transcriptId: randomUUID(),
            audioRef,
            actorUserId: input.actorUserId,
            language: result.languageDetected ?? languageHint(input.locale) ?? null,
            segments: result.segments,
            confidence: result.confidence,
            provider: provider.providerId,
            model: provider.modelId,
            observedAt: now.toISOString(),
            source: 'agent_voice',
            status: 'final',
            text: result.text.trim(),
            provenance: {
                voiceSessionId: input.voiceSessionId,
                capturedAt: capturedAt.toISOString(),
                explicitConsent: true,
            },
        };
        const currentConversation = acceptedContext.signals.find((signal) => signal.signalType === 'current_conversation')?.value ?? null;
        const envelope: AgentInputEnvelope = {
            inputId: randomUUID(),
            actorUserId: input.actorUserId,
            surface: input.surface,
            modality: 'voice',
            content: transcript.text,
            audioRef,
            transcriptRef: transcript.transcriptId,
            conversationId: currentConversation,
            agentSessionId: session.sessionId,
            deviceSessionId: input.deviceSessionId,
            locale: input.locale ?? null,
            timeZone: input.timezone ?? null,
            capturedAt: capturedAt.toISOString(),
            explicitConsentContext: { captureInitiatedBy: 'user_action', voiceAuthorizationAllowed: false },
            provenance: {
                traceId: input.traceId,
                transcriptStatus: 'final',
                provider: provider.providerId,
                confidence: result.confidence,
            },
        };
        const signed = issueVoiceInputToken(envelope, now);
        traceVoice(input.traceId, 'TRANSCRIPTION_COMPLETED', {
            voiceSessionId: input.voiceSessionId,
            inputId: envelope.inputId,
            surface: input.surface,
            captureStatus: 'ended',
            transcriptionStatus: 'final',
            language: transcript.language,
            audioDurationBucket: durationBucket(input.durationMs),
            provider: provider.providerId,
            agentMode: 'batch',
        });
        traceContext(input.traceId, 'SESSION_CREATED', {
            sessionId: session.sessionId,
            signalTypes: session.signals.map((signal) => signal.signalType),
            acceptedCount: session.signals.length,
            rejectedCount: acceptedContext.rejectedCount,
            expiredCount: acceptedContext.expiredCount,
            canonicalRefCount: session.referents.length,
        });
        return { transcript, envelope, voiceInputToken: signed.token, tokenExpiresAt: signed.expiresAt, agentSessionId: session.sessionId };
    } catch (error) {
        const code = error instanceof AgentVoiceError || error instanceof TranscriptionProviderError ? error.code : 'transcription_failed';
        traceVoice(input.traceId, 'TRANSCRIPTION_FAILED', {
            voiceSessionId: input.voiceSessionId,
            inputId: audioRef,
            surface: input.surface,
            captureStatus: 'failed',
            transcriptionStatus: 'failed',
            audioDurationBucket: durationBucket(input.durationMs),
            provider: provider.providerId,
            agentMode: 'batch',
            errorCode: code,
        });
        if (error instanceof AgentVoiceError || error instanceof TranscriptionProviderError || error instanceof AppError) throw error;
        throw new AgentVoiceError('transcription_failed', 502);
    } finally {
        await unlink(temporaryFile).catch(() => undefined);
    }
}
