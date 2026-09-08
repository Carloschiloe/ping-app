import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';
import { buildCommitmentVisibilityFilter, getParticipantProposalIds } from '../utils/commitmentVisibility';
import { traceContext } from '../utils/voiceTrace';
import type {
    AgentSession,
    AgentSurface,
    ContextReferent,
    ContextSensitivity,
    ContextSignal,
    ContextSignalType,
    VoiceSessionState,
} from '../types/agentInput';

export const AGENT_SESSION_TTL_MS = 15 * 60 * 1000;
export const MAX_AGENT_SESSIONS = 500;

const SIGNAL_TTL_MS: Record<ContextSignalType, number> = {
    active_screen: 2 * 60 * 1000,
    current_conversation: 15 * 60 * 1000,
    current_commitment: 5 * 60 * 1000,
    device_type: 24 * 60 * 60 * 1000,
    timezone: 24 * 60 * 60 * 1000,
    network_state: 60 * 1000,
};

const SIGNAL_META: Record<ContextSignalType, { contextClass: ContextSignal['contextClass']; sensitivity: ContextSensitivity }> = {
    active_screen: { contextClass: 'session', sensitivity: 'low' },
    current_conversation: { contextClass: 'session', sensitivity: 'medium' },
    current_commitment: { contextClass: 'session', sensitivity: 'medium' },
    device_type: { contextClass: 'device', sensitivity: 'low' },
    timezone: { contextClass: 'device', sensitivity: 'low' },
    network_state: { contextClass: 'device', sensitivity: 'medium' },
};

const ALLOWED_ACTIVE_SCREENS = new Set(['agent_preview', 'chat', 'today', 'commitments', 'profile']);
const ALLOWED_DEVICE_TYPES = new Set(['phone', 'tablet', 'desktop', 'car', 'device']);
const ALLOWED_NETWORK_STATES = new Set(['online', 'offline', 'unknown']);

export interface ContextSignalCandidate {
    signalType: ContextSignalType;
    value: string;
    capturedAt: string;
    permissionBasis?: ContextSignal['permissionBasis'];
    sensitivity?: ContextSensitivity;
}

export interface ContextAuthorizationDependencies {
    assertConversation?: (actorUserId: string, conversationId: string) => Promise<unknown>;
    assertCommitment?: (actorUserId: string, commitmentId: string) => Promise<unknown>;
}

const sessions = new Map<string, AgentSession>();

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidTimeZone(value: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

function validateSignalValue(candidate: ContextSignalCandidate): void {
    const { signalType, value } = candidate;
    if (!value || value.length > 120) throw new AppError('Invalid context signal value', 400);
    if ((signalType === 'current_conversation' || signalType === 'current_commitment') && !isUuid(value)) {
        throw new AppError('Invalid canonical context reference', 400);
    }
    if (signalType === 'active_screen' && !ALLOWED_ACTIVE_SCREENS.has(value)) throw new AppError('Unsupported active screen context', 400);
    if (signalType === 'device_type' && !ALLOWED_DEVICE_TYPES.has(value)) throw new AppError('Unsupported device context', 400);
    if (signalType === 'network_state' && !ALLOWED_NETWORK_STATES.has(value)) throw new AppError('Unsupported network context', 400);
    if (signalType === 'timezone' && !isValidTimeZone(value)) throw new AppError('Invalid timezone context', 400);
}

async function assertVisibleCommitment(actorUserId: string, commitmentId: string): Promise<void> {
    const participantProposalIds = await getParticipantProposalIds(actorUserId);
    const visibilityFilter = buildCommitmentVisibilityFilter(actorUserId, participantProposalIds);
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select('id')
        .eq('id', commitmentId)
        .or(visibilityFilter)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Context commitment is unavailable or unauthorized', 403);
}

export async function acceptContextSignals(input: {
    actorUserId: string;
    deviceSessionId: string;
    sourceTurnId: string;
    candidates: ContextSignalCandidate[];
    now?: Date;
    traceId?: string;
}, dependencies: ContextAuthorizationDependencies = {}): Promise<{
    signals: ContextSignal[];
    referents: ContextReferent[];
    rejectedCount: number;
    expiredCount: number;
}> {
    const now = input.now ?? new Date();
    const assertConversation = dependencies.assertConversation ?? assertConversationParticipant;
    const assertCommitment = dependencies.assertCommitment ?? assertVisibleCommitment;
    const signals: ContextSignal[] = [];
    const referents: ContextReferent[] = [];
    let rejectedCount = 0;
    let expiredCount = 0;

    for (const candidate of input.candidates) {
        const meta = SIGNAL_META[candidate.signalType];
        if (!meta || candidate.sensitivity === 'high') {
            rejectedCount += 1;
            throw new AppError('High-sensitivity or unknown context is not accepted in M-5', 400);
        }
        if (!candidate.permissionBasis) {
            rejectedCount += 1;
            throw new AppError('Context permission basis is required', 400);
        }
        validateSignalValue(candidate);
        const capturedAt = new Date(candidate.capturedAt);
        if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > now.getTime() + 60_000) {
            throw new AppError('Invalid context capture time', 400);
        }
        const expiresAt = new Date(capturedAt.getTime() + SIGNAL_TTL_MS[candidate.signalType]);
        if (expiresAt.getTime() <= now.getTime()) {
            expiredCount += 1;
            continue;
        }
        if (candidate.signalType === 'current_conversation') await assertConversation(input.actorUserId, candidate.value);
        if (candidate.signalType === 'current_commitment') await assertCommitment(input.actorUserId, candidate.value);

        const signal: ContextSignal = {
            signalType: candidate.signalType,
            value: candidate.value,
            source: 'client_session',
            contextClass: meta.contextClass,
            capturedAt: capturedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            confidence: 1,
            sensitivity: meta.sensitivity,
            permissionBasis: candidate.permissionBasis,
            provenance: { deviceSessionId: input.deviceSessionId, actorUserId: input.actorUserId },
        };
        signals.push(signal);
        if (candidate.signalType === 'current_conversation' || candidate.signalType === 'current_commitment') {
            referents.push({
                referentType: 'current_entity',
                canonicalEntityType: candidate.signalType === 'current_commitment' ? 'commitment' : 'conversation',
                canonicalEntityId: candidate.value,
                sourceTurnId: input.sourceTurnId,
                confidence: 1,
                expiresAt: expiresAt.toISOString(),
                actorScope: input.actorUserId,
                resolvedFromSignal: candidate.signalType,
            });
        }
    }

    traceContext(input.traceId, 'CONTEXT_ACCEPTED', {
        signalTypes: signals.map((signal) => signal.signalType),
        acceptedCount: signals.length,
        rejectedCount,
        expiredCount,
        canonicalRefCount: referents.length,
    });
    return { signals, referents, rejectedCount, expiredCount };
}

function pruneSessions(now: Date): void {
    for (const [id, session] of sessions) {
        if (Date.parse(session.expiresAt) <= now.getTime()) sessions.delete(id);
    }
    while (sessions.size >= MAX_AGENT_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (!oldest) break;
        sessions.delete(oldest);
    }
}

export function createAgentSession(input: {
    actorUserId: string;
    deviceSessionId: string;
    surface: AgentSurface;
    voiceSessionId?: string;
    signals: ContextSignal[];
    referents: ContextReferent[];
    now?: Date;
}): AgentSession {
    const now = input.now ?? new Date();
    pruneSessions(now);
    const session: AgentSession = {
        sessionId: randomUUID(),
        actorUserId: input.actorUserId,
        deviceSessionId: input.deviceSessionId,
        surface: input.surface,
        startedAt: now.toISOString(),
        lastInteractionAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + AGENT_SESSION_TTL_MS).toISOString(),
        voiceSessionId: input.voiceSessionId ?? null,
        signals: input.signals,
        referents: input.referents,
    };
    sessions.set(session.sessionId, session);
    return session;
}

export function getAgentSession(sessionId: string, actorUserId: string, deviceSessionId: string, now = new Date()): AgentSession {
    pruneSessions(now);
    const session = sessions.get(sessionId);
    if (!session || session.actorUserId !== actorUserId || session.deviceSessionId !== deviceSessionId) {
        throw new AppError('Agent session is unavailable or belongs to another actor/device', 403);
    }
    const freshSignals = session.signals.filter((signal) => Date.parse(signal.expiresAt) > now.getTime());
    const freshReferents = session.referents.filter((referent) => Date.parse(referent.expiresAt) > now.getTime());
    const refreshed = { ...session, lastInteractionAt: now.toISOString(), signals: freshSignals, referents: freshReferents };
    sessions.set(sessionId, refreshed);
    return refreshed;
}

const VOICE_TRANSITIONS: Record<VoiceSessionState, VoiceSessionState[]> = {
    idle: ['listening', 'cancelled'],
    listening: ['capturing', 'cancelled', 'failed'],
    capturing: ['transcribing', 'cancelled', 'failed'],
    transcribing: ['interpreting', 'cancelled', 'failed'],
    interpreting: ['responding', 'ended', 'cancelled', 'failed'],
    responding: ['ended', 'cancelled', 'failed'],
    ended: [],
    cancelled: [],
    failed: [],
};

export function transitionVoiceSession(current: VoiceSessionState, next: VoiceSessionState): VoiceSessionState {
    if (!VOICE_TRANSITIONS[current].includes(next)) throw new AppError(`Invalid voice session transition: ${current} -> ${next}`, 409);
    return next;
}

export function clearAgentSessionsForTests(): void {
    sessions.clear();
}
