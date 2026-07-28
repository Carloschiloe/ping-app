import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

function mockReqRes(body: any, userId = 'u1') {
    const req: any = { user: { id: userId }, body, params: {} };
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res: any = { status: statusMock, json: jsonMock };
    const next = vi.fn();
    return { req, res, next, jsonMock, statusMock };
}

describe('createGroup', () => {
    it('la creacion de grupo usa conversation_type="group" (no is_group/admin_id)', async () => {
        const mock = createSupabaseAdminMock({
            conversations: [{ data: { id: 'g1', name: 'Equipo' }, error: null }],
            conversation_participants: [
                { data: [{ conversation_id: 'existing' }], error: null },
                { data: [{ user_id: 'u2' }, { user_id: 'u3' }], error: null },
                { data: null, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { createGroup } = await import('../src/controllers/group.controller');
        const { req, res, next } = mockReqRes({ name: 'Equipo', participantIds: ['u2', 'u3'] });

        await createGroup(req, res, next);

        const insertPayload = mock.getInsertCalls('conversations')[0];
        expect(insertPayload.conversation_type).toBe('group');
        expect(insertPayload).not.toHaveProperty('is_group');
        expect(insertPayload).not.toHaveProperty('admin_id');
        expect(next).not.toHaveBeenCalled();
    });

    it('el creador del grupo queda con role="admin" en conversation_participants', async () => {
        const mock = createSupabaseAdminMock({
            conversations: [{ data: { id: 'g1', name: 'Equipo' }, error: null }],
            conversation_participants: [
                { data: [{ conversation_id: 'existing' }], error: null },
                { data: [{ user_id: 'u2' }], error: null },
                { data: null, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { createGroup } = await import('../src/controllers/group.controller');
        const { req, res, next } = mockReqRes({ name: 'Equipo', participantIds: ['u2'] }, 'u1');

        await createGroup(req, res, next);

        const participantsPayload = mock.getInsertCalls('conversation_participants')[0];
        const creatorRow = participantsPayload.find((p: any) => p.user_id === 'u1');
        expect(creatorRow.role).toBe('admin');
    });
});
