import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { TtlCache } from '../utils/ttlCache';
import { safeErrorLog } from '../utils/safeError';
import { sendPushNotification } from '../services/push.service';

// The Gastos page: what Vorian costs this month. OpenAI is metered call by
// call in ai_usage; the official OpenAI bill, Agora minutes and Supabase space
// are read from each provider when its keys are present. Render and Supabase
// plans are fixed prices chosen in the panel.

const DAY_MS = 86_400_000;
const TZ = 'America/Santiago';

export const RENDER_PLANS: Record<string, number> = { free: 0, starter: 7, standard: 25, pro: 85 };
export const SUPABASE_PLANS: Record<string, { price: number; databaseMb: number; storageGb: number; monthlyUsers: number }> = {
    free: { price: 0, databaseMb: 500, storageGb: 1, monthlyUsers: 50_000 },
    pro: { price: 25, databaseMb: 8_000, storageGb: 100, monthlyUsers: 100_000 },
};
const AGORA_FREE_MINUTES = 10_000;
// US dollars per 1,000 minutes after the free minutes.
const AGORA_PRICES = { audio: 0.99, hd: 3.99, fullHd: 8.99, twoK: 15.99, fourK: 35.99 };

/** Midnight in Chile on the 1st of the month, as a UTC instant. */
export function monthStart(now: Date): Date {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')!.value);
    const month = Number(parts.find((p) => p.type === 'month')!.value);
    return zonedMidnight(year, month, 1);
}

export function dayStart(now: Date): Date {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return zonedMidnight(get('year'), get('month'), get('day'));
}

function zonedMidnight(year: number, month: number, day: number): Date {
    const guess = Date.UTC(year, month - 1, day);
    const offset = new Date(guess).getTime() - Date.parse(new Date(guess).toLocaleString('en-US', { timeZone: TZ }) + ' UTC');
    return new Date(guess + offset);
}

export function daysInMonth(now: Date): number {
    const start = monthStart(now);
    const next = monthStart(new Date(start.getTime() + 32 * DAY_MS));
    return Math.round((next.getTime() - start.getTime()) / DAY_MS);
}

/** Straight-line guess for the whole month from what has been spent so far. */
export function projectMonth(spent: number, now: Date): number {
    const elapsedDays = Math.max(1, (now.getTime() - monthStart(now).getTime()) / DAY_MS);
    return (spent / elapsedDays) * daysInMonth(now);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

// --- Settings ----------------------------------------------------------------

export type CostSettings = { monthlyBudgetUsd: number | null; renderPlan: string; supabasePlan: string };

export async function getCostSettings(): Promise<CostSettings & { alertLevel: string | null }> {
    const { data } = await supabaseAdmin.from('app_settings').select('monthly_budget_usd, render_plan, supabase_plan, budget_alert_level').eq('id', true).maybeSingle();
    const row = data as any;
    return {
        monthlyBudgetUsd: row?.monthly_budget_usd == null ? null : Number(row.monthly_budget_usd),
        renderPlan: row?.render_plan in RENDER_PLANS ? row.render_plan : 'free',
        supabasePlan: row?.supabase_plan in SUPABASE_PLANS ? row.supabase_plan : 'free',
        alertLevel: row?.budget_alert_level ?? null,
    };
}

export async function updateCostSettings(input: CostSettings): Promise<CostSettings> {
    const { error } = await supabaseAdmin.from('app_settings').upsert({
        id: true,
        monthly_budget_usd: input.monthlyBudgetUsd,
        render_plan: input.renderPlan,
        supabase_plan: input.supabasePlan,
        budget_alert_level: null,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw new AppError('Unable to save settings', 500);
    const { alertLevel: _ignored, ...saved } = await getCostSettings();
    return saved;
}

// --- Providers ---------------------------------------------------------------

const providerCache = new TtlCache<unknown>(10 * 60_000, 16);

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = providerCache.get(key) as T | undefined;
    if (hit !== undefined) return hit;
    const value = await load();
    providerCache.set(key, value);
    return value;
}

type Official = { configured: false } | { configured: true; ok: boolean; monthUsd: number; todayUsd: number };

/** What OpenAI itself has billed this month. Needs OPENAI_ADMIN_KEY. */
export async function openAiOfficial(now: Date): Promise<Official> {
    const key = process.env.OPENAI_ADMIN_KEY?.trim();
    if (!key) return { configured: false };
    return cached('openai', async () => {
        try {
            const start = Math.floor(monthStart(now).getTime() / 1000);
            const res = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${start}&bucket_width=1d&limit=31`, {
                headers: { Authorization: `Bearer ${key}` },
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return { configured: true, ok: false, monthUsd: 0, todayUsd: 0 };
            const body = await res.json() as { data?: Array<{ start_time: number; results?: Array<{ amount?: { value?: number } }> }> };
            const today = dayStart(now).getTime() / 1000;
            let monthUsd = 0;
            let todayUsd = 0;
            for (const bucket of body.data ?? []) {
                const sum = (bucket.results ?? []).reduce((acc, r) => acc + num(r.amount?.value), 0);
                monthUsd += sum;
                // OpenAI's day buckets are UTC days; the last one is "today".
                if (bucket.start_time >= today - DAY_MS / 1000) todayUsd = sum;
            }
            return { configured: true, ok: true, monthUsd, todayUsd };
        } catch (error) {
            console.warn('[Costs] OpenAI costs unavailable:', safeErrorLog(error));
            return { configured: true, ok: false, monthUsd: 0, todayUsd: 0 };
        }
    });
}

type Agora = { configured: false } | { configured: true; ok: boolean; audioMinutes: number; videoMinutes: number; freeMinutes: number; estimatedUsd: number };

export function agoraCost(seconds: { audio: number; hd: number; fullHd: number; twoK: number; fourK: number }): { audioMinutes: number; videoMinutes: number; estimatedUsd: number } {
    const minutes = {
        audio: seconds.audio / 60, hd: seconds.hd / 60, fullHd: seconds.fullHd / 60, twoK: seconds.twoK / 60, fourK: seconds.fourK / 60,
    };
    // The free minutes are used up by the cheapest kind first.
    let free = AGORA_FREE_MINUTES;
    let usd = 0;
    for (const kind of ['audio', 'hd', 'fullHd', 'twoK', 'fourK'] as const) {
        const covered = Math.min(free, minutes[kind]);
        free -= covered;
        usd += ((minutes[kind] - covered) / 1000) * AGORA_PRICES[kind];
    }
    return {
        audioMinutes: Math.round(minutes.audio),
        videoMinutes: Math.round(minutes.hd + minutes.fullHd + minutes.twoK + minutes.fourK),
        estimatedUsd: usd,
    };
}

/** Call minutes this month. Uses the Agora keys already on the server. */
export async function agoraUsage(now: Date): Promise<Agora> {
    const id = process.env.AGORA_REST_ID?.trim();
    const secret = process.env.AGORA_REST_SECRET?.trim();
    const appId = process.env.AGORA_APP_ID?.trim();
    if (!id || !secret || !appId) return { configured: false };
    return cached('agora', async () => {
        try {
            const headers = { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' };
            const projects = await fetch('https://api.agora.io/dev/v1/projects', { headers, signal: AbortSignal.timeout(10_000) });
            if (!projects.ok) return { configured: true, ok: false, audioMinutes: 0, videoMinutes: 0, freeMinutes: AGORA_FREE_MINUTES, estimatedUsd: 0 };
            const list = await projects.json() as { projects?: Array<{ id: string; vendor_key?: string }> };
            const project = (list.projects ?? []).find((p) => p.vendor_key === appId);
            if (!project) return { configured: true, ok: false, audioMinutes: 0, videoMinutes: 0, freeMinutes: AGORA_FREE_MINUTES, estimatedUsd: 0 };
            const iso = (d: Date) => d.toISOString().slice(0, 10);
            const url = `https://api.agora.io/dev/v3/usage?project_id=${encodeURIComponent(project.id)}&from_date=${iso(monthStart(now))}&to_date=${iso(now)}&business=default`;
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return { configured: true, ok: false, audioMinutes: 0, videoMinutes: 0, freeMinutes: AGORA_FREE_MINUTES, estimatedUsd: 0 };
            const body = await res.json() as { usages?: Array<{ usage?: Record<string, number> }> };
            const total = { audio: 0, hd: 0, fullHd: 0, twoK: 0, fourK: 0 };
            for (const day of body.usages ?? []) {
                const u = day.usage ?? {};
                total.audio += num(u.durationAudioAll);
                total.hd += num(u.durationVideoHd);
                total.fullHd += num(u.durationVideoHdp) + num(u.durationVideo1080P);
                total.twoK += num(u.durationVideo2K);
                total.fourK += num(u.durationVideo4K);
            }
            return { configured: true, ok: true, freeMinutes: AGORA_FREE_MINUTES, ...agoraCost(total) };
        } catch (error) {
            console.warn('[Costs] Agora usage unavailable:', safeErrorLog(error));
            return { configured: true, ok: false, audioMinutes: 0, videoMinutes: 0, freeMinutes: AGORA_FREE_MINUTES, estimatedUsd: 0 };
        }
    });
}

async function supabaseUsage(now: Date, plan: string) {
    const limits = SUPABASE_PLANS[plan] ?? SUPABASE_PLANS.free;
    const [storage, active] = await Promise.all([
        supabaseAdmin.rpc('admin_storage_usage'),
        supabaseAdmin.from('user_activity_days').select('user_id').gte('day', monthStart(now).toISOString().slice(0, 10)),
    ]);
    const s = (storage.data ?? {}) as { databaseBytes?: number; storageBytes?: number };
    const monthlyUsers = new Set(((active.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)).size;
    return {
        plan,
        price: limits.price,
        databaseMb: Math.round(num(s.databaseBytes) / 1_048_576),
        databaseLimitMb: limits.databaseMb,
        storageMb: Math.round(num(s.storageBytes) / 1_048_576),
        storageLimitMb: limits.storageGb * 1024,
        monthlyUsers,
        monthlyUsersLimit: limits.monthlyUsers,
    };
}

// --- Page --------------------------------------------------------------------

type Summary = {
    total: number;
    calls: number;
    byFeature: Array<{ feature: string; cost: number; calls: number; input_tokens: number; output_tokens: number }>;
    byModel: Array<{ model: string; cost: number; calls: number; input_tokens: number; output_tokens: number }>;
    byDay: Array<{ day: string; cost: number }>;
    topUsers: Array<{ user_id: string; name: string; cost: number; calls: number }>;
};

async function summary(since: Date): Promise<Summary> {
    const { data, error } = await supabaseAdmin.rpc('admin_cost_summary', { p_since: since.toISOString() });
    if (error) throw new AppError('Unable to load costs', 500);
    const s = (data ?? {}) as any;
    const rows = (list: any[] | undefined) => (list ?? []).map((r) => ({ ...r, cost: num(r.cost), calls: num(r.calls), input_tokens: num(r.input_tokens), output_tokens: num(r.output_tokens) }));
    return { total: num(s.total), calls: num(s.calls), byFeature: rows(s.byFeature), byModel: rows(s.byModel), byDay: rows(s.byDay), topUsers: rows(s.topUsers) };
}

export async function costs(now = new Date()) {
    const settings = await getCostSettings();
    const [month, today, week, last30, official, agora, supabase] = await Promise.all([
        summary(monthStart(now)),
        summary(dayStart(now)),
        summary(new Date(now.getTime() - 7 * DAY_MS)),
        summary(new Date(dayStart(now).getTime() - 29 * DAY_MS)),
        openAiOfficial(now),
        agoraUsage(now),
        supabaseUsage(now, settings.supabasePlan),
    ]);
    const render = { plan: settings.renderPlan, price: RENDER_PLANS[settings.renderPlan] ?? 0 };
    const fixed = render.price + supabase.price;
    const agoraUsd = agora.configured && agora.ok ? agora.estimatedUsd : 0;
    const variable = month.total + agoraUsd;
    const monthTotal = fixed + variable;
    const projected = fixed + projectMonth(variable, now);
    return {
        generatedAt: now.toISOString(),
        totals: {
            today: today.total,
            week: week.total,
            monthAi: month.total,
            month: monthTotal,
            projected,
            budget: settings.monthlyBudgetUsd,
            budgetUsed: settings.monthlyBudgetUsd ? monthTotal / settings.monthlyBudgetUsd : null,
        },
        ai: { calls: month.calls, byFeature: month.byFeature, byModel: month.byModel, topUsers: month.topUsers, byDay: last30.byDay },
        official,
        agora,
        supabase,
        render,
        settings: { monthlyBudgetUsd: settings.monthlyBudgetUsd, renderPlan: settings.renderPlan, supabasePlan: settings.supabasePlan },
    };
}

// --- Budget alert ------------------------------------------------------------

export function alertLevelFor(used: number | null): 80 | 100 | null {
    if (used == null) return null;
    if (used >= 1) return 100;
    if (used >= 0.8) return 80;
    return null;
}

/** Hourly: tells the admins once when the month reaches 80 % and 100 % of the budget. */
export async function runBudgetAlert(now = new Date()): Promise<{ sent: number }> {
    const settings = await getCostSettings();
    if (!settings.monthlyBudgetUsd) return { sent: 0 };
    const page = await costs(now);
    const level = alertLevelFor(page.totals.budgetUsed);
    if (!level) return { sent: 0 };
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(now);
    const key = `${month}:${level}`;
    const [sentMonth, sentLevel] = (settings.alertLevel ?? '').split(':');
    if (sentMonth === month && Number(sentLevel) >= level) return { sent: 0 };
    await supabaseAdmin.from('app_settings').update({ budget_alert_level: key }).eq('id', true);

    const { data: admins } = await supabaseAdmin.from('admin_users').select('user_id');
    const ids = ((admins ?? []) as Array<{ user_id: string }>).map((a) => a.user_id);
    if (!ids.length) return { sent: 0 };
    const { data: people } = await supabaseAdmin.from('profiles').select('expo_push_token').in('id', ids);
    const spent = page.totals.month.toFixed(2);
    const title = level === 100 ? 'Llegaste a tu presupuesto del mes' : 'Vas en el 80 % de tu presupuesto';
    const body = `Este mes Vorian lleva US$ ${spent} de US$ ${settings.monthlyBudgetUsd.toFixed(2)}. Revisa Gastos en el panel.`;
    let sent = 0;
    for (const person of (people ?? []) as Array<{ expo_push_token: string | null }>) {
        if (!person.expo_push_token) continue;
        await sendPushNotification(person.expo_push_token, title, body, { type: 'budget_alert' });
        sent += 1;
    }
    return { sent };
}
