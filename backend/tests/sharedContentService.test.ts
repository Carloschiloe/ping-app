import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSupabaseAdminMock,
    setSupabaseAdminMock,
    supabaseAdminMockModule,
} from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

import {
    buildSharedContent,
    extractMessageLinks,
    getSharedContent,
} from '../src/services/sharedContent.service';

const conversationId = '22222222-2222-4222-8222-222222222222';
const actorA = '11111111-1111-4111-8111-111111111111';
const actorB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function message(id: string, content: string, overrides: Record<string, any> = {}) {
    return {
        id,
        content,
        created_at: overrides.created_at || '2026-09-01T12:00:00.000Z',
        sender_id: overrides.sender_id || actorA,
        deleted_at: null,
        metadata: {},
        media_url: null,
        media_bucket: null,
        media_object_path: null,
        profiles: { id: actorA, full_name: 'Alice', email: 'alice@example.test', avatar_url: null },
        ...overrides,
    };
}

function attachment(id: string, messageId: string, kind = 'image', overrides: Record<string, any> = {}) {
    return {
        id,
        message_id: messageId,
        kind,
        mime_type: kind === 'audio' ? 'audio/m4a' : `${kind}/jpeg`,
        size_bytes: 1200,
        duration_ms: kind === 'audio' ? 4200 : null,
        original_filename: `${kind}.bin`,
        lifecycle_status: 'attached',
        created_at: '2026-09-01T12:00:00.000Z',
        ...overrides,
    };
}

describe('Shared Content canonical read model', () => {
    beforeEach(() => setSupabaseAdminMock(createSupabaseAdminMock({})));

    it('uses canonical attachments, preserves file metadata and never exposes storage credentials', () => {
        const msg = message('m1', 'Imagen');
        const result = buildSharedContent({
            messages: [msg],
            attachments: [attachment('a1', 'm1')],
            category: 'visual', limit: 30,
        });

        expect(result.summary.photos).toBe(1);
        expect(result.items[0]).toMatchObject({
            id: 'a1', attachmentId: 'a1', messageId: 'm1', type: 'image',
            source: 'canonical_attachment', sender: { name: 'Alice' },
        });
        expect(JSON.stringify(result)).not.toMatch(/bucket|object_path|signedUrl|token/i);
    });

    it('keeps legacy fallback but canonical wins when both point to the same message', () => {
        const legacyOnly = message('m1', '[audio]https://legacy.example/voice.m4a');
        const duplicate = message('m2', '[imagen]https://legacy.example/image.jpg');
        const result = buildSharedContent({
            messages: [legacyOnly, duplicate],
            attachments: [attachment('a2', 'm2')],
            category: 'summary', limit: 30,
        });

        expect(result.summary).toMatchObject({ photos: 1, audios: 1 });
        expect(result.items.filter((item) => item.messageId === 'm2')).toHaveLength(1);
        expect(result.items[0].source).toBe('canonical_attachment');
        const signedLegacy = buildSharedContent({
            messages: [message('signed', '[imagen]https://legacy.example/image.jpg?token=secret')],
            attachments: [], category: 'summary', limit: 30,
        });
        expect(signedLegacy.items[0].legacyUrl).toBeUndefined();
        expect(JSON.stringify(signedLegacy)).not.toContain('secret');
    });

    it('keeps bucket/path historical messages addressable only by message id', () => {
        const historical = message('m-path', 'archivo.pdf', {
            media_bucket: 'chat-media',
            media_object_path: 'conversations/c/legacy/file.pdf',
            metadata: { attachment: { kind: 'document', mimeType: 'application/pdf', fileName: 'archivo.pdf' } },
        });
        const result = buildSharedContent({ messages: [historical], attachments: [], category: 'document', limit: 30 });
        expect(result.items[0]).toMatchObject({ attachmentId: null, messageId: 'm-path', source: 'legacy_message' });
        expect(JSON.stringify(result)).not.toContain('media_object_path');
        expect(JSON.stringify(result)).not.toContain('conversations/c/legacy');
    });

    it('excludes message and attachment tombstones', () => {
        const result = buildSharedContent({
            messages: [
                message('deleted', 'Imagen', { deleted_at: '2026-09-01T13:00:00Z' }),
                message('active', 'Audio'),
            ],
            attachments: [
                attachment('a-deleted', 'deleted'),
                attachment('a-tombstone', 'active', 'audio', { lifecycle_status: 'tombstoned' }),
            ],
            category: 'summary', limit: 30,
        });
        expect(result.summary).toEqual({ photos: 0, videos: 0, audios: 0, documents: 0, links: 0 });
    });

    it('extracts multiple normalized links and ignores media tags and invalid schemes', () => {
        expect(extractMessageLinks('Mira www.ping.cl, https://example.com/path). y ftp://ignored.test')).toEqual([
            { url: 'https://www.ping.cl/', domain: 'ping.cl' },
            { url: 'https://example.com/path', domain: 'example.com' },
        ]);
        expect(extractMessageLinks('[imagen]https://cdn.example/image.jpg')).toEqual([]);
    });

    it('paginates deterministically across items sharing a timestamp', () => {
        const messages = ['1', '2', '3'].map((id) => message(`m${id}`, `https://example.com/${id}`));
        const first = buildSharedContent({ messages, attachments: [], category: 'link', limit: 2 });
        const second = buildSharedContent({ messages, attachments: [], category: 'link', limit: 2, cursor: first.nextCursor! });

        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).toBeTruthy();
        expect(second.items).toHaveLength(1);
        expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
        expect(second.nextCursor).toBeNull();
    });

    it.each([actorA, actorB])('allows active participant %s', async (actor) => {
        setSupabaseAdminMock(createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: conversationId, role: 'member' }, error: null }],
            attachments: [{ data: [], error: null }],
            messages: [{ data: [message('m1', 'https://ping.cl')], error: null }],
        }));
        await expect(getSharedContent(actor, conversationId, { category: 'link', limit: 30 }))
            .resolves.toMatchObject({ summary: { links: 1 } });
    });

    it.each([
        ['external user C', actorC],
        ['revoked member B', actorB],
    ])('blocks %s before reading content', async (_label, actor) => {
        const db = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(db);
        await expect(getSharedContent(actor, conversationId, { category: 'summary', limit: 30 }))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(db.getCalledTables()).toEqual(['conversation_participants']);
    });
});
