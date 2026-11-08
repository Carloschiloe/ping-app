import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { TtlCache } from '../utils/ttlCache';
import { sendPushNotification } from './push.service';

// What a person may use once the free trial ends. Reading and answering
// messages, and seeing commitments, always work: the other person in a chat
// may be paying. The assistant, summaries, new commitments and starting a
// call need a plan, but only while the owner has the switch on
// (app_settings.enforce_trial). If anything here fails, the person keeps
// access: a hiccup must never lock someone out.

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessStatus = 'trial' | 'trial_ending' | 'expired' | 'paid' | 'free_access' | 'suspended';

export type Access = {
    status: AccessStatus;
    trialEndsAt: string | null;
    daysLeft: number | null;
    enforced: boolean;
    locked: boolean;
};

type TrialRules = { enforced: boolean; noticeDays: number[] };

const rulesCache = new TtlCache<TrialRules>(60_000, 1);
const accessCache = new TtlCache<Access>(30_000, 2048);

export async function trialRules(): Promise<TrialRules> {
    const cached = rulesCache.get('rules');
    if (cached) return cached;
    const { data, error } = await supabaseAdmin.from('app_settings').select('enforce_trial, notice_days').eq('id', true).maybeSingle();
    const row = data as { enforce_trial?: boolean; notice_days?: number[] } | null;
    const rules = { enforced: !error && !!row?.enforce_trial, noticeDays: row?.notice_days ?? [7, 3, 1] };
    if (!error) rulesCache.set('rules', rules);
    return rules;
}

export function forgetAccessCache(userId?: string): void {
    if (userId) accessCache.delete(userId);
    rulesCache.delete('rules');
}

export function accessFor(profile: { access_plan?: string | null; trial_ends_at?: string | null; suspended_at?: string | null }, enforced: boolean, now = Date.now()): Access {
    const ends = profile.trial_ends_at ? Date.parse(profile.trial_ends_at) : NaN;
    const daysLeft = Number.isFinite(ends) ? Math.ceil((ends - now) / DAY_MS) : null;
    let status: AccessStatus;
    if (profile.suspended_at) status = 'suspended';
    else if (profile.access_plan === 'free_access') status = 'free_access';
    else if (profile.access_plan === 'paid') status = 'paid';
    // No end date yet (an account from before trials existed) counts as trial.
    else if (!Number.isFinite(ends)) status = 'trial';
    else if (ends <= now) status = 'expired';
    else status = daysLeft !== null && daysLeft <= 7 ? 'trial_ending' : 'trial';
    return {
        status,
        trialEndsAt: profile.trial_ends_at ?? null,
        daysLeft: status === 'trial' || status === 'trial_ending' || status === 'expired' ? daysLeft : null,
        enforced,
        locked: enforced && (status === 'expired' || status === 'suspended'),
    };
}

export async function getAccess(userId: string): Promise<Access> {
    const cached = accessCache.get(userId);
    if (cached) return cached;
    const rules = await trialRules();
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('access_plan, trial_ends_at, suspended_at')
        .eq('id', userId)
        .maybeSingle();
    if (error || !data) return accessFor({ access_plan: 'free_access' }, false);
    const access = accessFor(data as any, rules.enforced);
    accessCache.set(userId, access);
    return access;
}

export const PLAN_REQUIRED_MESSAGE = 'Tu prueba gratis terminó. Puedes seguir leyendo y respondiendo tus mensajes; el asistente, los resúmenes, los compromisos nuevos y las llamadas vuelven con un plan.';

/** Route guard for what needs a plan once the trial ends. */
export async function requirePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const access = await getAccess(req.user!.id);
        if (access.locked) {
            res.status(402).json({ status: 'error', code: 'plan_required', message: PLAN_REQUIRED_MESSAGE });
            return;
        }
    } catch {
        // Never lock someone out because the check itself failed.
    }
    next();
}

// --- Trial notices -----------------------------------------------------------

export function noticeText(daysLeft: number): { title: string; body: string } {
    if (daysLeft <= 0) {
        return { title: 'Tu prueba gratis terminó', body: 'Tus mensajes siguen ahí. Activa un plan para seguir usando el asistente y crear compromisos.' };
    }
    if (daysLeft === 1) {
        return { title: 'Mañana termina tu prueba gratis', body: 'Después de mañana, el asistente y los compromisos nuevos necesitarán un plan.' };
    }
    return { title: `Te quedan ${daysLeft} días de prueba gratis`, body: 'Sigue aprovechando Vorian: el asistente, los resúmenes y tus compromisos.' };
}

type NoticeTarget = { id: string; expo_push_token: string | null };

async function claimAndSend(people: NoticeTarget[], kind: string, text: { title: string; body: string }): Promise<number> {
    const withPhone = people.filter((p) => !!p.expo_push_token);
    if (withPhone.length === 0) return 0;
    // Only rows actually inserted come back, so a notice already sent (or
    // claimed by an overlapping run) is never sent again.
    const { data, error } = await supabaseAdmin
        .from('trial_notices')
        .upsert(withPhone.map((p) => ({ user_id: p.id, kind })), { onConflict: 'user_id,kind', ignoreDuplicates: true })
        .select('user_id');
    if (error) return 0;
    const claimed = new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    let sent = 0;
    for (const person of withPhone) {
        if (!claimed.has(person.id)) continue;
        await sendPushNotification(person.expo_push_token!, text.title, text.body, { type: 'trial_notice', kind });
        sent++;
    }
    return sent;
}

function trialPeople() {
    return supabaseAdmin
        .from('profiles')
        .select('id, expo_push_token')
        .is('deleted_at', null)
        .is('suspended_at', null)
        .eq('access_plan', 'trial')
        .not('expo_push_token', 'is', null)
        .limit(1000);
}

/** Runs every hour. Sends each person each notice once, only while the switch is on. */
export async function runTrialNotices(now = Date.now()): Promise<{ sent: number }> {
    const rules = await trialRules();
    if (!rules.enforced) return { sent: 0 };
    let sent = 0;
    for (const days of rules.noticeDays) {
        const { data } = await trialPeople()
            .gt('trial_ends_at', new Date(now + (days - 1) * DAY_MS).toISOString())
            .lte('trial_ends_at', new Date(now + days * DAY_MS).toISOString());
        sent += await claimAndSend((data ?? []) as NoticeTarget[], `days_${days}`, noticeText(days));
    }
    // Only trials that ended in the last three days, so turning the switch on
    // doesn't message everyone whose trial ended long ago.
    const { data: ended } = await trialPeople()
        .lte('trial_ends_at', new Date(now).toISOString())
        .gt('trial_ends_at', new Date(now - 3 * DAY_MS).toISOString());
    sent += await claimAndSend((ended ?? []) as NoticeTarget[], 'ended', noticeText(0));
    return { sent };
}
