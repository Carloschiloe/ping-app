import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { assertConversationParticipant } from '../utils/authz';
import { AppError } from '../utils/AppError';
import type { AgentTurnResult } from '../types/agentTurn';
import type { AgentExecutionResult } from '../types/agentExecution';
import type { AgentPlanPresentation } from '../types/agentTurn';
import type { AgentReadContext } from '../types/agentDialogueState';
import { isCanonicalCommitmentStatus } from '../utils/commitmentStatus';

const MAX_HISTORY_INPUT_LENGTH = 12_000;
const MAX_HISTORY_RESULT_BYTES = 128_000;
const MAX_PERSISTENCE_ATTEMPTS = 3;
const PERSISTENCE_RETRY_DELAYS_MS = [50, 150] as const;

export interface AgentConversationTurnRecord {
    id: string;
    conversationId: string;
    actorUserId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    resultKind: AgentTurnResult['kind'] | 'execution';
    result: AgentConversationEventResult;
    createdAt: string;
}

export interface AgentExecutionConversationEvent {
    kind: 'execution';
    execution: AgentExecutionResult;
    presentation: AgentPlanPresentation;
}

export type AgentConversationEventResult = AgentTurnResult | AgentExecutionConversationEvent;
export type AgentConversationEventKind = AgentTurnResult['kind'] | 'execution';

export interface AgentConversationHistoryProjection {
    conversationId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    resultKind: AgentConversationEventKind;
    result: AgentConversationEventResult;
    requestFingerprint: string;
}

/**
 * The actor self-chat is the durable storage projection for the main Ping
 * surface. It must never be mistaken for the semantic conversation scope
 * used when the turn is re-authorized after a restart or on another device.
 * Keep this metadata inside the persisted result so it works without a
 * production schema migration and remains backwards-compatible with older
 * rows that do not have it.
 */
export interface AgentConversationHistoryMetadata {
    dialogueConversationId: string | null;
    /** Durable scope needed to continue temporal/status follow-ups after restart. */
    readContext?: {
        timeRange: AgentReadContext['timeRange'];
        statuses: AgentReadContext['statuses'];
    } | null;
}

const HISTORY_METADATA_KEY = '__pingAgentHistory' as const;

function addHistoryMetadata(
    result: AgentConversationEventResult,
    dialogueConversationId: string | undefined,
    readContext?: AgentReadContext | null,
): AgentConversationEventResult {
    const copy = { ...(result as unknown as Record<string, unknown>) };
    const metadata: AgentConversationHistoryMetadata = {
        dialogueConversationId: dialogueConversationId?.trim() || null,
    };
    if (readContext) {
        metadata.readContext = {
            timeRange: readContext.timeRange,
            statuses: readContext.statuses ?? null,
        };
    }
    copy[HISTORY_METADATA_KEY] = metadata;
    return copy as unknown as AgentConversationEventResult;
}

export function isAgentConversationTurnPersistenceEnabled(): boolean {
    return process.env.PING_ENABLE_AGENT_CONVERSATION_EVENTS === 'true';
}

function publicResult(result: AgentConversationEventResult): AgentConversationEventResult {
    // Debug metadata is useful for device certification but is not part of the
    // durable conversation history. Keeping it out also avoids storing traces
    // that can contain implementation details or provider metadata.
    const copy = { ...(result as unknown as Record<string, unknown>) };
    delete copy.debug;
    return copy as unknown as AgentConversationEventResult;
}

function fingerprint(inputText: string, inputMode: string, result: AgentConversationEventResult): string {
    const stableResult = { ...(result as unknown as Record<string, unknown>) };
    const metadata = stableResult[HISTORY_METADATA_KEY];
    if (metadata && typeof metadata === 'object') {
        // Read-scope metadata is an internal projection and can be added by a
        // later retry without changing the user's actual turn. Keep the
        // pre-existing dialogueConversationId in the fingerprint for backward
        // compatibility with rows written before this field existed.
        stableResult[HISTORY_METADATA_KEY] = {
            ...(metadata as Record<string, unknown>),
        };
        delete (stableResult[HISTORY_METADATA_KEY] as Record<string, unknown>).readContext;
    }
    return createHash('sha256')
        .update(JSON.stringify({ inputText, inputMode, result: publicResult(stableResult as unknown as AgentConversationEventResult) }))
        .digest('hex');
}

/**
 * Builds the exact bounded projection used by the history RPC. Durable turns
 * use this before the checkpoint RPC so the checkpoint and visible history row
 * can commit in the same database transaction.
 */
export function buildAgentConversationHistoryProjection(input: {
    conversationId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    result: AgentConversationEventResult;
    dialogueConversationId?: string;
}): AgentConversationHistoryProjection {
    const inputText = input.inputText.trim();
    const result = addHistoryMetadata(publicResult(input.result), input.dialogueConversationId);
    return {
        conversationId: input.conversationId,
        clientTurnKey: input.clientTurnKey.trim(),
        inputText,
        inputMode: input.inputMode,
        resultKind: input.result.kind,
        result,
        requestFingerprint: fingerprint(inputText, input.inputMode, result),
    };
}

function mapPersistenceError(error: { message?: string; code?: string } | null): AppError {
    if (error?.code === '42501') return new AppError('You do not have access to this conversation', 403);
    if (error?.code === 'P0003') return new AppError('This Agent turn key was already used with different content', 409);
    if (error?.code === '22023' || error?.code === '23514') return new AppError('Invalid Agent conversation event', 400);
    return new AppError('Could not persist the Agent conversation event', 500);
}

function isTransientPersistenceError(error: { message?: string; code?: string } | null): boolean {
    const code = error?.code ?? '';
    if (['P0003', '22023', '23514', '42501'].includes(code)) return false;
    if (/^(08|40|53|57)/.test(code)) return true;
    return /fetch failed|network|timeout|timed out|connection reset|connection refused|temporarily unavailable|service unavailable/i
        .test(error?.message ?? '');
}

async function waitForPersistenceRetry(attempt: number): Promise<void> {
    const delay = PERSISTENCE_RETRY_DELAYS_MS[attempt - 1];
    if (delay === undefined) return;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

async function persistAgentConversationEvent(input: {
    actorUserId: string;
    conversationId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    resultKind: AgentConversationEventKind;
    result: AgentConversationEventResult;
    dialogueConversationId?: string;
    readContext?: AgentReadContext | null;
}): Promise<{ turnId: string; idempotentReplay: boolean; createdAt: string }> {
    await assertConversationParticipant(input.actorUserId, input.conversationId);

    const inputText = input.inputText.trim();
    if (!inputText || inputText.length > MAX_HISTORY_INPUT_LENGTH || !input.clientTurnKey.trim()) {
        throw new AppError('Invalid Agent conversation event', 400);
    }

    const result = addHistoryMetadata(
        publicResult(input.result),
        input.dialogueConversationId,
        input.readContext,
    );
    const serializedResult = JSON.stringify(result);
    if (Buffer.byteLength(serializedResult, 'utf8') > MAX_HISTORY_RESULT_BYTES) {
        throw new AppError('Agent conversation event is too large', 400);
    }

    const rpcArgs = {
        p_actor_user_id: input.actorUserId,
        p_conversation_id: input.conversationId,
        p_client_turn_key: input.clientTurnKey.trim(),
        p_request_fingerprint: fingerprint(inputText, input.inputMode, result),
        p_input_text: inputText,
        p_input_mode: input.inputMode,
        p_result_kind: input.resultKind,
        p_result: result,
    };

    let data: any = null;
    let error: { message?: string; code?: string } | null = null;
    for (let attempt = 1; attempt <= MAX_PERSISTENCE_ATTEMPTS; attempt += 1) {
        const response = await supabaseAdmin.rpc('persist_agent_conversation_turn', rpcArgs);
        data = response.data;
        error = response.error;
        if (!error || !isTransientPersistenceError(error) || attempt === MAX_PERSISTENCE_ATTEMPTS) break;
        await waitForPersistenceRetry(attempt);
    }

    if (error) throw mapPersistenceError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.turn_id || !row?.created_at) throw new AppError('Invalid Agent conversation event response', 500);
    return {
        turnId: row.turn_id,
        idempotentReplay: row.idempotent_replay === true,
        createdAt: row.created_at,
    };
}

export async function persistAgentConversationTurn(input: {
    actorUserId: string;
    conversationId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    result: AgentTurnResult;
    /** Semantic scope; null/undefined means the main Ping `agent:mobile` scope. */
    dialogueConversationId?: string;
    /** Core-derived read scope used only to restore safe temporal/status continuity. */
    readContext?: AgentReadContext | null;
}) {
    return persistAgentConversationEvent({ ...input, resultKind: input.result.kind });
}

export async function persistAgentExecutionConversationEvent(input: {
    actorUserId: string;
    conversationId: string;
    sourceTurnKey: string;
    execution: AgentExecutionResult;
}) {
    await assertConversationParticipant(input.actorUserId, input.conversationId);
    let source: any = null;
    let sourceError: { message?: string; code?: string } | null = null;
    for (let attempt = 1; attempt <= MAX_PERSISTENCE_ATTEMPTS; attempt += 1) {
        const response = await supabaseAdmin
            .from('agent_conversation_turns')
            .select('input_text, input_mode, result, conversations!inner(deleted_at)')
            .eq('conversation_id', input.conversationId)
            .eq('actor_user_id', input.actorUserId)
            .eq('client_turn_key', input.sourceTurnKey)
            .is('conversations.deleted_at', null)
            .maybeSingle();
        source = response.data;
        sourceError = response.error;
        if (!sourceError || !isTransientPersistenceError(sourceError) || attempt === MAX_PERSISTENCE_ATTEMPTS) break;
        await waitForPersistenceRetry(attempt);
    }
    if (sourceError) throw new AppError('Could not resolve the source Agent turn', 500);
    if (!source || source.result?.kind !== 'plan' || !source.result.presentation) {
        throw new AppError('The source Agent plan was not found', 409);
    }

    return persistAgentConversationEvent({
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        clientTurnKey: `${input.sourceTurnKey}:execution`,
        inputText: source.input_text,
        inputMode: source.input_mode,
        resultKind: 'execution',
        result: {
            kind: 'execution',
            execution: input.execution,
            presentation: source.result.presentation,
        },
    });
}

export async function listAgentConversationTurns(
    actorUserId: string,
    conversationId: string,
    limit = 100,
): Promise<AgentConversationTurnRecord[]> {
    await assertConversationParticipant(actorUserId, conversationId);
    const { data, error } = await supabaseAdmin
        .from('agent_conversation_turns')
        .select('id, conversation_id, actor_user_id, client_turn_key, input_text, input_mode, result_kind, result, created_at, conversations!inner(deleted_at, agent_history_cleared_at)')
        .eq('conversation_id', conversationId)
        .eq('actor_user_id', actorUserId)
        .is('conversations.deleted_at', null)
        // Load the newest bounded window, then restore chronological order for
        // the mobile renderer. Ordering ascending before applying the limit
        // returned the oldest 200 turns and silently hid the active tail of a
        // long-lived conversation.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 200));

    if (error) throw new AppError('Could not load the Agent conversation history', 500);
    return (data || [])
        .filter((row: any) => !isClearedAgentHistoryRow(row))
        .map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        actorUserId: row.actor_user_id,
        clientTurnKey: row.client_turn_key,
        inputText: row.input_text,
        inputMode: row.input_mode,
        resultKind: row.result_kind,
        result: row.result,
        createdAt: row.created_at,
        }))
        .reverse();
}

function isClearedAgentHistoryRow(row: any): boolean {
    const clearedAt = row?.conversations?.agent_history_cleared_at;
    if (typeof clearedAt !== 'string' || !clearedAt.trim()) return false;
    const createdAtMs = Date.parse(String(row?.created_at ?? ''));
    const clearedAtMs = Date.parse(clearedAt);
    return Number.isFinite(createdAtMs) && Number.isFinite(clearedAtMs) && createdAtMs <= clearedAtMs;
}

/**
 * Clears only the visible Agent projection. Durable event rows remain for
 * audit/recovery; the cutoff never deletes commitments, messages, or evidence.
 */
export async function clearAgentConversationHistory(
    actorUserId: string,
    conversationId: string,
    dialogueScopeKey = conversationId,
): Promise<{ clearedAt: string }> {
    await assertConversationParticipant(actorUserId, conversationId);
    const normalizedScope = dialogueScopeKey.trim();
    if (normalizedScope !== conversationId && normalizedScope !== 'agent:mobile') {
        throw new AppError('Invalid Agent dialogue scope', 400);
    }
    const { data, error } = await supabaseAdmin.rpc('clear_agent_conversation_history', {
        p_actor_user_id: actorUserId,
        p_conversation_id: conversationId,
        p_dialogue_scope_key: normalizedScope,
    });
    if (error) {
        if (error.code === '42501') throw new AppError('You do not have access to this conversation', 403);
        throw new AppError('Could not clear the Agent conversation history', 500);
    }
    const clearedAt = Array.isArray(data) ? data[0] : data;
    if (typeof clearedAt !== 'string' || !Number.isFinite(Date.parse(clearedAt))) {
        throw new AppError('Invalid Agent conversation clear response', 500);
    }
    return { clearedAt };
}

/**
 * Rehydrates only the bounded read referent needed for a natural follow-up
 * after a process restart. The persisted event is advisory continuity, never
 * evidence or authorization: Agent Core must re-query the canonical entity
 * under the current actor before answering.
 */
export async function loadLatestAgentReadContext(
    actorUserId: string,
    conversationId: string,
): Promise<AgentReadContext | null> {
    await assertConversationParticipant(actorUserId, conversationId);
    let data: any[] | null = null;
    let error: { message?: string; code?: string } | null = null;
    for (let attempt = 1; attempt <= MAX_PERSISTENCE_ATTEMPTS; attempt += 1) {
        const response = await supabaseAdmin
            .from('agent_conversation_turns')
            .select('id, result, result_kind, created_at, conversations!inner(deleted_at, agent_history_cleared_at)')
            .eq('conversation_id', conversationId)
            .eq('actor_user_id', actorUserId)
            .eq('result_kind', 'response')
            .is('conversations.deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(12);
        data = response.data;
        error = response.error;
        if (!error || !isTransientPersistenceError(error) || attempt === MAX_PERSISTENCE_ATTEMPTS) break;
        await waitForPersistenceRetry(attempt);
    }

    if (error) throw new AppError('Could not load the Agent read context', 500);

    for (const row of data || []) {
        if (isClearedAgentHistoryRow(row)) continue;
        const result = row?.result as Record<string, unknown> | null;
        const response = result?.kind === 'response'
            ? result.response as Record<string, unknown> | null
            : null;
        if (!response || response.status !== 'answered' || !Array.isArray(response.citations)) continue;

        const metadata = result?.[HISTORY_METADATA_KEY] as Record<string, unknown> | null;
        const storedReadContext = metadata?.readContext as Record<string, unknown> | null;
        const storedTimeRange = storedReadContext?.timeRange as Record<string, unknown> | null;
        const timeRange = storedTimeRange
            && (storedTimeRange.from === null || typeof storedTimeRange.from === 'string')
            && (storedTimeRange.to === null || typeof storedTimeRange.to === 'string')
            && (storedTimeRange.from === null || Number.isFinite(Date.parse(storedTimeRange.from)))
            && (storedTimeRange.to === null || Number.isFinite(Date.parse(storedTimeRange.to)))
            ? { from: (storedTimeRange.from as string | null) ?? undefined, to: (storedTimeRange.to as string | null) ?? undefined }
            : null;
        const statuses = Array.isArray(storedReadContext?.statuses)
            ? storedReadContext.statuses.filter(isCanonicalCommitmentStatus)
            : null;

        const referents = response.citations
            .filter((citation: unknown): citation is { sourceType: string; sourceId: string } => {
                if (!citation || typeof citation !== 'object') return false;
                const value = citation as Record<string, unknown>;
                return (value.sourceType === 'commitment' || value.sourceType === 'commitment_proposal')
                    && typeof value.sourceId === 'string'
                    && value.sourceId.length > 0;
            })
            .slice(0, 10)
            .map((citation) => ({
                rawText: '',
                entityType: citation.sourceType as 'commitment' | 'commitment_proposal',
                canonicalId: citation.sourceId,
            }));

        if (referents.length === 0 && !timeRange && (!statuses || statuses.length === 0)) continue;
        return {
            kind: 'commitment_query',
            timeRange,
            sourceTurnId: String(row.id),
            commitmentReferents: referents,
            statuses: statuses && statuses.length > 0 ? statuses : null,
        };
    }

    return null;
}
