import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

import { getMessages } from '../src/controllers/conversation.controller';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';

function response() {
    const value: any = { statusCode: 200, payload: null };
    value.status = vi.fn((code: number) => { value.statusCode = code; return value; });
    value.json = vi.fn((payload: any) => { value.payload = payload; return value; });
    return value;
}

function req(target: string) {
    return { user: { id: userId }, params: { id: conversationId }, query: { scrollToMessageId: target, limit: '50' } } as any;
}

describe('message focus window', () => {
    it('loads an old target with surrounding messages and marks it found', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: conversationId, role: 'member' }, error: null }],
            messages: [
                { data: { created_at: '2026-01-01T10:00:00Z' }, error: null },
                { data: [{ id: 'target', created_at: '2026-01-01T10:00:00Z', content: 'Objetivo' }], error: null },
                { data: [{ id: 'newer', created_at: '2026-01-01T11:00:00Z', content: 'Nuevo' }], error: null },
            ],
        }));
        const res = response();
        await getMessages(req('target'), res);
        expect(res.payload.targetFound).toBe(true);
        expect(res.payload.messages.map((message: any) => message.id)).toEqual(['newer', 'target']);
    });

    it('returns the latest page and targetFound false when the message was deleted', async () => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: conversationId, role: 'member' }, error: null }],
            messages: [
                { data: null, error: null },
                { data: [{ id: 'latest', created_at: '2026-01-02T10:00:00Z', content: 'Actual' }], error: null },
            ],
        }));
        const res = response();
        await getMessages(req('deleted'), res);
        expect(res.payload.targetFound).toBe(false);
        expect(res.payload.messages[0].id).toBe('latest');
    });
});
