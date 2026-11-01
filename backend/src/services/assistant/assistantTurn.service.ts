// HTTP-facing assistant turn: loads the dialogue
// memory persisted with earlier turns, runs one assistant turn against the
// production data port and returns a normal Agent Turn response.
import { listAgentConversationTurns } from '../agentConversationTurn.service';
import { assistantModelFromEnv } from './assistantModel';
import { runAssistantDecision, runAssistantTurn, type AssistantChannel, type AssistantDecision } from './assistantService';
import { SupabaseAssistantDataPort } from './assistantSupabasePort';
import type { AgentTurnResponse } from '../../types/agentTurn';
import type { AssistantChatMessage, AssistantHistory, AssistantMemory, AssistantModel, AssistantDataPort } from './assistantTypes';

const DEFAULT_TIMEZONE = 'America/Santiago';
const HISTORY_ROWS = 20;
const PERSISTED_TOOL_RESULT_CHARS = 1500;

function validTimezone(timezone: unknown): string {
    if (typeof timezone !== 'string' || !timezone.trim()) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
        return timezone.trim();
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

// The latest dialogue memory per actor and scope, kept in process so a turn
// does not wait on the history table and the next turn does not depend on
// the previous one having been persisted yet. The table stays the source after
// a restart or on another instance.
const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_CACHE_MAX = 500;
const historyCache = new Map<string, { history: AssistantHistory; at: number }>();

function historyCacheKey(actorUserId: string, historyConversationId: string, dialogueConversationId: string | undefined): string {
    return `${actorUserId}|${historyConversationId}|${dialogueConversationId?.trim() || ''}`;
}

function rememberHistory(key: string, history: AssistantHistory): void {
    historyCache.delete(key);
    historyCache.set(key, { history, at: Date.now() });
    if (historyCache.size > HISTORY_CACHE_MAX) historyCache.delete(historyCache.keys().next().value!);
}

/** Drops cached dialogue memory after the user clears a conversation's history. */
export function forgetAssistantHistory(actorUserId: string, historyConversationId: string): void {
    const prefix = `${actorUserId}|${historyConversationId}|`;
    for (const key of [...historyCache.keys()]) if (key.startsWith(prefix)) historyCache.delete(key);
}

export function clearAssistantHistoryCacheForTests(): void {
    historyCache.clear();
}

/** Earlier assistant turns of the same dialogue scope, oldest first. */
export async function loadAssistantHistory(
    actorUserId: string,
    historyConversationId: string | undefined,
    dialogueConversationId: string | undefined,
): Promise<AssistantHistory> {
    const empty: AssistantHistory = { turns: [], refs: [], actions: [] };
    if (!historyConversationId) return empty;
    const cached = historyCache.get(historyCacheKey(actorUserId, historyConversationId, dialogueConversationId));
    if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) return cached.history;
    const scope = dialogueConversationId?.trim() || null;
    const rows = await listAgentConversationTurns(actorUserId, historyConversationId, HISTORY_ROWS, { includeAssistantMemory: true });
    const memories = rows
        .map((row) => (row.result as any)?.__pingAgentHistory)
        .filter((metadata) => metadata && (metadata.dialogueConversationId ?? null) === scope && metadata.assistant?.version === 1)
        .map((metadata) => metadata.assistant as AssistantMemory);
    const latest = memories[memories.length - 1];
    if (!latest) return empty;
    return { turns: memories.map((memory) => memory.messages), refs: latest.refs, actions: latest.actions };
}

/** Tool outputs are replayed only as context; a shorter copy keeps rows bounded. */
export function compactAssistantMemory(memory: AssistantMemory): AssistantMemory {
    const messages: AssistantChatMessage[] = memory.messages.map((message) => (
        message.role === 'tool' && message.content.length > PERSISTED_TOOL_RESULT_CHARS
            ? { ...message, content: `${message.content.slice(0, PERSISTED_TOOL_RESULT_CHARS)}…` }
            : message
    ));
    return { ...memory, messages };
}

export async function runAssistantModeTurn(input: {
    actorUserId: string;
    text: string;
    timezone?: unknown;
    historyConversationId?: string;
    dialogueConversationId?: string;
    traceId?: string;
    channel?: AssistantChannel;
    userWordsHeard?: boolean;
    /** A Confirm/Cancel button: answers that pending action without the model. */
    actionDecision?: { action: string; decision: AssistantDecision };
}, deps: { model?: AssistantModel; data?: AssistantDataPort; now?: Date } = {}): Promise<{ result: AgentTurnResponse; memory: AssistantMemory }> {
    const model = deps.model ?? assistantModelFromEnv();
    const startedAt = Date.now();
    const history = await loadAssistantHistory(input.actorUserId, input.historyConversationId, input.dialogueConversationId)
        .catch((error) => {
            console.warn('[Assistant] History unavailable; continuing without it.', error?.message ?? error);
            return { turns: [], refs: [], actions: [] } as AssistantHistory;
        });
    const historyMs = Date.now() - startedAt;
    const base = {
        actorUserId: input.actorUserId,
        text: input.text,
        timezone: validTimezone(input.timezone),
        now: deps.now ?? new Date(),
        history,
    };
    const data = deps.data ?? new SupabaseAssistantDataPort(input.actorUserId, undefined, input.traceId);
    const output = input.actionDecision
        ? await runAssistantDecision({ ...base, ...input.actionDecision }, { data })
        : await runAssistantTurn({ ...base, channel: input.channel, userWordsHeard: input.userWordsHeard }, { model, data });
    const memory = compactAssistantMemory(output.memory);
    if (input.historyConversationId) {
        rememberHistory(historyCacheKey(input.actorUserId, input.historyConversationId, input.dialogueConversationId), {
            turns: [...history.turns, memory.messages].slice(-HISTORY_ROWS),
            refs: memory.refs,
            actions: memory.actions,
        });
    }
    console.info('[Assistant] Turn timing', {
        traceId: input.traceId, channel: input.channel ?? 'text', historyMs, turnMs: Date.now() - startedAt - historyMs,
        tools: output.trace.map((entry) => entry.name),
    });
    const proposed = new Set(output.trace.flatMap((entry) => (entry.proposedAction ? [entry.proposedAction.ref] : [])));
    const pendingActions = memory.actions
        .filter((action) => action.state === 'pending' && proposed.has(action.ref))
        .map(({ ref, summary }) => ({ ref, summary }));
    return {
        result: {
            kind: 'response',
            response: { status: 'answered', answer: output.answer, citations: output.citations },
            ...(pendingActions.length ? { pendingActions } : {}),
            ...(output.trace.some((entry) => entry.confirmed) ? { changed: true as const } : {}),
        },
        memory,
    };
}
