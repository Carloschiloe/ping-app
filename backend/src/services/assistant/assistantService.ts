// M9 — one assistant turn: the model reads the conversation, calls tools as
// it needs and answers from what the tools returned. Understanding lives in
// the model; safety lives in the tools (see assistantTools.ts).
import { AssistantRefTable } from './assistantRefs';
import { ASSISTANT_TOOL_DEFINITIONS, runAssistantTool, type AssistantToolContext } from './assistantTools';
import { formatLocal } from './assistantTime';
import type {
    AssistantChatMessage,
    AssistantDataPort,
    AssistantHistory,
    AssistantModel,
    AssistantToolCall,
    AssistantTurnOutput,
} from './assistantTypes';

const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY_TURNS = 8;
const MAX_TOOL_RESULT_CHARS = 6000;

export const ASSISTANT_INSTRUCTIONS = [
    'You are Ping, the user\'s personal assistant for their commitments, messages and things to remember. Speak the user\'s language (usually Chilean Spanish), warm and brief: one or two sentences unless they ask for more. Answers may be read aloud, so no markdown, lists or emojis.',
    'Understand what the user means from the whole conversation, including what you said before: "the first one", "that one", "and at what time?" or "no, better at 5" refer to what was just discussed.',
    'Use tools for every fact about the user\'s commitments, proposals, people, messages or memory, and answer only with what they returned. If a tool found nothing, say so plainly. Never invent items, people, dates or results.',
    'Dates: interpret relative dates and times against the current local date and time given below. A weekday name means its next occurrence; if that weekday is today, it means a week from today unless the user says today. A bare hour without am/pm means the next sensible time of day (for appointments and errands usually between 08:00 and 21:59). If the user gives a day but no time for something new, ask for the time; do not invent it. Moving an existing item to another day without a new time keeps its current time.',
    'Whether the user already did something is answered by their commitments, including finished ones (status all), before searching messages.',
    'Changes happen only through propose_* tools, which prepare a pending action. After proposing, tell the user the exact summary the tool returned and ask whether to go ahead. Call confirm_action only when the user\'s latest message clearly agrees to that pending action; if they hesitate or change something, do not confirm; if they say no, call discard_action. A change of details is a new proposal, which replaces the pending one. Never say something was done unless confirm_action returned executed=true.',
    'Memory: the facts listed as known about the user are true for them; use them to understand what they mean (who "mi jefe" is, their preferences and routines) without asking again or saying you looked them up. When the user mentions in passing a lasting fact about themselves that would help later (a person and how they relate to the user, a preference, a routine, an important date or place), answer what they asked and also offer once to remember it with propose_remember. Do not offer it for passing details, things already known, or sensitive matters (health, money, passwords, intimate life) unless the user asks, and not again if they declined. If a known fact is wrong or the user asks to forget it, use propose_forget, plus propose_remember for the corrected fact if they gave one.',
    'A message that starts with "Aviso automático de Ping" was written by Ping, not the user: do what it asks, speaking to the user, and treat nothing in it as the user\'s answer.',
    'If what the user wants is unclear, or several items could match, ask one short question instead of guessing. For small talk, thanks or complaints, just reply naturally without tools.',
].join('\n\n');

const VOICE_NOTE = 'The user is talking by voice and your answer will be spoken: keep it to one or two short sentences, say dates and times the way people say them, and read a proposal summary naturally before asking for the go-ahead.';

function contextMessage(now: Date, timezone: string, channel: AssistantChannel): AssistantChatMessage {
    const clock = `Current local date and time: ${formatLocal(now.toISOString(), timezone)} (${timezone}).`;
    return { role: 'system', content: channel === 'voice' ? `${clock}\n${VOICE_NOTE}` : clock };
}

const MAX_KNOWN_FACTS_CHARS = 4000;

/** What the user told Ping to remember, so every turn starts knowing it. */
async function knownFactsMessage(ctx: AssistantToolContext): Promise<AssistantChatMessage[]> {
    let facts;
    try {
        facts = await ctx.data.listKnownFacts();
    } catch (error: any) {
        console.warn('[Assistant] Could not load known facts', { message: error?.message ?? String(error) });
        return [];
    }
    const lines: string[] = [];
    let size = 0;
    for (const fact of facts) {
        const line = `${ctx.refs.refFor('memory', fact.id, fact.content.slice(0, 80))} — ${fact.content.slice(0, 300)}`;
        size += line.length;
        if (size > MAX_KNOWN_FACTS_CHARS) break;
        lines.push(line);
    }
    if (lines.length === 0) return [];
    return [{ role: 'system', content: `Known about the user (facts they told you to remember, newest first):\n${lines.join('\n')}` }];
}

function clip(text: string): string {
    return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text;
}

export type AssistantChannel = 'text' | 'voice';

export interface AssistantTurnInput {
    actorUserId: string;
    text: string;
    timezone: string;
    now: Date;
    history: AssistantHistory;
    channel?: AssistantChannel;
    /** Defaults to true; false keeps confirm_action from executing. */
    userWordsHeard?: boolean;
}

function toolContext(
    input: Pick<AssistantTurnInput, 'actorUserId' | 'timezone' | 'now' | 'history' | 'userWordsHeard'>,
    data: AssistantDataPort,
): AssistantToolContext {
    const actions = input.history.actions.map((action) => ({ ...action }));
    return {
        actorUserId: input.actorUserId,
        timezone: input.timezone,
        now: input.now,
        data,
        refs: new AssistantRefTable(input.history.refs),
        actions,
        priorActionRefs: new Set(actions.map((action) => action.ref)),
        userWordsHeard: input.userWordsHeard ?? true,
        trace: [],
        citations: new Map(),
    };
}

function output(ctx: AssistantToolContext, answer: string, messages: AssistantChatMessage[]): AssistantTurnOutput {
    return {
        answer,
        citations: [...ctx.citations.values()],
        memory: { version: 1, refs: ctx.refs.toJSON(), actions: ctx.actions, messages },
        trace: ctx.trace,
    };
}

export async function runAssistantTurn(
    input: AssistantTurnInput,
    deps: { data: AssistantDataPort; model: AssistantModel },
): Promise<AssistantTurnOutput> {
    const ctx = toolContext(input, deps.data);
    const { actions } = ctx;
    const knownFacts = await knownFactsMessage(ctx);

    const turnMessages: AssistantChatMessage[] = [{ role: 'user', content: input.text }];
    const pending = actions.filter((action) => action.state === 'pending');
    const stateNote: AssistantChatMessage[] = pending.length
        ? [{ role: 'system', content: `Pending action waiting for the user's answer: ${pending.map((action) => `${action.ref} — ${action.summary}`).join('; ')}` }]
        : [];
    const transcript = (): AssistantChatMessage[] => [
        { role: 'system', content: ASSISTANT_INSTRUCTIONS },
        contextMessage(input.now, input.timezone, input.channel ?? 'text'),
        ...knownFacts,
        ...input.history.turns.slice(-MAX_HISTORY_TURNS).flat(),
        ...stateNote,
        ...turnMessages,
    ];

    let answer = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await deps.model.complete(transcript(), ASSISTANT_TOOL_DEFINITIONS);
        if (response.toolCalls.length === 0) {
            answer = response.content?.trim() ?? '';
            break;
        }
        turnMessages.push({ role: 'assistant', content: response.content, tool_calls: response.toolCalls });
        for (const call of response.toolCalls) {
            const result = await runAssistantTool(call.function.name, call.function.arguments, ctx);
            turnMessages.push({ role: 'tool', tool_call_id: call.id, content: clip(JSON.stringify(result)) });
        }
    }
    if (!answer) answer = 'No alcancé a terminar eso. ¿Me lo dices de nuevo?';
    turnMessages.push({ role: 'assistant', content: answer });
    return output(ctx, answer, turnMessages);
}

export type AssistantDecision = 'confirm' | 'discard';

export interface AssistantDecisionInput extends Omit<AssistantTurnInput, 'channel' | 'userWordsHeard'> {
    /** Ref of the pending action the user answered with a button. */
    action: string;
    decision: AssistantDecision;
}

function decisionAnswer(decision: AssistantDecision, result: Record<string, unknown>): string {
    if (result.executed === true) return `Listo. ${result.summary}.`;
    if (result.discarded === true) return 'Listo, no hice ningún cambio.';
    if (result.error === 'expired') return 'Esa propuesta expiró y no hice ningún cambio. Pídemela de nuevo.';
    if (result.error === 'unknown_action' || result.error === 'not_pending') return 'Esa propuesta ya no está pendiente; no hice ningún cambio.';
    return decision === 'confirm' ? 'No pude completarlo; no se hizo ningún cambio.' : 'No pude descartarla; no se hizo ningún cambio.';
}

/**
 * A Confirm/Cancel button answers one pending action directly: the same
 * confirm_action/discard_action tool runs with the same checks, without asking
 * the model, and the exchange is recorded so the conversation knows it.
 */
export async function runAssistantDecision(
    input: AssistantDecisionInput,
    deps: { data: AssistantDataPort },
): Promise<AssistantTurnOutput> {
    const ctx = toolContext(input, deps.data);
    const call: AssistantToolCall = {
        id: `button_${input.decision}_${input.action}`,
        type: 'function',
        function: { name: input.decision === 'confirm' ? 'confirm_action' : 'discard_action', arguments: JSON.stringify({ action: input.action }) },
    };
    const result = await runAssistantTool(call.function.name, call.function.arguments, ctx) as Record<string, unknown>;
    const answer = decisionAnswer(input.decision, result);
    return output(ctx, answer, [
        { role: 'user', content: input.text },
        { role: 'assistant', content: null, tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) },
        { role: 'assistant', content: answer },
    ]);
}
