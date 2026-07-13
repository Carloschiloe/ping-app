import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

describe('getOrCreateSelfConversationId', () => {
    it('self-chat se reconoce correctamente cuando ya existe (1 participante = el propio usuario)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c-self' }], error: null }, // lista de conversaciones del usuario
                { count: 1, data: null, error: null },                  // conteo de participantes de c-self
            ],
        });
        setSupabaseAdminMock(mock);

        const { getOrCreateSelfConversationId } = await import('../src/services/conversation.service');
        const result = await getOrCreateSelfConversationId('u1');

        expect(result).toBe('c-self');
        // No debe haber creado una conversacion nueva.
        expect(mock.getInsertCalls('conversations')).toHaveLength(0);
    });

    it('crea una conversacion direct nueva cuando el usuario no tiene ninguna todavia', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [], error: null },   // sin conversaciones previas
                { data: null, error: null }, // resultado del insert de participante
            ],
            conversations: [
                { data: { id: 'c-nueva' }, error: null },
            ],
        });
        setSupabaseAdminMock(mock);

        const { getOrCreateSelfConversationId } = await import('../src/services/conversation.service');
        const result = await getOrCreateSelfConversationId('u1');

        expect(result).toBe('c-nueva');
        const insertPayload = mock.getInsertCalls('conversations')[0];
        expect(insertPayload.conversation_type).toBe('direct');
        expect(insertPayload).not.toHaveProperty('is_group');
    });
});
