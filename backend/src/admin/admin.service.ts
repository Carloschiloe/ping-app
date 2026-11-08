import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { TtlCache } from '../utils/ttlCache';
import { sendPushNotification } from '../services/push.service';

// Read models and actions for the owner's admin panel. It shows who uses
// Vorian and how much, never what people wrote: no message, commitment or
// assistant text leaves this file.

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const ENDING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PlanStatus = 'suspended' | 'free_access' | 'paid' | 'trial' | 'trial_ending' | 'expired';
export type UserFilter = 'all' | 'online' | 'trial' | 'ending' | 'expired' | 'paid' | 'free' | 'suspended';

type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    phone?: string | null;
    created_at: string;
    last_seen: string | null;
    trial_ends_at: string | null;
    access_plan: string | null;
    suspended_at: string | null;
};

const PROFILE_COLUMNS = 'id, email, full_name, phone, created_at, last_seen, trial_ends_at, access_plan, suspended_at';

export function planStatus(profile: Pick<ProfileRow, 'trial_ends_at' | 'access_plan' | 'suspended_at'>, now = Date.now()): PlanStatus {
    if (profile.suspended_at) return 'suspended';
    if (profile.access_plan === 'free_access') return 'free_access';
    if (profile.access_plan === 'paid') return 'paid';
    const ends = profile.trial_ends_at ? Date.parse(profile.trial_ends_at) : NaN;
    if (!Number.isFinite(ends) || ends <= now) return 'expired';
    return ends - now <= ENDING_SOON_DAYS * DAY_MS ? 'trial_ending' : 'trial';
}

export function trialDaysLeft(trialEndsAt: string | null, now = Date.now()): number | null {
    if (!trialEndsAt) return null;
    return Math.ceil((Date.parse(trialEndsAt) - now) / DAY_MS);
}

export function isOnline(lastSeen: string | null, now = Date.now()): boolean {
    return !!lastSeen && now - Date.parse(lastSeen) < ONLINE_WINDOW_MS;
}

// --- Who may enter -----------------------------------------------------------

const adminCache = new TtlCache<boolean>(60_000, 32);

export async function isAdmin(userId: string): Promise<boolean> {
    const cached = adminCache.get(userId);
    if (cached !== undefined) return cached;
    const { data, error } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw new AppError('Unable to check access', 500);
    adminCache.set(userId, !!data);
    return !!data;
}

function authClient() {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

type AdminSession = { accessToken: string; refreshToken: string; expiresAt: number | null; name: string };

async function adminSession(session: { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } } | null): Promise<AdminSession> {
    if (!session) throw new AppError('Correo o contraseña incorrectos', 401);
    if (!(await isAdmin(session.user.id))) throw new AppError('Esta cuenta no tiene acceso a la administración', 403);
    const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
    return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? null,
        name: (data as { full_name?: string } | null)?.full_name || session.user.email || 'Administrador',
    };
}

export async function signIn(email: string, password: string): Promise<AdminSession> {
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error) throw new AppError('Correo o contraseña incorrectos', 401);
    return adminSession(data.session as any);
}

export async function refresh(refreshToken: string): Promise<AdminSession> {
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error) throw new AppError('La sesión terminó. Vuelve a entrar.', 401);
    return adminSession(data.session as any);
}

// --- Helpers -----------------------------------------------------------------

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
    const { count: total, error } = await query;
    return error ? 0 : total ?? 0;
}

function iso(ms: number): string {
    return new Date(ms).toISOString();
}

function activeProfiles() {
    return supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null);
}

async function latestInstalls(userIds: string[]): Promise<Map<string, { platform: string; app_version: string | null }>> {
    const result = new Map<string, { platform: string; app_version: string | null }>();
    if (userIds.length === 0) return result;
    const { data } = await supabaseAdmin
        .from('app_installs')
        .select('user_id, platform, app_version, last_seen')
        .in('user_id', userIds)
        .order('last_seen', { ascending: false });
    for (const row of (data ?? []) as Array<{ user_id: string; platform: string; app_version: string | null }>) {
        if (!result.has(row.user_id)) result.set(row.user_id, { platform: row.platform, app_version: row.app_version });
    }
    return result;
}

function personSummary(profile: ProfileRow, install: { platform: string; app_version: string | null } | undefined, now: number) {
    return {
        id: profile.id,
        name: profile.full_name || 'Sin nombre',
        email: profile.email,
        createdAt: profile.created_at,
        lastSeen: profile.last_seen,
        online: isOnline(profile.last_seen, now),
        plan: planStatus(profile, now),
        trialEndsAt: profile.trial_ends_at,
        trialDaysLeft: trialDaysLeft(profile.trial_ends_at, now),
        platform: install?.platform ?? null,
        appVersion: install?.app_version ?? null,
    };
}

// --- Overview ----------------------------------------------------------------

export async function overview() {
    const now = Date.now();
    const nowIso = iso(now);
    const [
        users, newThisWeek, onlineNow, activeToday,
        installs, android, ios,
        onTrial, ending, expired, paid, free,
        errors24h, openReports, feedbackWeek,
        seriesResult, onlineRows, errorGroups, settings,
    ] = await Promise.all([
        count(activeProfiles()),
        count(activeProfiles().gte('created_at', iso(now - 7 * DAY_MS))),
        count(activeProfiles().gte('last_seen', iso(now - ONLINE_WINDOW_MS))),
        count(supabaseAdmin.from('user_activity_days').select('user_id', { count: 'exact', head: true })
            .eq('day', new Date(now).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }))),
        count(supabaseAdmin.from('app_installs').select('install_id', { count: 'exact', head: true })),
        count(supabaseAdmin.from('app_installs').select('install_id', { count: 'exact', head: true }).eq('platform', 'android')),
        count(supabaseAdmin.from('app_installs').select('install_id', { count: 'exact', head: true }).eq('platform', 'ios')),
        count(activeProfiles().is('suspended_at', null).eq('access_plan', 'trial').gt('trial_ends_at', nowIso)),
        count(activeProfiles().is('suspended_at', null).eq('access_plan', 'trial').gt('trial_ends_at', nowIso).lte('trial_ends_at', iso(now + ENDING_SOON_DAYS * DAY_MS))),
        count(activeProfiles().is('suspended_at', null).eq('access_plan', 'trial').lte('trial_ends_at', nowIso)),
        count(activeProfiles().is('suspended_at', null).eq('access_plan', 'paid')),
        count(activeProfiles().is('suspended_at', null).eq('access_plan', 'free_access')),
        count(supabaseAdmin.from('app_errors').select('id', { count: 'exact', head: true }).gte('created_at', iso(now - DAY_MS))),
        count(supabaseAdmin.from('content_reports').select('id', { count: 'exact', head: true }).eq('status', 'open')),
        count(supabaseAdmin.from('app_feedback').select('id', { count: 'exact', head: true }).gte('created_at', iso(now - 7 * DAY_MS))),
        supabaseAdmin.rpc('admin_daily_series', { p_days: 30 }),
        supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).is('deleted_at', null)
            .gte('last_seen', iso(now - ONLINE_WINDOW_MS)).order('last_seen', { ascending: false }).limit(8),
        errorGroupsSince(iso(now - 7 * DAY_MS)),
        getSettings(),
    ]);

    const online = (onlineRows.data ?? []) as ProfileRow[];
    const installsByUser = await latestInstalls(online.map((p) => p.id));
    const unresolved = errorGroups.filter((g) => !g.resolved);

    return {
        generatedAt: nowIso,
        users: { total: users, newThisWeek, onlineNow, activeToday },
        installs: { total: installs, android, ios },
        plans: { trial: onTrial, ending, expired, paid, free },
        quality: { errors24h, unresolvedErrors: unresolved.length, openReports, feedbackWeek },
        series: ((seriesResult.data ?? []) as Array<{ day: string; active: number; signups: number }>)
            .map((row) => ({ day: row.day, active: Number(row.active), signups: Number(row.signups) })),
        online: online.map((p) => personSummary(p, installsByUser.get(p.id), now)),
        recentErrors: unresolved.slice(0, 4),
        settings,
    };
}

// --- People ------------------------------------------------------------------

function cleanSearch(value: string): string {
    // PostgREST filter syntax uses , ( ) and * ; keep plain words only.
    return value.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80);
}

export async function listUsers(params: { filter?: UserFilter; search?: string; page?: number }) {
    const now = Date.now();
    const nowIso = iso(now);
    const pageSize = 50;
    const page = Math.max(0, params.page ?? 0);
    let query = supabaseAdmin.from('profiles').select(PROFILE_COLUMNS, { count: 'exact' }).is('deleted_at', null);

    switch (params.filter) {
        case 'online': query = query.gte('last_seen', iso(now - ONLINE_WINDOW_MS)); break;
        case 'trial': query = query.is('suspended_at', null).eq('access_plan', 'trial').gt('trial_ends_at', nowIso); break;
        case 'ending': query = query.is('suspended_at', null).eq('access_plan', 'trial').gt('trial_ends_at', nowIso).lte('trial_ends_at', iso(now + ENDING_SOON_DAYS * DAY_MS)); break;
        case 'expired': query = query.is('suspended_at', null).eq('access_plan', 'trial').lte('trial_ends_at', nowIso); break;
        case 'paid': query = query.is('suspended_at', null).eq('access_plan', 'paid'); break;
        case 'free': query = query.is('suspended_at', null).eq('access_plan', 'free_access'); break;
        case 'suspended': query = query.not('suspended_at', 'is', null); break;
        default: break;
    }

    const search = cleanSearch(params.search ?? '');
    if (search) query = query.or(`full_name.ilike.*${search}*,email.ilike.*${search}*,phone.ilike.*${search}*`);

    const { data, count: total, error } = await query
        .order('last_seen', { ascending: false, nullsFirst: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new AppError('Unable to load users', 500);

    const rows = (data ?? []) as ProfileRow[];
    const installs = await latestInstalls(rows.map((p) => p.id));
    return {
        total: total ?? 0,
        page,
        pageSize,
        users: rows.map((p) => personSummary(p, installs.get(p.id), now)),
    };
}

async function loadProfile(userId: string): Promise<ProfileRow> {
    const { data, error } = await supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).is('deleted_at', null).maybeSingle();
    if (error) throw new AppError('Unable to load user', 500);
    if (!data) throw new AppError('Esta persona no existe o eliminó su cuenta', 404);
    return data as ProfileRow;
}

export async function userDetail(userId: string) {
    const now = Date.now();
    const profile = await loadProfile(userId);
    const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    const monthAgo = new Date(now - 29 * DAY_MS).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    const [conversations, commitments, activeDays30, assistantTurns, installs, history] = await Promise.all([
        count(supabaseAdmin.from('conversation_participants').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)),
        count(supabaseAdmin.from('commitments').select('id', { count: 'exact', head: true }).eq('owner_user_id', userId)),
        count(supabaseAdmin.from('user_activity_days').select('day', { count: 'exact', head: true }).eq('user_id', userId).gte('day', monthAgo).lte('day', today)),
        count(supabaseAdmin.from('agent_conversation_turns').select('id', { count: 'exact', head: true }).eq('actor_user_id', userId)),
        supabaseAdmin.from('app_installs').select('platform, app_version, os_version, first_seen, last_seen').eq('user_id', userId).order('last_seen', { ascending: false }).limit(5),
        supabaseAdmin.from('admin_audit').select('action, detail, created_at').eq('target_user_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);
    const devices = (installs.data ?? []) as Array<{ platform: string; app_version: string | null; os_version: string | null; first_seen: string; last_seen: string }>;
    return {
        ...personSummary(profile, devices[0], now),
        phone: profile.phone ?? null,
        suspended: !!profile.suspended_at,
        counts: { conversations, commitments, activeDays30, assistantTurns },
        devices,
        history: history.data ?? [],
    };
}

async function audit(adminId: string, targetUserId: string, action: string, detail: Record<string, unknown> = {}) {
    await supabaseAdmin.from('admin_audit').insert({ admin_id: adminId, target_user_id: targetUserId, action, detail });
}

export async function extendTrial(adminId: string, userId: string, days: number) {
    const profile = await loadProfile(userId);
    const base = Math.max(Date.now(), profile.trial_ends_at ? Date.parse(profile.trial_ends_at) : 0);
    const trialEndsAt = iso(base + days * DAY_MS);
    const { error } = await supabaseAdmin.from('profiles').update({ trial_ends_at: trialEndsAt }).eq('id', userId);
    if (error) throw new AppError('Unable to extend trial', 500);
    await audit(adminId, userId, 'trial_extended', { days, trialEndsAt });
    return { trialEndsAt };
}

export async function setPlan(adminId: string, userId: string, plan: 'trial' | 'free_access') {
    await loadProfile(userId);
    const { error } = await supabaseAdmin.from('profiles').update({ access_plan: plan }).eq('id', userId);
    if (error) throw new AppError('Unable to change plan', 500);
    await audit(adminId, userId, plan === 'free_access' ? 'free_access_granted' : 'free_access_removed');
    return { plan };
}

export async function setSuspended(adminId: string, userId: string, suspended: boolean) {
    if (userId === adminId) throw new AppError('No puedes suspender tu propia cuenta', 400);
    if (suspended && (await isAdmin(userId))) throw new AppError('No se puede suspender a un administrador', 400);
    await loadProfile(userId);
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: suspended ? '876000h' : 'none' } as any);
    if (banError) throw new AppError('Unable to change access', 500);
    const { error } = await supabaseAdmin.from('profiles').update({ suspended_at: suspended ? new Date().toISOString() : null }).eq('id', userId);
    if (error) throw new AppError('Unable to change access', 500);
    await audit(adminId, userId, suspended ? 'suspended' : 'reactivated');
    return { suspended };
}

export async function sendNotice(adminId: string, userId: string, title: string, body: string) {
    const { data, error } = await supabaseAdmin.from('profiles').select('expo_push_token').eq('id', userId).is('deleted_at', null).maybeSingle();
    if (error) throw new AppError('Unable to send notice', 500);
    const token = (data as { expo_push_token?: string | null } | null)?.expo_push_token;
    if (!token) throw new AppError('Esta persona no tiene los avisos activados en su teléfono', 409);
    await sendPushNotification(token, title, body);
    await audit(adminId, userId, 'notice_sent', { title });
    return { sent: true };
}

// --- Plans and payments ------------------------------------------------------

export async function plans() {
    const now = Date.now();
    const nowIso = iso(now);
    const ending = await supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).is('deleted_at', null).is('suspended_at', null)
        .eq('access_plan', 'trial').gt('trial_ends_at', nowIso).lte('trial_ends_at', iso(now + ENDING_SOON_DAYS * DAY_MS))
        .order('trial_ends_at', { ascending: true }).limit(50);
    const recentlyExpired = await supabaseAdmin.from('profiles').select(PROFILE_COLUMNS).is('deleted_at', null).is('suspended_at', null)
        .eq('access_plan', 'trial').lte('trial_ends_at', nowIso).gte('trial_ends_at', iso(now - 30 * DAY_MS))
        .order('trial_ends_at', { ascending: false }).limit(50);
    const rows = [...(ending.data ?? []), ...(recentlyExpired.data ?? [])] as ProfileRow[];
    const installs = await latestInstalls(rows.map((p) => p.id));
    return {
        ending: ((ending.data ?? []) as ProfileRow[]).map((p) => personSummary(p, installs.get(p.id), now)),
        recentlyExpired: ((recentlyExpired.data ?? []) as ProfileRow[]).map((p) => personSummary(p, installs.get(p.id), now)),
    };
}

// --- Errors ------------------------------------------------------------------

export type ErrorGroup = {
    fingerprint: string; source: string; title: string; location: string | null;
    appVersion: string | null; platform: string | null;
    occurrences: number; people: number; firstAt: string; lastAt: string; resolved: boolean;
};

export async function errorGroupsSince(since: string): Promise<ErrorGroup[]> {
    const { data, error } = await supabaseAdmin.rpc('admin_error_groups', { p_since: since });
    if (error) return [];
    return ((data ?? []) as any[]).map((row) => ({
        fingerprint: row.fingerprint,
        source: row.source,
        title: row.title,
        location: row.location,
        appVersion: row.app_version,
        platform: row.platform,
        occurrences: Number(row.occurrences),
        people: Number(row.people),
        firstAt: row.first_at,
        lastAt: row.last_at,
        // A group comes back when it fails again after being marked as fixed.
        resolved: !!row.resolved_at && Date.parse(row.resolved_at) >= Date.parse(row.last_at),
    }));
}

export async function errorDetail(fingerprint: string) {
    const { data, error } = await supabaseAdmin.from('app_errors')
        .select('source, title, detail, location, app_version, platform, created_at')
        .eq('fingerprint', fingerprint).order('created_at', { ascending: false }).limit(10);
    if (error) throw new AppError('Unable to load error', 500);
    return { occurrences: data ?? [] };
}

export async function resolveError(fingerprint: string, resolved: boolean) {
    const result = resolved
        ? await supabaseAdmin.from('app_error_resolutions').upsert({ fingerprint, resolved_at: new Date().toISOString() }, { onConflict: 'fingerprint' })
        : await supabaseAdmin.from('app_error_resolutions').delete().eq('fingerprint', fingerprint);
    if (result.error) throw new AppError('Unable to update error', 500);
    return { resolved };
}

// --- Feedback and reports ----------------------------------------------------

async function names(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const { data } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', unique);
    for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        map.set(row.id, row.full_name || row.email || 'Sin nombre');
    }
    return map;
}

export async function feedbackAndReports() {
    const [feedback, reports] = await Promise.all([
        supabaseAdmin.from('app_feedback').select('id, user_id, kind, message, app_version, platform, created_at').order('created_at', { ascending: false }).limit(100),
        supabaseAdmin.from('content_reports').select('id, reporter_id, reported_user_id, kind, reason, details, excerpt, status, created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    const feedbackRows = (feedback.data ?? []) as any[];
    const reportRows = (reports.data ?? []) as any[];
    const who = await names([
        ...feedbackRows.map((f) => f.user_id),
        ...reportRows.flatMap((r) => [r.reporter_id, r.reported_user_id]),
    ]);
    return {
        feedback: feedbackRows.map((f) => ({
            id: f.id, kind: f.kind, message: f.message, appVersion: f.app_version, platform: f.platform,
            createdAt: f.created_at, userId: f.user_id, person: f.user_id ? who.get(f.user_id) ?? 'Cuenta eliminada' : 'Cuenta eliminada',
        })),
        // A report is what someone chose to send for review, so its excerpt is shown.
        reports: reportRows.map((r) => ({
            id: r.id, kind: r.kind, reason: r.reason, details: r.details, excerpt: r.excerpt, status: r.status, createdAt: r.created_at,
            reporter: r.reporter_id ? who.get(r.reporter_id) ?? 'Cuenta eliminada' : 'Cuenta eliminada',
            reportedUserId: r.reported_user_id,
            reported: r.reported_user_id ? who.get(r.reported_user_id) ?? 'Cuenta eliminada' : null,
        })),
    };
}

export async function setReportStatus(reportId: string, status: 'open' | 'reviewed' | 'dismissed') {
    const { error } = await supabaseAdmin.from('content_reports').update({ status }).eq('id', reportId);
    if (error) throw new AppError('Unable to update report', 500);
    return { status };
}

// --- Assistant ---------------------------------------------------------------

export async function assistantUsage() {
    const now = Date.now();
    const turns = () => supabaseAdmin.from('agent_conversation_turns').select('id', { count: 'exact', head: true });
    const [today, week, month, voiceMonth, top] = await Promise.all([
        count(turns().gte('created_at', iso(now - DAY_MS))),
        count(turns().gte('created_at', iso(now - 7 * DAY_MS))),
        count(turns().gte('created_at', iso(now - 30 * DAY_MS))),
        count(turns().gte('created_at', iso(now - 30 * DAY_MS)).neq('input_mode', 'text')),
        supabaseAdmin.rpc('admin_assistant_top', { p_since: iso(now - 30 * DAY_MS) }),
    ]);
    const topRows = (top.data ?? []) as Array<{ user_id: string; turns: number; voice_turns: number }>;
    const who = await names(topRows.map((r) => r.user_id));
    return {
        day: today, week, month, voiceMonth,
        top: topRows.map((r) => ({ userId: r.user_id, name: who.get(r.user_id) ?? 'Cuenta eliminada', turns: Number(r.turns), voiceTurns: Number(r.voice_turns) })),
    };
}

// --- System ------------------------------------------------------------------

async function timed<T>(work: () => PromiseLike<T>): Promise<{ ok: boolean; ms: number }> {
    const started = Date.now();
    try {
        const result: any = await work();
        return { ok: !result?.error, ms: Date.now() - started };
    } catch {
        return { ok: false, ms: Date.now() - started };
    }
}

export async function system() {
    const now = Date.now();
    const [database, auth, pushSent, pushFailed, versions] = await Promise.all([
        timed(() => supabaseAdmin.from('app_settings').select('id').limit(1)),
        timed(() => supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })),
        count(supabaseAdmin.from('notification_delivery_ledger').select('status', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', iso(now - DAY_MS))),
        count(supabaseAdmin.from('notification_delivery_ledger').select('status', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', iso(now - DAY_MS))),
        supabaseAdmin.from('app_installs').select('platform, app_version').gte('last_seen', iso(now - 30 * DAY_MS)).limit(5000),
    ]);
    const versionCounts = new Map<string, number>();
    for (const row of (versions.data ?? []) as Array<{ platform: string; app_version: string | null }>) {
        const key = `${row.platform === 'ios' ? 'iPhone' : row.platform === 'android' ? 'Android' : 'Otro'} · ${row.app_version ?? '¿?'}`;
        versionCounts.set(key, (versionCounts.get(key) ?? 0) + 1);
    }
    const memory = process.memoryUsage();
    return {
        server: {
            ok: true,
            uptimeSeconds: Math.round(process.uptime()),
            memoryMb: Math.round(memory.rss / 1024 / 1024),
            node: process.version,
            commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || null,
            environment: process.env.PING_ENVIRONMENT || process.env.NODE_ENV || 'local',
        },
        database,
        auth,
        push: { sent24h: pushSent, failed24h: pushFailed },
        assistantConfigured: !!process.env.OPENAI_API_KEY,
        versions: [...versionCounts.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
    };
}

// --- Settings ----------------------------------------------------------------

export type Settings = { trialDays: number; noticeDays: number[]; monthlyPriceClp: number | null; annualPriceClp: number | null };

export async function getSettings(): Promise<Settings> {
    const { data } = await supabaseAdmin.from('app_settings').select('trial_days, notice_days, monthly_price_clp, annual_price_clp').eq('id', true).maybeSingle();
    const row = data as any;
    return {
        trialDays: row?.trial_days ?? 30,
        noticeDays: row?.notice_days ?? [7, 3, 1],
        monthlyPriceClp: row?.monthly_price_clp ?? null,
        annualPriceClp: row?.annual_price_clp ?? null,
    };
}

export async function updateSettings(input: Settings): Promise<Settings> {
    const { error } = await supabaseAdmin.from('app_settings').upsert({
        id: true,
        trial_days: input.trialDays,
        notice_days: [...new Set(input.noticeDays)].sort((a, b) => b - a),
        monthly_price_clp: input.monthlyPriceClp,
        annual_price_clp: input.annualPriceClp,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw new AppError('Unable to save settings', 500);
    return getSettings();
}
