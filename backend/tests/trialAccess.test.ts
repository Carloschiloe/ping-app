import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    settings: { enforce_trial: false, notice_days: [7, 3, 1] } as any,
    profile: null as any,
    people: [] as Array<{ id: string; expo_push_token: string }>,
    alreadySent: new Set<string>(),
    push: vi.fn(async () => undefined),
}));

vi.mock('../src/services/push.service', () => ({ sendPushNotification: mocks.push }));

vi.mock('../src/lib/supabaseAdmin', () => {
    const chain = (table: string): any => {
        const proxy: any = new Proxy(() => undefined, {
            get(_t, prop: string) {
                if (prop === 'then') {
                    return (resolve: any) => resolve({ data: table === 'profiles' ? mocks.people : [], error: null });
                }
                if (prop === 'maybeSingle') {
                    return async () => ({ data: table === 'app_settings' ? mocks.settings : mocks.profile, error: null });
                }
                if (prop === 'upsert') {
                    return (rows: Array<{ user_id: string; kind: string }>) => ({
                        select: async () => {
                            const fresh = rows.filter((r) => !mocks.alreadySent.has(`${r.user_id}:${r.kind}`));
                            fresh.forEach((r) => mocks.alreadySent.add(`${r.user_id}:${r.kind}`));
                            return { data: fresh.map((r) => ({ user_id: r.user_id })), error: null };
                        },
                    });
                }
                return () => proxy;
            },
        });
        return proxy;
    };
    return { supabaseAdmin: { from: (table: string) => chain(table) } };
});

import { accessFor, forgetAccessCache, noticeText, requirePlan, runTrialNotices } from '../src/services/access.service';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-09T12:00:00Z');
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

function run(userId = 'u1') {
    const res: any = { statusCode: 200, body: null, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    const next = vi.fn();
    return requirePlan({ user: { id: userId } } as any, res, next).then(() => ({ res, next }));
}

beforeEach(() => {
    forgetAccessCache('u1');
    mocks.push.mockClear();
    mocks.alreadySent.clear();
    mocks.settings = { enforce_trial: false, notice_days: [7, 3, 1] };
});

describe('who may use what after the free trial', () => {
    it('only locks an ended trial or a suspension, and only with the switch on', () => {
        expect(accessFor({ access_plan: 'trial', trial_ends_at: at(-1) }, true, NOW).locked).toBe(true);
        expect(accessFor({ access_plan: 'trial', trial_ends_at: at(-1) }, false, NOW).locked).toBe(false);
        expect(accessFor({ access_plan: 'trial', trial_ends_at: at(3) }, true, NOW)).toMatchObject({ status: 'trial_ending', daysLeft: 3, locked: false });
        expect(accessFor({ access_plan: 'free_access', trial_ends_at: at(-90) }, true, NOW).locked).toBe(false);
        expect(accessFor({ access_plan: 'paid', trial_ends_at: at(-90) }, true, NOW).locked).toBe(false);
        expect(accessFor({ access_plan: 'paid', suspended_at: at(-1) }, true, NOW).locked).toBe(true);
    });

    it('an account with no trial date yet is never locked', () => {
        expect(accessFor({ access_plan: 'trial', trial_ends_at: null }, true, NOW).locked).toBe(false);
    });

    it('turns away an ended trial with 402 when the switch is on', async () => {
        mocks.settings = { enforce_trial: true, notice_days: [7, 3, 1] };
        mocks.profile = { access_plan: 'trial', trial_ends_at: new Date(Date.now() - DAY).toISOString(), suspended_at: null };
        const { res, next } = await run();
        expect(res.statusCode).toBe(402);
        expect(res.body.code).toBe('plan_required');
        expect(next).not.toHaveBeenCalled();
    });

    it('lets everyone through while the switch is off', async () => {
        mocks.profile = { access_plan: 'trial', trial_ends_at: new Date(Date.now() - DAY).toISOString(), suspended_at: null };
        const { res, next } = await run();
        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalled();
    });
});

describe('trial notices', () => {
    it('says how many days are left, then that it ended', () => {
        expect(noticeText(7).title).toBe('Te quedan 7 días de prueba gratis');
        expect(noticeText(1).title).toBe('Mañana termina tu prueba gratis');
        expect(noticeText(0).title).toBe('Tu prueba gratis terminó');
    });

    it('sends nothing while the switch is off', async () => {
        mocks.people = [{ id: 'p1', expo_push_token: 'ExponentPushToken[x]' }];
        expect(await runTrialNotices(NOW)).toEqual({ sent: 0 });
        expect(mocks.push).not.toHaveBeenCalled();
    });

    it('never sends the same notice twice', async () => {
        mocks.settings = { enforce_trial: true, notice_days: [3] };
        forgetAccessCache();
        mocks.people = [{ id: 'p1', expo_push_token: 'ExponentPushToken[x]' }];
        const first = await runTrialNotices(NOW);
        const second = await runTrialNotices(NOW);
        // The double returns the same person for every window: one "3 days"
        // and one "ended" notice the first time, none the second.
        expect(first.sent).toBe(2);
        expect(second.sent).toBe(0);
    });
});
