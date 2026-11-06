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
import { describeLocal, localDayRangeToIso } from './assistantTime';
import { SupabaseAssistantDataPort } from './assistantSupabasePort';
import { runAssistantModeTurn } from './assistantTurn.service';
import type { AgentTurnResponse, AgentTurnInitiativeKind } from '../../types/agentTurn';

/** Used when a profile has no summary hour of its own. */
export const DEFAULT_SUMMARY_HOUR = 8;
/** Other notices wait for daytime: from the hour after the summary to 21:59 local. */
const QUIET_FROM_HOUR = 22;
/** At most this many initiatives per user and local day. */
export const DAILY_INITIATIVE_LIMIT = 3;
/** An item counts as newly overdue from 15 minutes after its time, for 3 hours. */
const OVERDUE_GRACE_MS = 15 * 60 * 1000;
const OVERDUE_WINDOW_MS = 3 * 60 * 60 * 1000;
/** A proposal Ping makes unprompted waits until the user sees it. */
const INITIATIVE_PENDING_TTL_MS = 12 * 60 * 60 * 1000;
const PUSH_BODY_CHARS = 180;

/** Starts every automatic notice; the instructions tell the model who wrote it. */
export const INITIATIVE_NOTE_PREFIX = 'Aviso automático de Vorian (no lo escribió el usuario):';

const DAILY_SUMMARY_NOTE = `${INITIATIVE_NOTE_PREFIX} es la mañana. Escríbele al usuario un resumen breve de su día: lo que tiene para hoy y lo que quedó atrasado y sigue abierto. Sin proponer cambios todavía.`;

export interface InitiativeRecipient {
    userId: string;
    timezone: string;
    pushToken: string | null;
    /** The user's choices in Perfil. */
    dailySummary: boolean;
    summaryHour: number;
    overdueNotices: boolean;
}

export interface OverdueItem {
    id: string;
    title: string;
    dueAt: string;
}

export interface InitiativeDeps {
    now: Date;
    listRecipients(): Promise<InitiativeRecipient[]>;
    /** Whether the user has something open due today or earlier. */
    hasAgendaUntil(userId: string, endIso: string): Promise<boolean>;
    /** Open commitments the user has to do whose time passed between `fromIso` and `toIso`. */
    listOverdue(userId: string, fromIso: string, toIso: string): Promise<OverdueItem[]>;
    countSentOn(userId: string, localDate: string): Promise<number>;
    claim(key: string, userId: string, kind: AgentTurnInitiativeKind, localDate: string): Promise<boolean>;
    complete(key: string): Promise<void>;
    fail(key: string, error: string): Promise<void>;
    selfConversationId(userId: string): Promise<string>;
    runTurn(input: { userId: string; text: string; timezone: string; conversationId: string }): Promise<{ result: AgentTurnResponse; memory: unknown }>;
    persistTurn(input: { userId: string; conversationId: string; key: string; text: string; result: AgentTurnResponse; memory: unknown }): Promise<void>;
    push(token: string, title: string, body: string, data: Record<string, unknown>): Promise<void>;
}

function pushBody(answer: string): string {
    const text = answer.replace(/\s+/g, ' ').trim();
    return text.length > PUSH_BODY_CHARS ? `${text.slice(0, PUSH_BODY_CHARS - 1)}…` : text;
}

/** "hoy a las 15:00", "ayer a las 15:00" or the full date: models misjudge relative days. */
function whenItWas(iso: string, now: Date, timezone: string): string {
    const day = localDateKey(new Date(iso), timezone);
    const time = describeLocal(iso, timezone).replace(/^.* a las /, '');
    if (day === localDateKey(now, timezone)) return `hoy a las ${time}`;
    if (day === localDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone)) return `ayer a las ${time}`;
    return describeLocal(iso, timezone);
}

export function overdueNote(items: OverdueItem[], now: Date, timezone: string): string {
    if (items.length === 1) {
        const [item] = items;
        return `${INITIATIVE_NOTE_PREFIX} venció sin completarse «${item.title}», que era para ${whenItWas(item.dueAt, now, timezone)}. Avísale en una o dos frases y prepárale con propose_reschedule moverlo a mañana a la misma hora, preguntándole si le sirve, si prefiere otro momento o si ya lo hizo.`;
    }
    const list = items.map((item) => `«${item.title}» (${whenItWas(item.dueAt, now, timezone)})`).join(', ');
    return `${INITIATIVE_NOTE_PREFIX} vencieron sin completarse: ${list}. Avísale en una o dos frases y pregúntale qué quiere hacer con ellos, sin proponer cambios todavía.`;
}

/**
 * Claims every key, then writes one turn for all of them. Claims are released
 * as failed when the turn fails, so a later pass may try again.
 */
async function deliver(
    recipient: InitiativeRecipient,
    kind: AgentTurnInitiativeKind,
    keys: string[],
    note: string,
    deps: InitiativeDeps,
): Promise<void> {
    try {
        const conversationId = await deps.selfConversationId(recipient.userId);
        const { result, memory } = await deps.runTurn({ userId: recipient.userId, text: note, timezone: recipient.timezone, conversationId });
        const answer = result.response.answer.trim();
        if (!answer) throw new Error('empty_initiative_answer');
        const initiativeResult: AgentTurnResponse = { ...result, initiative: { kind } };
        await deps.persistTurn({ userId: recipient.userId, conversationId, key: keys[0], text: note, result: initiativeResult, memory });
        // Tapping the notification opens the chat with Ping.
        if (recipient.pushToken) await deps.push(recipient.pushToken, 'Vorian', pushBody(answer), { type: 'ping_assistant', kind });
        for (const key of keys) await deps.complete(key);
    } catch (error: any) {
        for (const key of keys) await deps.fail(key, error?.message ?? String(error));
        throw error;
    }
}

/** Daily summary: each user once per local day, in their summary hour. */
async function dailySummary(recipient: InitiativeRecipient, deps: InitiativeDeps): Promise<boolean> {
    if (!recipient.dailySummary || localHourAndMinute(deps.now, recipient.timezone).hour !== recipient.summaryHour) return false;
    const localDate = localDateKey(deps.now, recipient.timezone);
    const key = `daily_summary:${recipient.userId}:${localDate}`;
    const endOfToday = localDayRangeToIso(undefined, localDate, recipient.timezone)?.to;
    if (!endOfToday || !(await deps.hasAgendaUntil(recipient.userId, endOfToday))) return false;
    if (!(await deps.claim(key, recipient.userId, 'daily_summary', localDate))) return false;
    await deliver(recipient, 'daily_summary', [key], DAILY_SUMMARY_NOTE, deps);
    return true;
}

/** Overdue notice: once per item and due time, in daytime, within the daily limit. */
async function overdueNotice(recipient: InitiativeRecipient, deps: InitiativeDeps): Promise<boolean> {
    if (!recipient.overdueNotices) return false;
    const { hour } = localHourAndMinute(deps.now, recipient.timezone);
    if (hour <= recipient.summaryHour || hour >= QUIET_FROM_HOUR) return false;
    const localDate = localDateKey(deps.now, recipient.timezone);
    const to = new Date(deps.now.getTime() - OVERDUE_GRACE_MS);
    const from = new Date(to.getTime() - OVERDUE_WINDOW_MS);
    const overdue = await deps.listOverdue(recipient.userId, from.toISOString(), to.toISOString());
    if (overdue.length === 0) return false;
    if (await deps.countSentOn(recipient.userId, localDate) >= DAILY_INITIATIVE_LIMIT) return false;
    const claimed: Array<{ item: OverdueItem; key: string }> = [];
    for (const item of overdue) {
        const key = `overdue:${item.id}:${item.dueAt}`;
        if (await deps.claim(key, recipient.userId, 'overdue', localDate)) claimed.push({ item, key });
    }
    if (claimed.length === 0) return false;
    await deliver(recipient, 'overdue', claimed.map(({ key }) => key), overdueNote(claimed.map(({ item }) => item), deps.now, recipient.timezone), deps);
    return true;
}

/** One engine pass over every user. One user's failure never stops the rest. */
export async function runInitiativePass(deps: InitiativeDeps): Promise<{ summaries: number; overdue: number }> {
    const sent = { summaries: 0, overdue: 0 };
    for (const recipient of await deps.listRecipients()) {
        for (const [kind, run] of [['summaries', dailySummary], ['overdue', overdueNotice]] as const) {
            try {
                if (await run(recipient, deps)) sent[kind] += 1;
            } catch (error: any) {
                console.error('[Initiative] Notice failed', { kind, userId: recipient.userId, message: error?.message ?? String(error) });
            }
        }
    }
    return sent;
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
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .select('id, timezone, expo_push_token, assistant_daily_summary, assistant_summary_hour, assistant_overdue_notices');
            if (error) throw new Error(`profiles: ${error.message}`);
            return (data || []).map((row: any) => ({
                userId: row.id,
                timezone: resolveAutomationTimezone(row.timezone),
                pushToken: typeof row.expo_push_token === 'string' && row.expo_push_token ? row.expo_push_token : null,
                dailySummary: row.assistant_daily_summary !== false,
                summaryHour: Number.isInteger(row.assistant_summary_hour) ? row.assistant_summary_hour : DEFAULT_SUMMARY_HOUR,
                overdueNotices: row.assistant_overdue_notices !== false,
            }));
        },
        async hasAgendaUntil(userId, endIso) {
            const port = new SupabaseAssistantDataPort(userId);
            const open = await port.listCommitments({ to: endIso, statuses: ['proposed', 'accepted', 'counter_proposal'], limit: 1 });
            return open.length > 0;
        },
        async listOverdue(userId, fromIso, toIso) {
            // The one who has to do it: the assignee, or the owner when there is none.
            const { data, error } = await supabaseAdmin
                .from('commitments')
                .select('id, title, due_at')
                .eq('status', 'accepted')
                .or(`assigned_to_user_id.eq.${userId},and(owner_user_id.eq.${userId},assigned_to_user_id.is.null)`)
                .gte('due_at', fromIso)
                .lte('due_at', toIso)
                .order('due_at')
                .limit(5);
            if (error) throw new Error(`commitments: ${error.message}`);
            return (data || []).map((row: any) => ({ id: row.id, title: row.title, dueAt: new Date(row.due_at).toISOString() }));
        },
        async countSentOn(userId, localDate) {
            const { count, error } = await supabaseAdmin
                .from('agent_initiatives')
                .select('initiative_key', { count: 'exact', head: true })
                .eq('actor_user_id', userId)
                .eq('local_date', localDate)
                .eq('status', 'sent');
            if (error) throw new Error(`agent_initiatives: ${error.message}`);
            return count ?? 0;
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
            const traceId = `initiative-${Date.now()}`;
            return runAssistantModeTurn({
                // The main Ping screen talks in the self-chat's own dialogue
                // scope; the notice must share it so its buttons and replies
                // find what it proposed.
                actorUserId: userId, text, timezone, historyConversationId: conversationId, dialogueConversationId: conversationId,
                channel: 'text', userWordsHeard: false, traceId,
            }, { data: new SupabaseAssistantDataPort(userId, undefined, traceId, INITIATIVE_PENDING_TTL_MS) });
        },
        async persistTurn({ userId, conversationId, key, text, result, memory }) {
            await persistAgentConversationTurn({
                actorUserId: userId, conversationId, dialogueConversationId: conversationId, clientTurnKey: key, inputText: text,
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
        const sent = await runInitiativePass(productionInitiativeDeps());
        if (sent.summaries + sent.overdue > 0) console.info('[Initiative] Notices sent', sent);
    } catch (error: any) {
        console.error('[Initiative] Engine pass failed', error?.message ?? error);
    } finally {
        isRunning = false;
    }
}
