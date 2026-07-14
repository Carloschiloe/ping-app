import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

describe('createContact', () => {
    it('fija owner_user_id desde el usuario autenticado, nunca desde el body', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', display_name: 'Proveedor X', phone: null, email: null, linked_user_id: null, created_at: '2026-07-13T00:00:00.000Z' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createContact } = await import('../src/services/contact.service');
        await createContact('u1', { display_name: 'Proveedor X' });

        const insertPayload = mock.getInsertCalls('contacts')[0];
        expect(insertPayload.owner_user_id).toBe('u1');
    });

    it('la respuesta no expone owner_user_id ni otras columnas internas (exposicion minima)', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'u1', display_name: 'Proveedor X', phone: '+56911112222', email: null, linked_user_id: null, created_at: '2026-07-13T00:00:00.000Z' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { createContact } = await import('../src/services/contact.service');
        const result = await createContact('u1', { display_name: 'Proveedor X', phone: '+56911112222' });

        expect(result).not.toHaveProperty('owner_user_id');
        expect(result.display_name).toBe('Proveedor X');
    });
});

describe('getContacts', () => {
    it('filtra siempre por owner_user_id del usuario autenticado', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: [{ id: 'ct1', display_name: 'A', phone: null, email: null, linked_user_id: null, created_at: '2026-07-13T00:00:00.000Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);

        const { getContacts } = await import('../src/services/contact.service');
        const result = await getContacts('u1');

        expect(result).toHaveLength(1);
        expect(mock.getCalledTables()).toContain('contacts');
    });
});

describe('getContact', () => {
    it('un contacto de otro usuario es rechazado (nunca se filtra por owner desde el cliente)', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'otro_usuario', display_name: 'A', phone: null, email: null, linked_user_id: null, created_at: '2026-07-13T00:00:00.000Z' }, error: null }],
        }));

        const { getContact } = await import('../src/services/contact.service');
        await expect(getContact('u1', 'ct1')).rejects.toThrow('You do not have access to this contact');
    });
});
