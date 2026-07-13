import { describe, it, expect, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

// Nunca llamar a OpenAI ni enviar notificaciones push reales desde un test
// unitario: se mockean ambos servicios externos.
vi.mock('../src/services/ai.service', () => ({
    generateMorningSummary: vi.fn(async () => 'Buenos dias, tienes 1 compromiso hoy.'),
    generateWeeklyReview: vi.fn(async () => 'Resumen semanal de prueba.'),
}));
vi.mock('../src/services/push.service', () => ({
    sendPushNotification: vi.fn(async () => null),
}));

describe('runMorningRoutine', () => {
    it('inserta el resumen matutino en el self-chat real del usuario con system_event_type="morning_summary" (no conversation_id null)', async () => {
        const mock = createSupabaseAdminMock({
            commitments: [{
                data: [{
                    title: 'Comprar pan',
                    owner_user_id: 'u1',
                    profiles: { full_name: 'Carlos', expo_push_token: null },
                }],
                error: null,
            }],
            conversation_participants: [
                { data: [{ conversation_id: 'c-self' }], error: null }, // self-chat existente
                { count: 1, data: null, error: null },                  // confirma que tiene 1 solo participante
            ],
            messages: [{ data: { id: 'm-resumen' }, error: null }],
        });
        setSupabaseAdminMock(mock);

        const { runMorningRoutine } = await import('../src/services/morningRoutine.service');
        await runMorningRoutine();

        const insertPayload = mock.getInsertCalls('messages')[0];
        expect(insertPayload.conversation_id).toBe('c-self');
        expect(insertPayload.conversation_id).not.toBeNull();
        expect(insertPayload.system_event_type).toBe('morning_summary');
        expect(insertPayload.sender_id).toBeNull();
        expect(insertPayload).not.toHaveProperty('user_id');
        expect(insertPayload).not.toHaveProperty('text');
        expect(insertPayload.content).toBe('Buenos dias, tienes 1 compromiso hoy.');
    });
});
