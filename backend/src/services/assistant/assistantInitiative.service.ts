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

/** Used when a profile has no summary time of its own. */
export const DEFAULT_SUMMARY_HOUR = 8;
export const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
/**
 * A summary missed because the server was asleep still goes out when it wakes,
 * up to this long after the chosen time (the free server sleeps from about
 * 1:00 to 7:00), and never after the day ends.
 */
const SUMMARY_CATCH_UP_MINUTES = 6 * 60 + 15;
/** From this hour the summary looks at tomorrow instead of what is left of today. */
const EVENING_SUMMARY_HOUR = 18;
/** Other notices wait for daytime: from the hour after a morning summary (9:00 otherwise) to 21:59 local. */
const QUIET_FROM_HOUR = 22;
const NOTICES_FROM_HOUR = 9;
/** At most this many initiatives per user and local day. */
export const DAILY_INITIATIVE_LIMIT = 3;
/** An item counts as newly overdue from 15 minutes after its time, for 3 hours. */
const OVERDUE_GRACE_MS = 15 * 60 * 1000;
const OVERDUE_WINDOW_MS = 3 * 60 * 60 * 1000;
/**
 * What someone else owes the user counts as late one hour after its time (they
 * may still be on it), and is looked for over a whole day, so one due while
 * the server slept is still followed up once it wakes.
 */
const OWED_GRACE_MS = 60 * 60 * 1000;
const OWED_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A proposal Ping makes unprompted waits until the user sees it. */
const INITIATIVE_PENDING_TTL_MS = 12 * 60 * 60 * 1000;
const PUSH_BODY_CHARS = 180;

/** Starts every automatic notice; the instructions tell the model who wrote it. */
export const INITIATIVE_NOTE_PREFIX = 'Aviso automático de Vorian (no lo escribió el usuario):';

/** The day's summary is also spoken by the live voice, so it is written to be heard. */
const SPOKEN_STYLE = 'Escríbelo para ser escuchado en voz alta, como un asistente personal: frases cortas, sin listas ni viñetas, horas dichas como se hablan. Termina preguntándole si quiere hacer algo con alguno.';

export function greetingFor(hour: number): string {
    return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** The note that starts the summary turn: greeting by name, what is on, said to be heard. */
export function summaryNote(input: { firstName: string | null; hour: number; evening: boolean; hasAgenda: boolean }): string {
    const hello = `${greetingFor(input.hour)}${input.firstName ? ` ${input.firstName}` : ''}`;
    const what = !input.hasAgenda
        ? 'No tiene nada pendiente: díselo con buen ánimo y ofrécele ayuda para organizar su día.'
        : input.evening
            ? 'Cuéntale lo que le queda para hoy, lo que tiene mañana y lo que quedó atrasado y sigue abierto.'
            : 'Cuéntale lo que tiene para hoy, con quién y a qué hora, y lo que quedó atrasado y sigue abierto.';
    return `${INITIATIVE_NOTE_PREFIX} es la hora del resumen que el usuario eligió. Empieza con «${hello}». ${what} Sin proponer cambios todavía. ${SPOKEN_STYLE}`;
}

/** What the notification says: an invitation to hear the day, not the summary squeezed in. */
export function summaryPushBody(firstName: string | null, hour: number): string {
    return `${greetingFor(hour)}${firstName ? ` ${firstName}` : ''} ☀️ ¿Te cuento tu día?`;
}

/** Longest summary carried in the notification for the voice to read. */
const SPOKEN_SUMMARY_CHARS = 1500;

export interface InitiativeRecipient {
    userId: string;
    timezone: string;
    pushToken: string | null;
    firstName?: string | null;
    /** The user's choices in Perfil. */
    dailySummary: boolean;
    summaryHour: number;
    summaryMinute: number;
    /** Days of the week it goes out, 0 = Sunday. */
    summaryDays: number[];
    overdueNotices: boolean;
}

/** 0 = Sunday, for the user's own calendar day. */
export function localWeekday(now: Date, timezone: string): number {
    return new Date(`${localDateKey(now, timezone)}T12:00:00.000Z`).getUTCDay();
}

export interface OverdueItem {
    id: string;
    title: string;
    dueAt: string;
}

/** Something the user handed to another person, now late. */
export interface OwedItem extends OverdueItem {
    personName: string;
}

export interface InitiativeDeps {
    now: Date;
    listRecipients(): Promise<InitiativeRecipient[]>;
    /** Whether the user has something open due today or earlier. */
    hasAgendaUntil(userId: string, endIso: string): Promise<boolean>;
    /** Open commitments the user has to do whose time passed between `fromIso` and `toIso`. */
    listOverdue(userId: string, fromIso: string, toIso: string): Promise<OverdueItem[]>;
    /** Open commitments the user handed to someone else whose time passed between `fromIso` and `toIso`. */
    listOwed(userId: string, fromIso: string, toIso: string): Promise<OwedItem[]>;
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
 * What another person owes the user went past its time: Vorian tells the user
 * and prepares a friendly reminder in that person's chat, sent only if the
 * user says yes.
 */
/** How a follow-up of one late item starts, so the user hears why before the proposed message. */
export function owedOpening(item: OwedItem, now: Date, timezone: string): string {
    return `${item.personName.split(' ')[0]} todavía no cumple «${item.title}», que era para ${whenItWas(item.dueAt, now, timezone)}.`;
}

export function owedNote(items: OwedItem[], now: Date, timezone: string): string {
    const tone = 'El recordatorio va en primera persona del usuario, cordial y breve: saluda por el nombre, menciona el compromiso y pregunta cómo va, sin reproches ni presión.';
    if (items.length === 1) {
        const [item] = items;
        return `${INITIATIVE_NOTE_PREFIX} ${item.personName} tenía que cumplir «${item.title}» para ${whenItWas(item.dueAt, now, timezone)} y sigue sin cerrarse. Tu respuesta empieza exactamente con «${owedOpening(item, now, timezone)}», y en la misma respuesta prepárale con find_person y propose_send_message un recordatorio para ${item.personName}, diciéndole el texto y preguntándole si se lo envía. ${tone}`;
    }
    const list = items.map((item) => `${item.personName}: «${item.title}» (${whenItWas(item.dueAt, now, timezone)})`).join('; ');
    return `${INITIATIVE_NOTE_PREFIX} se pasó la fecha de lo que otras personas le deben al usuario y sigue sin cerrarse: ${list}. Avísale en una o dos frases y pregúntale a quién quiere que le escribas para recordárselo, sin preparar mensajes todavía. ${tone}`;
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
    notice?: { body: string; spoken: true },
    opening?: string,
): Promise<void> {
    try {
        const conversationId = await deps.selfConversationId(recipient.userId);
        const { result: raw, memory } = await deps.runTurn({ userId: recipient.userId, text: note, timezone: recipient.timezone, conversationId });
        let answer = raw.response.answer.trim();
        if (!answer) throw new Error('empty_initiative_answer');
        // The model sometimes goes straight to the proposal; the reason comes first.
        if (opening && !answer.startsWith(opening.slice(0, 24))) answer = `${opening} ${answer}`;
        const result: AgentTurnResponse = { ...raw, response: { ...raw.response, answer } };
        const initiativeResult: AgentTurnResponse = { ...result, initiative: { kind } };
        await deps.persistTurn({ userId: recipient.userId, conversationId, key: keys[0], text: note, result: initiativeResult, memory });
        // Tapping the notification opens the chat with Ping; the summary opens
        // the live voice, which says the answer out loud.
        if (recipient.pushToken) {
            await deps.push(
                recipient.pushToken,
                'Vorian',
                notice?.body ?? pushBody(answer),
                notice ? { type: 'ping_assistant', kind, spoken: answer.slice(0, SPOKEN_SUMMARY_CHARS) } : { type: 'ping_assistant', kind },
            );
        }
        for (const key of keys) await deps.complete(key);
    } catch (error: any) {
        for (const key of keys) await deps.fail(key, error?.message ?? String(error));
        throw error;
    }
}

/** Daily summary: once per chosen day, at the user's time (or as soon after as the server can). */
async function dailySummary(recipient: InitiativeRecipient, deps: InitiativeDeps): Promise<boolean> {
    if (!recipient.dailySummary) return false;
    const { hour, minute } = localHourAndMinute(deps.now, recipient.timezone);
    const late = hour * 60 + minute - (recipient.summaryHour * 60 + recipient.summaryMinute);
    if (late < 0 || late >= SUMMARY_CATCH_UP_MINUTES) return false;
    if (!recipient.summaryDays.includes(localWeekday(deps.now, recipient.timezone))) return false;
    const localDate = localDateKey(deps.now, recipient.timezone);
    const key = `daily_summary:${recipient.userId}:${localDate}`;
    const evening = recipient.summaryHour >= EVENING_SUMMARY_HOUR;
    const lastDay = evening ? localDateKey(new Date(deps.now.getTime() + 24 * 60 * 60 * 1000), recipient.timezone) : localDate;
    const until = localDayRangeToIso(undefined, lastDay, recipient.timezone)?.to;
    if (!until) return false;
    // Vorian greets every chosen day, also when there is nothing on.
    const hasAgenda = await deps.hasAgendaUntil(recipient.userId, until);
    if (!(await deps.claim(key, recipient.userId, 'daily_summary', localDate))) return false;
    const firstName = recipient.firstName ?? null;
    const note = summaryNote({ firstName, hour, evening, hasAgenda });
    await deliver(recipient, 'daily_summary', [key], note, deps, { body: summaryPushBody(firstName, hour), spoken: true });
    return true;
}

/** Overdue notices start after a morning summary, or at 9:00 when the summary is later in the day. */
function noticesFromHour(recipient: InitiativeRecipient): number {
    return recipient.summaryHour < 12 ? recipient.summaryHour + 1 : NOTICES_FROM_HOUR;
}

/** Overdue notice: once per item and due time, in daytime, within the daily limit. */
async function overdueNotice(recipient: InitiativeRecipient, deps: InitiativeDeps): Promise<boolean> {
    if (!recipient.overdueNotices) return false;
    const { hour } = localHourAndMinute(deps.now, recipient.timezone);
    if (hour < noticesFromHour(recipient) || hour >= QUIET_FROM_HOUR) return false;
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

/** Follow-up of what others owe the user: once per item and due time, in daytime, within the daily limit. */
async function owedNotice(recipient: InitiativeRecipient, deps: InitiativeDeps): Promise<boolean> {
    if (!recipient.overdueNotices) return false;
    const { hour } = localHourAndMinute(deps.now, recipient.timezone);
    if (hour < noticesFromHour(recipient) || hour >= QUIET_FROM_HOUR) return false;
    const localDate = localDateKey(deps.now, recipient.timezone);
    const to = new Date(deps.now.getTime() - OWED_GRACE_MS);
    const from = new Date(to.getTime() - OWED_WINDOW_MS);
    const owed = await deps.listOwed(recipient.userId, from.toISOString(), to.toISOString());
    if (owed.length === 0) return false;
    if (await deps.countSentOn(recipient.userId, localDate) >= DAILY_INITIATIVE_LIMIT) return false;
    const claimed: Array<{ item: OwedItem; key: string }> = [];
    for (const item of owed) {
        const key = `owed:${item.id}:${item.dueAt}`;
        if (await deps.claim(key, recipient.userId, 'owed', localDate)) claimed.push({ item, key });
    }
    if (claimed.length === 0) return false;
    const items = claimed.map(({ item }) => item);
    const opening = items.length === 1 ? owedOpening(items[0], deps.now, recipient.timezone) : undefined;
    await deliver(recipient, 'owed', claimed.map(({ key }) => key), owedNote(items, deps.now, recipient.timezone), deps, undefined, opening);
    return true;
}

/**
 * The phone's summary alarm rang: the day said now, for the live voice. It
 * counts as that day's summary, so the server does not send it again later;
 * when the summary already went out, a fresh one is told without saving it.
 */
export async function briefingNow(recipient: InitiativeRecipient, deps: InitiativeDeps, persist: boolean): Promise<{ spoken: string }> {
    const { hour } = localHourAndMinute(deps.now, recipient.timezone);
    const localDate = localDateKey(deps.now, recipient.timezone);
    const evening = hour >= EVENING_SUMMARY_HOUR;
    const lastDay = evening ? localDateKey(new Date(deps.now.getTime() + 24 * 60 * 60 * 1000), recipient.timezone) : localDate;
    const until = localDayRangeToIso(undefined, lastDay, recipient.timezone)?.to;
    const hasAgenda = until ? await deps.hasAgendaUntil(recipient.userId, until) : true;
    const note = summaryNote({ firstName: recipient.firstName ?? null, hour, evening, hasAgenda });
    const key = `daily_summary:${recipient.userId}:${localDate}`;
    const claimed = persist && await deps.claim(key, recipient.userId, 'daily_summary', localDate);
    try {
        const conversationId = await deps.selfConversationId(recipient.userId);
        const { result, memory } = await deps.runTurn({ userId: recipient.userId, text: note, timezone: recipient.timezone, conversationId });
        const spoken = result.response.answer.trim();
        if (!spoken) throw new Error('empty_briefing_answer');
        if (claimed) {
            await deps.persistTurn({ userId: recipient.userId, conversationId, key, text: note, result: { ...result, initiative: { kind: 'daily_summary' } }, memory });
            await deps.complete(key);
        }
        return { spoken };
    } catch (error: any) {
        if (claimed) await deps.fail(key, error?.message ?? String(error));
        throw error;
    }
}

/** One engine pass over every user. One user's failure never stops the rest. */
export async function runInitiativePass(deps: InitiativeDeps): Promise<{ summaries: number; overdue: number; owed: number }> {
    const sent = { summaries: 0, overdue: 0, owed: 0 };
    for (const recipient of await deps.listRecipients()) {
        for (const [kind, run] of [['summaries', dailySummary], ['overdue', overdueNotice], ['owed', owedNotice]] as const) {
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

const RECIPIENT_COLUMNS = 'id, full_name, timezone, expo_push_token, assistant_daily_summary, assistant_summary_hour, assistant_summary_minute, assistant_summary_days, assistant_overdue_notices';

function recipientFromRow(row: any): InitiativeRecipient {
    return {
        userId: row.id,
        timezone: resolveAutomationTimezone(row.timezone),
        pushToken: typeof row.expo_push_token === 'string' && row.expo_push_token ? row.expo_push_token : null,
        firstName: typeof row.full_name === 'string' && row.full_name.trim() ? row.full_name.trim().split(/\s+/)[0] : null,
        dailySummary: row.assistant_daily_summary !== false,
        summaryHour: Number.isInteger(row.assistant_summary_hour) ? row.assistant_summary_hour : DEFAULT_SUMMARY_HOUR,
        summaryMinute: Number.isInteger(row.assistant_summary_minute) ? row.assistant_summary_minute : 0,
        summaryDays: Array.isArray(row.assistant_summary_days) ? row.assistant_summary_days : ALL_WEEK,
        overdueNotices: row.assistant_overdue_notices !== false,
    };
}

/** The summary for one person, now (the phone's alarm rang). */
export async function briefingNowForUser(userId: string): Promise<{ spoken: string }> {
    const { data, error } = await supabaseAdmin.from('profiles').select(RECIPIENT_COLUMNS).eq('id', userId).single();
    if (error || !data) throw new Error(`profiles: ${error?.message ?? 'not_found'}`);
    return briefingNow(recipientFromRow(data), productionInitiativeDeps(), isAgentConversationTurnPersistenceEnabled());
}

export function productionInitiativeDeps(now = new Date()): InitiativeDeps {
    return {
        now,
        async listRecipients() {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .select(RECIPIENT_COLUMNS);
            if (error) throw new Error(`profiles: ${error.message}`);
            return (data || []).map(recipientFromRow);
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
        async listOwed(userId, fromIso, toIso) {
            // "Me deben": the user handed it to someone else, who accepted it.
            const { data, error } = await supabaseAdmin
                .from('commitments')
                .select('id, title, due_at, assigned_to_user_id')
                .eq('status', 'accepted')
                .eq('owner_user_id', userId)
                .not('assigned_to_user_id', 'is', null)
                .neq('assigned_to_user_id', userId)
                .gte('due_at', fromIso)
                .lte('due_at', toIso)
                .order('due_at')
                .limit(5);
            if (error) throw new Error(`commitments: ${error.message}`);
            const rows = data || [];
            if (!rows.length) return [];
            const names = await new SupabaseAssistantDataPort(userId).personNames(rows.map((row: any) => row.assigned_to_user_id));
            return rows.map((row: any) => ({
                id: row.id, title: row.title, dueAt: new Date(row.due_at).toISOString(),
                personName: names[row.assigned_to_user_id] ?? 'alguien',
            }));
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
        if (sent.summaries + sent.overdue + sent.owed > 0) console.info('[Initiative] Notices sent', sent);
    } catch (error: any) {
        console.error('[Initiative] Engine pass failed', error?.message ?? error);
    } finally {
        isRunning = false;
    }
}
