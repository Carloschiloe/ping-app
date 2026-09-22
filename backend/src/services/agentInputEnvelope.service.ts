import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError';
import { getAgentSession } from './agentSession.service';
import { surfaceSupports, type AgentInputEnvelope, type AgentSurface, type ContextReferent } from '../types/agentInput';

const VOICE_INPUT_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_TOKEN_LENGTH = 24_000;

type VoiceInputTokenPayload = {
    version: 1;
    expiresAt: string;
    envelope: AgentInputEnvelope;
};

function signingKey(): string {
    const key = process.env.ENCRYPTION_KEY?.trim();
    if (!key) throw new AppError('Voice input signing is unavailable', 503);
    return key;
}

function signatureFor(encodedPayload: string): string {
    return createHmac('sha256', signingKey()).update(encodedPayload).digest('base64url');
}

function isVoiceEnvelope(value: unknown): value is AgentInputEnvelope {
    if (!value || typeof value !== 'object') return false;
    const envelope = value as AgentInputEnvelope;
    return envelope.modality === 'voice'
        && surfaceSupports(envelope.surface, 'voice_input')
        && typeof envelope.inputId === 'string'
        && typeof envelope.actorUserId === 'string'
        && typeof envelope.content === 'string'
        && envelope.content.trim().length > 0
        && envelope.content.length <= 2000
        && typeof envelope.audioRef === 'string'
        && typeof envelope.transcriptRef === 'string'
        && typeof envelope.agentSessionId === 'string'
        && typeof envelope.deviceSessionId === 'string'
        && envelope.provenance?.transcriptStatus === 'final';
}

export function issueVoiceInputToken(envelope: AgentInputEnvelope, now = new Date()): { token: string; expiresAt: string } {
    if (!isVoiceEnvelope(envelope)) throw new AppError('Only a final voice transcript can become an agent input', 422);
    const expiresAt = new Date(now.getTime() + VOICE_INPUT_TOKEN_TTL_MS).toISOString();
    const payload: VoiceInputTokenPayload = { version: 1, expiresAt, envelope };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return { token: `${encoded}.${signatureFor(encoded)}`, expiresAt };
}

export function verifyVoiceInputToken(token: string, actorUserId: string, now = new Date()): {
    envelope: AgentInputEnvelope;
    referents: ContextReferent[];
} {
    if (!token || token.length > MAX_TOKEN_LENGTH) throw new AppError('Invalid voice input token', 400);
    const [encoded, providedSignature, extra] = token.split('.');
    if (!encoded || !providedSignature || extra) throw new AppError('Invalid voice input token', 400);
    const expected = Buffer.from(signatureFor(encoded), 'base64url');
    const provided = Buffer.from(providedSignature, 'base64url');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        throw new AppError('Invalid voice input token', 403);
    }

    let payload: VoiceInputTokenPayload;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw new AppError('Invalid voice input token', 400);
    }
    if (payload.version !== 1 || !isVoiceEnvelope(payload.envelope) || !Number.isFinite(Date.parse(payload.expiresAt))) {
        throw new AppError('Invalid voice input token', 400);
    }
    if (Date.parse(payload.expiresAt) <= now.getTime()) throw new AppError('Voice input token expired', 410);
    if (payload.envelope.actorUserId !== actorUserId) throw new AppError('Voice input belongs to another actor', 403);

    const session = getAgentSession(
        payload.envelope.agentSessionId!,
        actorUserId,
        payload.envelope.deviceSessionId!,
        now,
    );
    return { envelope: payload.envelope, referents: session.referents };
}

export function createTextInputEnvelope(input: {
    actorUserId: string;
    content: string;
    conversationId?: string;
    channel?: string;
    locale?: string;
    timezone?: string;
    traceId: string;
    now?: Date;
}): AgentInputEnvelope {
    const surface = resolveTextSurface(input.channel);
    return {
        inputId: randomUUID(),
        actorUserId: input.actorUserId,
        surface,
        modality: 'text',
        content: input.content,
        audioRef: null,
        transcriptRef: null,
        conversationId: input.conversationId ?? null,
        agentSessionId: null,
        deviceSessionId: null,
        locale: input.locale ?? null,
        timeZone: input.timezone ?? null,
        capturedAt: (input.now ?? new Date()).toISOString(),
        explicitConsentContext: null,
        provenance: { traceId: input.traceId, transcriptStatus: null, provider: null, confidence: null },
    };
}

/**
 * A displayed transcript becomes a user-authored turn only after the user
 * presses Send. Keep the signed audio/transcript provenance for audit and
 * traceability, but change the semantic modality to text so a low-confidence
 * provider score cannot block text the user has explicitly reviewed (or
 * corrected). The signed token still proves the source belonged to this
 * actor and was a final transcript; it is not a client-provided bypass flag.
 */
export function createReviewedVoiceTextInputEnvelope(input: {
    actorUserId: string;
    content: string;
    reviewedVoiceInputToken: string;
    traceId: string;
    now?: Date;
}): { envelope: AgentInputEnvelope; referents: ContextReferent[] } {
    const verified = verifyVoiceInputToken(input.reviewedVoiceInputToken, input.actorUserId, input.now);
    const source = verified.envelope;
    const content = input.content.trim();
    if (!content) throw new AppError('Reviewed transcript text is required', 400);
    return {
        envelope: {
            ...source,
            inputId: randomUUID(),
            modality: 'text',
            content,
            capturedAt: (input.now ?? new Date()).toISOString(),
            provenance: {
                ...source.provenance,
                traceId: input.traceId,
                reviewedByUser: true,
                reviewedVoiceInputId: source.inputId,
            },
        },
        referents: verified.referents,
    };
}

/**
 * Canonical text-surface mapping shared by HTTP adapters and durable scope
 * construction. Unknown channels intentionally degrade to mobile_text until
 * a surface is explicitly admitted by the Core contract.
 */
export function resolveTextSurface(channel?: string): AgentSurface {
    return channel === 'web' ? 'web'
        : channel === 'desktop' ? 'desktop'
            : channel === 'tablet' ? 'tablet'
                : channel === 'car' ? 'car'
                    : channel === 'device' ? 'device'
                        : 'mobile_text';
}

export function resolveAgentRequestInput(input: {
    actorUserId: string;
    body: {
        input?: string;
        voiceInputToken?: string;
        reviewedVoiceInputToken?: string;
        conversationId?: string;
        channel?: string;
        locale?: string;
        timezone?: string;
    };
    traceId: string;
    now?: Date;
}): { envelope: AgentInputEnvelope; referents: ContextReferent[] } {
    if (input.body.voiceInputToken) return verifyVoiceInputToken(input.body.voiceInputToken, input.actorUserId, input.now);
    if (input.body.reviewedVoiceInputToken) {
        if (!input.body.input) throw new AppError('Reviewed transcript text is required', 400);
        return createReviewedVoiceTextInputEnvelope({
            actorUserId: input.actorUserId,
            content: input.body.input,
            reviewedVoiceInputToken: input.body.reviewedVoiceInputToken,
            traceId: input.traceId,
            now: input.now,
        });
    }
    if (!input.body.input) throw new AppError('Agent input is required', 400);
    return {
        envelope: createTextInputEnvelope({
            actorUserId: input.actorUserId,
            content: input.body.input,
            conversationId: input.body.conversationId,
            channel: input.body.channel,
            locale: input.body.locale,
            timezone: input.body.timezone,
            traceId: input.traceId,
            now: input.now,
        }),
        referents: [],
    };
}
