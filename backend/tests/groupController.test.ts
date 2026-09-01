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
            conversation_participants: [
                { data: [{ conversation_id: 'existing' }], error: null },
                { data: [{ user_id: 'u2' }, { user_id: 'u3' }], error: null },
            ],
            'rpc:create_conversation_with_participants': [{ data: 'g1', error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createGroup } = await import('../src/controllers/group.controller');
        const { req, res, next } = mockReqRes({ name: 'Equipo', participantIds: ['u2', 'u3'] });

        await createGroup(req, res, next);

        expect(mock.getRpcCalls()[0]).toEqual({
            name: 'create_conversation_with_participants',
            args: expect.objectContaining({
                p_conversation_type: 'group',
                p_name: 'Equipo',
                p_participant_ids: expect.arrayContaining(['u1', 'u2', 'u3']),
            }),
        });
        expect(mock.getInsertCalls('conversations')).toHaveLength(0);
        expect(next).not.toHaveBeenCalled();
    });

    it('el creador del grupo queda con role="admin" en conversation_participants', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'existing' }], error: null },
                { data: [{ user_id: 'u2' }], error: null },
            ],
            'rpc:create_conversation_with_participants': [{ data: 'g1', error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createGroup } = await import('../src/controllers/group.controller');
        const { req, res, next } = mockReqRes({ name: 'Equipo', participantIds: ['u2'] }, 'u1');

        await createGroup(req, res, next);

        const participants = mock.getRpcCalls()[0].args.p_participant_ids;
        expect(participants).toContain('u1');
        expect(mock.getRpcCalls()[0].args.p_creator_user_id).toBe('u1');
    });
});
