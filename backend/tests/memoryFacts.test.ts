// M11 — the remembered-facts surface (Perfil list, "olvida eso") only ever
// touches the actor's own requested facts.
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

import { forgetUserFact, listUserFacts } from '../src/services/memoryFacts.service';
import { forget, list } from '../src/controllers/memoryFacts.controller';

const FACT = '11111111-2222-4333-8444-555555555555';
const OWN_FACT_FILTERS = [['owner_user_id', 'u1'], ['predicate', 'user_requested_memory'], ['status', 'active']];

function responseMock() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

describe('M11 — remembered facts', () => {
    it('lists only the owner\'s active requested facts', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [{ data: [{ id: FACT, canonical_text: 'Mi jefe se llama Pedro', observed_at: '2026-11-01T12:00:00Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);
        expect(await listUserFacts('u1')).toEqual([{ id: FACT, text: 'Mi jefe se llama Pedro', createdAt: '2026-11-01T12:00:00Z' }]);
        expect(mock.getEqCalls('memory_records')).toEqual(OWN_FACT_FILTERS);
    });

    it('forgets by marking deleted, scoped to the owner, and reports a miss', async () => {
        const hit = createSupabaseAdminMock({ memory_records: [{ data: [{ id: FACT }], error: null }] });
        setSupabaseAdminMock(hit);
        expect(await forgetUserFact('u1', FACT)).toBe(true);
        expect(hit.getUpdateCalls('memory_records')).toEqual([{ status: 'deleted' }]);
        expect(hit.getEqCalls('memory_records')).toEqual([['id', FACT], ...OWN_FACT_FILTERS]);

        setSupabaseAdminMock(createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] }));
        expect(await forgetUserFact('u1', FACT)).toBe(false);
    });

    it('the endpoints answer for the signed-in user and reject bad ids', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({ memory_records: [{ data: [], error: null }] }));
        const listed = responseMock();
        await list({ user: { id: 'u1' } } as any, listed);
        expect(listed.json).toHaveBeenCalledWith({ facts: [] });

        const bad = responseMock();
        await forget({ user: { id: 'u1' }, params: { id: 'not-an-id' } } as any, bad);
        expect(bad.status).toHaveBeenCalledWith(400);

        const missing = responseMock();
        await forget({ user: { id: 'u1' }, params: { id: FACT } } as any, missing);
        expect(missing.status).toHaveBeenCalledWith(404);
    });
});
