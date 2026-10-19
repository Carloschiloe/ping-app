import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { assertConversationParticipant } from '../utils/authz';
import { AppError } from '../utils/AppError';
import type { AgentTurnResult } from '../types/agentTurn';
import type { AgentExecutionResult } from '../types/agentExecution';
import type { AgentPlanPresentation } from '../types/agentTurn';

const MAX_HISTORY_INPUT_LENGTH = 12_000;
const MAX_HISTORY_RESULT_BYTES = 128_000;

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
    return createHash('sha256')
        .update(JSON.stringify({ inputText, inputMode, result: publicResult(result) }))
        .digest('hex');
}

function mapPersistenceError(error: { message?: string; code?: string } | null): AppError {
    if (error?.code === '42501') return new AppError('You do not have access to this conversation', 403);
    if (error?.code === 'P0003') return new AppError('This Agent turn key was already used with different content', 409);
    if (error?.code === '22023' || error?.code === '23514') return new AppError('Invalid Agent conversation event', 400);
    return new AppError('Could not persist the Agent conversation event', 500);
}

async function persistAgentConversationEvent(input: {
    actorUserId: string;
    conversationId: string;
    clientTurnKey: string;
    inputText: string;
    inputMode: 'text' | 'voice' | 'reviewed_voice_text';
    resultKind: AgentConversationEventKind;
    result: AgentConversationEventResult;
}): Promise<{ turnId: string; idempotentReplay: boolean; createdAt: string }> {
    await assertConversationParticipant(input.actorUserId, input.conversationId);

    const inputText = input.inputText.trim();
    if (!inputText || inputText.length > MAX_HISTORY_INPUT_LENGTH || !input.clientTurnKey.trim()) {
        throw new AppError('Invalid Agent conversation event', 400);
    }

    const result = publicResult(input.result);
    const serializedResult = JSON.stringify(result);
    if (Buffer.byteLength(serializedResult, 'utf8') > MAX_HISTORY_RESULT_BYTES) {
        throw new AppError('Agent conversation event is too large', 400);
    }

    const { data, error } = await supabaseAdmin.rpc('persist_agent_conversation_turn', {
        p_actor_user_id: input.actorUserId,
        p_conversation_id: input.conversationId,
        p_client_turn_key: input.clientTurnKey.trim(),
        p_request_fingerprint: fingerprint(inputText, input.inputMode, result),
        p_input_text: inputText,
        p_input_mode: input.inputMode,
        p_result_kind: input.resultKind,
        p_result: result,
    });

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
    const { data: source, error: sourceError } = await supabaseAdmin
        .from('agent_conversation_turns')
        .select('input_text, input_mode, result, conversations!inner(deleted_at)')
        .eq('conversation_id', input.conversationId)
        .eq('actor_user_id', input.actorUserId)
        .eq('client_turn_key', input.sourceTurnKey)
        .is('conversations.deleted_at', null)
        .maybeSingle();
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
        .select('id, conversation_id, actor_user_id, client_turn_key, input_text, input_mode, result_kind, result, created_at, conversations!inner(deleted_at)')
        .eq('conversation_id', conversationId)
        .eq('actor_user_id', actorUserId)
        .is('conversations.deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(Math.min(Math.max(limit, 1), 200));

    if (error) throw new AppError('Could not load the Agent conversation history', 500);
    return (data || []).map((row: any) => ({
        id: row.id,
        conversationId: row.conversation_id,
        actorUserId: row.actor_user_id,
        clientTurnKey: row.client_turn_key,
        inputText: row.input_text,
        inputMode: row.input_mode,
        resultKind: row.result_kind,
        result: row.result,
        createdAt: row.created_at,
    }));
}
