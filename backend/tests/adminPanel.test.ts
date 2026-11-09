import { readFileSync } from 'fs';
import { join } from 'path';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    admins: new Set<string>(),
    inserts: [] as Array<{ table: string; row: any }>,
    upserts: [] as Array<{ table: string; row: any }>,
}));

vi.mock('../src/lib/supabaseAdmin', () => {
    const chain = (table: string): any => {
        let id: string | undefined;
        const proxy: any = new Proxy(() => undefined, {
            get(_t, prop: string) {
                if (prop === 'then') return (resolve: any) => resolve({ data: [], error: null, count: 0 });
                if (prop === 'eq') return (_c: string, value: string) => { id = value; return proxy; };
                if (prop === 'maybeSingle') return async () => ({ data: table === 'admin_users' && id && mocks.admins.has(id) ? { user_id: id } : null, error: null });
                if (prop === 'insert') return async (row: any) => { mocks.inserts.push({ table, row }); return { error: null }; };
                if (prop === 'upsert') return async (row: any) => { mocks.upserts.push({ table, row }); return { error: null }; };
                return () => proxy;
            },
        });
        return proxy;
    };
    return {
        supabaseAdmin: {
            from: (table: string) => chain(table),
            rpc: async () => ({ data: [], error: null }),
            auth: { getUser: mocks.getUser, admin: {} },
        },
    };
});

import { planStatus, trialDaysLeft, isOnline } from '../src/admin/admin.service';
import { errorFingerprint, requestLocation } from '../src/services/appTelemetry.service';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-08T12:00:00Z');

describe('plan and trial shown in the panel', () => {
    const at = (days: number) => new Date(NOW + days * DAY).toISOString();

    it('tells a running trial from one about to end and one that ended', () => {
        expect(planStatus({ access_plan: 'trial', trial_ends_at: at(20), suspended_at: null }, NOW)).toBe('trial');
        expect(planStatus({ access_plan: 'trial', trial_ends_at: at(5), suspended_at: null }, NOW)).toBe('trial_ending');
        expect(planStatus({ access_plan: 'trial', trial_ends_at: at(-1), suspended_at: null }, NOW)).toBe('expired');
        expect(trialDaysLeft(at(5), NOW)).toBe(5);
    });

    it('a suspension wins over any plan; free access and paid never expire', () => {
        expect(planStatus({ access_plan: 'paid', trial_ends_at: at(-40), suspended_at: at(-1) }, NOW)).toBe('suspended');
        expect(planStatus({ access_plan: 'free_access', trial_ends_at: at(-40), suspended_at: null }, NOW)).toBe('free_access');
        expect(planStatus({ access_plan: 'paid', trial_ends_at: at(-40), suspended_at: null }, NOW)).toBe('paid');
    });

    it('online means seen in the last five minutes', () => {
        expect(isOnline(new Date(NOW - 2 * 60_000).toISOString(), NOW)).toBe(true);
        expect(isOnline(new Date(NOW - 10 * 60_000).toISOString(), NOW)).toBe(false);
        expect(isOnline(null, NOW)).toBe(false);
    });
});

describe('errors are grouped, without ids or private data', () => {
    it('the same failure on different records groups together', () => {
        const a = errorFingerprint('server', 'Not found 123', requestLocation('GET', '/api/conversations/0b6f4c1e-1111-4222-8333-444455556666/messages?x=1'));
        const b = errorFingerprint('server', 'Not found 987', requestLocation('get', '/api/conversations/9e9e9e9e-1111-4222-8333-444455556666/messages'));
        expect(a).toBe(b);
        expect(requestLocation('GET', '/api/conversations/0b6f4c1e-1111-4222-8333-444455556666/messages?token=abc')).toBe('GET /api/conversations/:id/messages');
    });

    it('different failures stay apart', () => {
        expect(errorFingerprint('app', 'TypeError: x is undefined')).not.toBe(errorFingerprint('server', 'TypeError: x is undefined'));
    });
});

describe('admin panel page', () => {
    const dir = join(__dirname, '../public/admin');
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const script = readFileSync(join(dir, 'app.js'), 'utf8');

    it('loads its script from a file, as the security policy requires, and stays out of search engines', () => {
        expect(html).toContain('<script src="/admin/app.js"></script>');
        expect(html.match(/<script/g)).toHaveLength(1);
        expect(html).toContain('noindex');
    });

    it('escapes what comes from the server and never shows message text', () => {
        expect(script).toContain('function esc(');
        expect(script).toContain('nunca se ven sus mensajes');
    });

    it('every summary card opens its detail and each failure is told in plain words', () => {
        for (const href of ["'#usuarios/online'", "'#usuarios/all'", "'#sistema'", "'#errores'"]) expect(script).toContain(href);
        expect(script).toContain('Qué revisar hoy');
        expect(script).toContain('Qué significa');
        expect(script).toContain('Qué hacer');
    });
});

describe('admin API access', () => {
    let server: Server;
    let base: string;

    beforeAll(async () => {
        const { app } = await import('../src/app');
        await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
        const address = server.address();
        base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    }, 30000);

    afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('turns away anyone without a session', async () => {
        const res = await fetch(`${base}/admin/api/overview`);
        expect(res.status).toBe(401);
        expect(res.headers.get('cache-control')).toBe('no-store');
    });

    it('turns away a signed-in person who is not an admin', async () => {
        mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-person' } }, error: null });
        const res = await fetch(`${base}/admin/api/overview`, { headers: { Authorization: 'Bearer person-token' } });
        expect(res.status).toBe(403);
    });

    it('lets an admin in', async () => {
        mocks.admins.add('u-admin');
        mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-admin' } }, error: null });
        const res = await fetch(`${base}/admin/api/settings`, { headers: { Authorization: 'Bearer admin-token' } });
        expect(res.status).toBe(200);
        expect((await res.json()).trialDays).toBe(30);
    });

    it('serves the page without caching it', async () => {
        const res = await fetch(`${base}/admin`);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.text()).toContain('Administración de Vorian');
    });

    it('records the phone the app runs on', async () => {
        mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-person' } }, error: null });
        const res = await fetch(`${base}/api/app/hello`, {
            method: 'POST',
            headers: { Authorization: 'Bearer person-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ installId: 'abcDEF123456', platform: 'ios', appVersion: '1.0.0', osVersion: '18.1' }),
        });
        expect(res.status).toBe(200);
        expect(mocks.upserts.at(-1)).toMatchObject({ table: 'app_installs', row: { install_id: 'abcDEF123456', user_id: 'u-person', platform: 'ios' } });
    });

    it('records an app error', async () => {
        mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'u-person' } }, error: null });
        const res = await fetch(`${base}/api/app/errors`, {
            method: 'POST',
            headers: { Authorization: 'Bearer person-token', 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'TypeError: cannot read x', location: 'Cierre inesperado', platform: 'android' }),
        });
        expect(res.status).toBe(201);
        expect(mocks.inserts.at(-1)).toMatchObject({ table: 'app_errors', row: { source: 'app', user_id: 'u-person', title: 'TypeError: cannot read x' } });
    });
});
