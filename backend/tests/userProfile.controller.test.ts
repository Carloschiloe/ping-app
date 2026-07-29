import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const single = vi.fn();
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return { single, select, eq, update, from };
});

vi.mock('../src/lib/supabaseAdmin', () => ({
    supabaseAdmin: { from: mocks.from },
}));

import { updateProfile } from '../src/controllers/user.controller';

function createResponse() {
    const response: any = {};
    response.status = vi.fn(() => response);
    response.json = vi.fn(() => response);
    return response;
}

describe('PATCH /user/profile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.single.mockResolvedValue({
            data: {
                id: 'user-1',
                email: 'redacted@example.test',
                full_name: 'María Pérez',
                phone: null,
            },
            error: null,
        });
    });

    it('actualiza únicamente el perfil del usuario autenticado y normaliza el nombre', async () => {
        const req: any = {
            user: { id: 'user-1' },
            body: { full_name: '  María   Pérez  ' },
        };
        const res = createResponse();

        await updateProfile(req, res);

        expect(mocks.from).toHaveBeenCalledWith('profiles');
        expect(mocks.update).toHaveBeenCalledWith({ full_name: 'María Pérez' });
        expect(mocks.eq).toHaveBeenCalledWith('id', 'user-1');
        expect(res.json).toHaveBeenCalledWith({
            user: expect.objectContaining({ full_name: 'María Pérez' }),
        });
    });

    it('rechaza nombre vacío antes de escribir', async () => {
        const req: any = {
            user: { id: 'user-1' },
            body: { full_name: ' ' },
        };
        const res = createResponse();

        await updateProfile(req, res);

        expect(mocks.update).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: expect.stringContaining('al menos 2'),
        });
    });

    it('no acepta un identificador de perfil suministrado por el cliente', async () => {
        const req: any = {
            user: { id: 'owner-user' },
            body: { id: 'other-user', full_name: 'Nombre Seguro' },
        };
        const res = createResponse();

        await updateProfile(req, res);

        expect(mocks.eq).toHaveBeenCalledWith('id', 'owner-user');
        expect(mocks.update).toHaveBeenCalledWith({ full_name: 'Nombre Seguro' });
    });
});
