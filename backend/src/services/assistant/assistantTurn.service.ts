// HTTP-facing assistant turn (PING_AGENT_MODE=assistant): loads the dialogue
// memory persisted with earlier turns, runs one assistant turn against the
// production data port and returns a normal Agent Turn response.
import { listAgentConversationTurns } from '../agentConversationTurn.service';
import { assistantModelFromEnv } from './assistantModel';
import { runAssistantTurn } from './assistantService';
import { SupabaseAssistantDataPort } from './assistantSupabasePort';
import type { AgentTurnResponse } from '../../types/agentTurn';
import type { AssistantChatMessage, AssistantHistory, AssistantMemory, AssistantModel, AssistantDataPort } from './assistantTypes';

const DEFAULT_TIMEZONE = 'America/Santiago';
const HISTORY_ROWS = 20;
const PERSISTED_TOOL_RESULT_CHARS = 1500;

export function isAssistantModeEnabled(): boolean {
    return process.env.PING_AGENT_MODE === 'assistant' && Boolean(process.env.PING_ASSISTANT_MODEL?.trim());
}

function validTimezone(timezone: unknown): string {
    if (typeof timezone !== 'string' || !timezone.trim()) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone.trim() });
        return timezone.trim();
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

/** Earlier assistant turns of the same dialogue scope, oldest first. */
export async function loadAssistantHistory(
    actorUserId: string,
    historyConversationId: string | undefined,
    dialogueConversationId: string | undefined,
): Promise<AssistantHistory> {
    const empty: AssistantHistory = { turns: [], refs: [], actions: [] };
    if (!historyConversationId) return empty;
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
}, deps: { model?: AssistantModel; data?: AssistantDataPort; now?: Date } = {}): Promise<{ result: AgentTurnResponse; memory: AssistantMemory }> {
    const model = deps.model ?? assistantModelFromEnv();
    if (!model) throw new Error('Assistant mode requires PING_ASSISTANT_MODEL');
    const history = await loadAssistantHistory(input.actorUserId, input.historyConversationId, input.dialogueConversationId)
        .catch((error) => {
            console.warn('[Assistant] History unavailable; continuing without it.', error?.message ?? error);
            return { turns: [], refs: [], actions: [] } as AssistantHistory;
        });
    const output = await runAssistantTurn({
        actorUserId: input.actorUserId,
        text: input.text,
        timezone: validTimezone(input.timezone),
        now: deps.now ?? new Date(),
        history,
    }, { model, data: deps.data ?? new SupabaseAssistantDataPort(input.actorUserId, undefined, input.traceId) });
    return {
        result: { kind: 'response', response: { status: 'answered', answer: output.answer, citations: output.citations } },
        memory: compactAssistantMemory(output.memory),
    };
}
