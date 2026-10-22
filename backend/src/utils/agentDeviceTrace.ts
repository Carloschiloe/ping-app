// PING — opt-in device trace for local diagnostics only.
//
// Physical evidence (two independent real-device reproductions) disagrees
// with every unit/module-mock/HTTP-boundary test written so far, all of
// which pass. It is deliberately opt-in and disabled in production.
//
// Safety invariants (non-negotiable, matches the existing traceOverdue/
// traceProposal/tracePlan convention in this codebase):
//   - never logs raw access tokens, emails, phone numbers, or full message
//     content
//   - actorUserId is stored ONLY as a truncated SHA-256 hash
//   - bounded ring buffer (MAX_ENTRIES) -- never unbounded growth, never
//     persisted to disk/DB, wiped on process restart
//   - console.log output mirrors the existing [PING_PLAN_TRACE] convention
//     (so it is also visible in local logs), in addition to the bounded
//     in-memory buffer used by unit diagnostics.
import { createHash } from 'crypto';
import { getEnvConfig } from '../config/env';

const MAX_ENTRIES = 50;

export interface AgentDeviceTraceEntry {
    traceId: string;
    at: string;
    label: string;
    data: Record<string, unknown>;
}

export interface AgentDeviceDebugMetadata {
    traceId: string;
    dialogueScopeKey: string | null;
    stateFound: boolean;
    dialogueLifecycle: string | null;
    pendingClarificationField: string | null;
    openObjectiveType: string | null;
    dialogueVersion: number | null;
    turnSequence: number | null;
    clarificationAttempted: boolean;
    clarificationOutcome: string | null;
    routingDecision: string | null;
    personCandidateCount: number | null;
    responseKind: string | null;
    sourceRefCount: number | null;
}

const buffer: AgentDeviceTraceEntry[] = [];

export function isAgentDeviceTraceEnabled(): boolean {
    return getEnvConfig().environmentName !== 'production'
        && process.env.PING_AGENT_DEVICE_TRACE === 'true';
}

// Truncated (first 16 hex chars) SHA-256 -- enough to correlate the SAME
// actor across two requests in the trace output, never enough to be
// reversed into a usable identifier, and never the raw UUID itself.
export function hashForTrace(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function traceAgentDevice(traceId: string, label: string, data: Record<string, unknown>): void {
    if (!isAgentDeviceTraceEnabled()) return;
    try {
        const entry: AgentDeviceTraceEntry = { traceId, at: new Date().toISOString(), label, data };
        buffer.push(entry);
        while (buffer.length > MAX_ENTRIES) buffer.shift();
        // eslint-disable-next-line no-console
        console.log(`[PING_DEVICE_TRACE][${traceId}][${label}]`, JSON.stringify(data));
    } catch {
        // eslint-disable-next-line no-console
        console.log(`[PING_DEVICE_TRACE][${traceId}][${label}] (unserializable payload)`);
    }
}

// Read-only snapshot for the bounded debug endpoint -- newest last, exactly
// as recorded; the endpoint layer decides pagination/formatting.
export function getAgentDeviceTraceBuffer(): readonly AgentDeviceTraceEntry[] {
    return buffer;
}

export function getAgentDeviceDebugMetadata(traceId: string): AgentDeviceDebugMetadata | undefined {
    if (!isAgentDeviceTraceEnabled()) return undefined;
    const entries = buffer.filter((entry) => entry.traceId === traceId);
    if (entries.length === 0) return undefined;
    const dataFor = (label: string) => entries.findLast((entry) => entry.label === label)?.data ?? {};
    const state = dataFor('AGENT_DIALOGUE_STATE_BEFORE');
    const writeResult = dataFor('AGENT_DIALOGUE_STATE_WRITE_RESULT');
    const context = dataFor('AGENT_CONTEXT_RESULT');
    const pending = dataFor('AGENT_PENDING_CLARIFICATION_RESULT');
    const routing = entries.filter((entry) => entry.label === 'AGENT_ROUTING_DECISION').at(-1)?.data ?? {};
    const response = dataFor('AGENT_RESPONSE_KIND');
    const numberOrNull = (value: unknown): number | null => typeof value === 'number' ? value : null;
    return {
        traceId,
        dialogueScopeKey: (dataFor('AGENT_DIALOGUE_SCOPE').dialogueScopeKey as string | undefined) ?? null,
        stateFound: state.stateFound === true,
        dialogueLifecycle: (writeResult.lifecycle ?? state.lifecycle ?? null) as string | null,
        pendingClarificationField: (writeResult.pendingClarificationField ?? state.pendingClarificationField ?? null) as string | null,
        openObjectiveType: (writeResult.openObjectiveType ?? state.openObjectiveType ?? null) as string | null,
        dialogueVersion: numberOrNull(writeResult.version ?? state.version),
        turnSequence: numberOrNull(writeResult.lastTurnSequence ?? state.lastTurnSequence),
        clarificationAttempted: entries.some((entry) => entry.label === 'AGENT_PENDING_CLARIFICATION_RESULT'),
        clarificationOutcome: (pending.outcome as string | undefined) ?? null,
        routingDecision: (routing.path as string | undefined) ?? null,
        personCandidateCount: numberOrNull(pending.candidateCount ?? context.resolvedPersonCandidateCount),
        responseKind: (response.kind as string | undefined) ?? null,
        sourceRefCount: numberOrNull(context.sourceRefCount),
    };
}

export function clearAgentDeviceTraceBufferForTests(): void {
    buffer.length = 0;
}
