// M10 — Ping takes the initiative. The engine decides when there is
// something worth telling a user, the same assistant writes it into the
// user's chat with Ping, and a push notification points them to it. The note
// that starts the turn is not the user's words, so nothing it leads to can
// execute without the user's own confirmation.
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { getOrCreateSelfConversationId } from '../conversation.service';
import {
    isAgentConversationTurnPersistenceEnabled,
    persistAgentConversationTurn,
} from '../agentConversationTurn.service';
import { sendPushNotification } from '../push.service';
import { localDateKey, localHourAndMinute, resolveAutomationTimezone } from '../automationTimezone.service';
import { localDayRangeToIso } from './assistantTime';
import { SupabaseAssistantDataPort } from './assistantSupabasePort';
import { runAssistantModeTurn } from './assistantTurn.service';
import type { AgentTurnResponse, AgentTurnInitiativeKind } from '../../types/agentTurn';

export const DAILY_SUMMARY_HOUR = 8;
const PUSH_BODY_CHARS = 180;

/** Starts every automatic notice; the instructions tell the model who wrote it. */
export const INITIATIVE_NOTE_PREFIX = 'Aviso automático de Ping (no lo escribió el usuario):';

const DAILY_SUMMARY_NOTE = `${INITIATIVE_NOTE_PREFIX} es la mañana. Escríbele al usuario un resumen breve de su día: lo que tiene para hoy y lo que quedó atrasado y sigue abierto. Sin proponer cambios todavía.`;

export interface InitiativeRecipient {
    userId: string;
    timezone: string;
    pushToken: string | null;
}

export interface InitiativeDeps {
    now: Date;
    listRecipients(): Promise<InitiativeRecipient[]>;
    /** Whether the user has something open due today or earlier. */
    hasAgendaUntil(userId: string, endIso: string): Promise<boolean>;
    claim(key: string, userId: string, kind: AgentTurnInitiativeKind, localDate: string): Promise<boolean>;
    complete(key: string): Promise<void>;
    fail(key: string, error: string): Promise<void>;
    selfConversationId(userId: string): Promise<string>;
    runTurn(input: { userId: string; text: string; timezone: string; conversationId: string }): Promise<{ result: AgentTurnResponse; memory: unknown }>;
    persistTurn(input: { userId: string; conversationId: string; key: string; text: string; result: AgentTurnResponse; memory: unknown }): Promise<void>;
    push(token: string, title: string, body: string): Promise<void>;
}

function pushBody(answer: string): string {
    const text = answer.replace(/\s+/g, ' ').trim();
    return text.length > PUSH_BODY_CHARS ? `${text.slice(0, PUSH_BODY_CHARS - 1)}…` : text;
}

async function deliver(recipient: InitiativeRecipient, kind: AgentTurnInitiativeKind, key: string, note: string, deps: InitiativeDeps): Promise<boolean> {
    const conversationId = await deps.selfConversationId(recipient.userId);
    const { result, memory } = await deps.runTurn({ userId: recipient.userId, text: note, timezone: recipient.timezone, conversationId });
    const answer = result.response.answer.trim();
    if (!answer) throw new Error('empty_initiative_answer');
    const initiativeResult: AgentTurnResponse = { ...result, initiative: { kind } };
    await deps.persistTurn({ userId: recipient.userId, conversationId, key, text: note, result: initiativeResult, memory });
    if (recipient.pushToken) await deps.push(recipient.pushToken, 'Ping', pushBody(answer));
    return true;
}

/** One pass of the daily summary: each user once per local day, in their summary hour. */
export async function runDailySummaryInitiatives(deps: InitiativeDeps): Promise<{ checked: number; sent: number }> {
    let sent = 0;
    const recipients = (await deps.listRecipients())
        .filter((recipient) => localHourAndMinute(deps.now, recipient.timezone).hour === DAILY_SUMMARY_HOUR);
    for (const recipient of recipients) {
        const localDate = localDateKey(deps.now, recipient.timezone);
        const key = `daily_summary:${recipient.userId}:${localDate}`;
        try {
            const endOfToday = localDayRangeToIso(undefined, localDate, recipient.timezone)?.to;
            if (!endOfToday || !(await deps.hasAgendaUntil(recipient.userId, endOfToday))) continue;
            if (!(await deps.claim(key, recipient.userId, 'daily_summary', localDate))) continue;
            try {
                await deliver(recipient, 'daily_summary', key, DAILY_SUMMARY_NOTE, deps);
                await deps.complete(key);
                sent += 1;
            } catch (error: any) {
                await deps.fail(key, error?.message ?? String(error));
                throw error;
            }
        } catch (error: any) {
            console.error('[Initiative] Daily summary failed', { userId: recipient.userId, message: error?.message ?? String(error) });
        }
    }
    return { checked: recipients.length, sent };
}

async function rpcOrThrow(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await supabaseAdmin.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
}

export function productionInitiativeDeps(now = new Date()): InitiativeDeps {
    return {
        now,
        async listRecipients() {
            const { data, error } = await supabaseAdmin.from('profiles').select('id, timezone, expo_push_token');
            if (error) throw new Error(`profiles: ${error.message}`);
            return (data || []).map((row: any) => ({
                userId: row.id,
                timezone: resolveAutomationTimezone(row.timezone),
                pushToken: typeof row.expo_push_token === 'string' && row.expo_push_token ? row.expo_push_token : null,
            }));
        },
        async hasAgendaUntil(userId, endIso) {
            const port = new SupabaseAssistantDataPort(userId);
            const open = await port.listCommitments({ to: endIso, statuses: ['proposed', 'accepted', 'counter_proposal'], limit: 1 });
            return open.length > 0;
        },
        async claim(key, userId, kind, localDate) {
            return (await rpcOrThrow('claim_agent_initiative', {
                p_initiative_key: key, p_actor_user_id: userId, p_kind: kind, p_local_date: localDate,
            })) === true;
        },
        async complete(key) { await rpcOrThrow('complete_agent_initiative', { p_initiative_key: key }); },
        async fail(key, error) { await rpcOrThrow('fail_agent_initiative', { p_initiative_key: key, p_error: error }); },
        selfConversationId: getOrCreateSelfConversationId,
        async runTurn({ userId, text, timezone, conversationId }) {
            return runAssistantModeTurn({
                actorUserId: userId, text, timezone, historyConversationId: conversationId,
                channel: 'text', userWordsHeard: false, traceId: `initiative-${Date.now()}`,
            });
        },
        async persistTurn({ userId, conversationId, key, text, result, memory }) {
            await persistAgentConversationTurn({
                actorUserId: userId, conversationId, clientTurnKey: key, inputText: text,
                inputMode: 'text', result, assistant: memory as any,
            });
        },
        push: sendPushNotification,
    };
}

let isRunning = false;

/** Cron entry point. Needs the conversation history, where initiatives live. */
export async function runInitiativeEngine(): Promise<void> {
    if (isRunning || !isAgentConversationTurnPersistenceEnabled()) return;
    isRunning = true;
    try {
        const summary = await runDailySummaryInitiatives(productionInitiativeDeps());
        if (summary.sent > 0) console.info('[Initiative] Daily summaries sent', summary);
    } catch (error: any) {
        console.error('[Initiative] Engine pass failed', error?.message ?? error);
    } finally {
        isRunning = false;
    }
}
