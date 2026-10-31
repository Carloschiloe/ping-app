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
    'If what the user wants is unclear, or several items could match, ask one short question instead of guessing. For small talk, thanks or complaints, just reply naturally without tools.',
].join('\n\n');

function contextMessage(now: Date, timezone: string): AssistantChatMessage {
    return { role: 'system', content: `Current local date and time: ${formatLocal(now.toISOString(), timezone)} (${timezone}).` };
}

function clip(text: string): string {
    return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text;
}

export interface AssistantTurnInput {
    actorUserId: string;
    text: string;
    timezone: string;
    now: Date;
    history: AssistantHistory;
}

export async function runAssistantTurn(
    input: AssistantTurnInput,
    deps: { data: AssistantDataPort; model: AssistantModel },
): Promise<AssistantTurnOutput> {
    const refs = new AssistantRefTable(input.history.refs);
    const actions = input.history.actions.map((action) => ({ ...action }));
    const ctx: AssistantToolContext = {
        actorUserId: input.actorUserId,
        timezone: input.timezone,
        now: input.now,
        data: deps.data,
        refs,
        actions,
        priorActionRefs: new Set(actions.map((action) => action.ref)),
        trace: [],
        citations: new Map(),
    };

    const turnMessages: AssistantChatMessage[] = [{ role: 'user', content: input.text }];
    const pending = actions.filter((action) => action.state === 'pending');
    const stateNote: AssistantChatMessage[] = pending.length
        ? [{ role: 'system', content: `Pending action waiting for the user's answer: ${pending.map((action) => `${action.ref} — ${action.summary}`).join('; ')}` }]
        : [];
    const transcript = (): AssistantChatMessage[] => [
        { role: 'system', content: ASSISTANT_INSTRUCTIONS },
        contextMessage(input.now, input.timezone),
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

    return {
        answer,
        citations: [...ctx.citations.values()],
        memory: { version: 1, refs: refs.toJSON(), actions, messages: turnMessages },
        trace: ctx.trace,
    };
}
