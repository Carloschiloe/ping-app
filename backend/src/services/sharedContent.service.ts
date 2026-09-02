import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant } from '../utils/authz';

export type SharedContentCategory = 'summary' | 'visual' | 'audio' | 'document' | 'link';
export type SharedContentKind = 'image' | 'video';

export type SharedContentItem = {
    id: string;
    type: 'image' | 'video' | 'audio' | 'document' | 'link';
    attachmentId: string | null;
    messageId: string;
    createdAt: string;
    sender: { id: string; name: string; avatarUrl: string | null };
    file: {
        name: string;
        mimeType: string;
        sizeBytes: number | null;
        durationMs: number | null;
    } | null;
    link: { url: string; domain: string; title: null } | null;
    source: 'canonical_attachment' | 'legacy_message' | 'message_link';
    legacyUrl?: string;
};

type SharedContentCursor = { createdAt: string; id: string };

export type SharedContentResult = {
    summary: { photos: number; videos: number; audios: number; documents: number; links: number };
    items: SharedContentItem[];
    nextCursor: string | null;
};

type BuildInput = {
    attachments: any[];
    messages: any[];
    category: SharedContentCategory;
    kind?: SharedContentKind;
    cursor?: string;
    limit: number;
};

const LEGACY_TAG = /^(\[imagen\]|\[video\]|\[audio\]|\[document=[^\]]+\])/i;
const URL_CANDIDATE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function senderFor(message: any) {
    const profile = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles;
    return {
        id: message.sender_id,
        name: profile?.full_name || profile?.email || 'Usuario',
        avatarUrl: profile?.avatar_url || null,
    };
}

function safeLegacyUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    try {
        const url = new URL(value.trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

export function extractMessageLinks(content: unknown): Array<{ url: string; domain: string }> {
    if (typeof content !== 'string' || LEGACY_TAG.test(content.trim())) return [];
    const candidates = content.match(URL_CANDIDATE) || [];
    const seen = new Set<string>();
    const links: Array<{ url: string; domain: string }> = [];

    for (const candidate of candidates) {
        const trimmed = candidate.replace(/[),.;!?\]}]+$/g, '');
        const normalized = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
        try {
            const parsed = new URL(normalized);
            if (!['http:', 'https:'].includes(parsed.protocol) || seen.has(parsed.href)) continue;
            seen.add(parsed.href);
            links.push({ url: parsed.href, domain: parsed.hostname.replace(/^www\./i, '') });
        } catch {
            // An invalid candidate remains ordinary message text.
        }
    }
    return links;
}

function legacyDescriptor(message: any) {
    const content = String(message.content || '').trim();
    const metadata = message.metadata || {};
    const attachmentMeta = metadata.attachment || {};
    let type: SharedContentItem['type'] | null = null;
    let name = attachmentMeta.fileName || 'Archivo';
    let mimeType = attachmentMeta.mimeType || 'application/octet-stream';
    let taggedUrl: string | undefined;

    if (/^\[imagen\]/i.test(content)) {
        type = 'image'; name = 'Imagen'; mimeType = 'image/jpeg'; taggedUrl = content.replace(/^\[imagen\]/i, '').trim().split(/\s/)[0];
    } else if (/^\[video\]/i.test(content)) {
        type = 'video'; name = 'Video'; mimeType = 'video/mp4'; taggedUrl = content.replace(/^\[video\]/i, '').trim().split(/\s/)[0];
    } else if (/^\[audio\]/i.test(content)) {
        type = 'audio'; name = 'Audio'; mimeType = attachmentMeta.mimeType || 'audio/mpeg'; taggedUrl = content.replace(/^\[audio\]/i, '').trim().split(/\s/)[0];
    } else {
        const document = content.match(/^\[document=([^\]]+)\](.*)$/i);
        if (document) {
            type = 'document'; name = document[1]; taggedUrl = document[2].trim().split(/\s/)[0];
        }
    }

    if (!type && (message.media_bucket || message.media_object_path || message.media_url)) {
        const kind = attachmentMeta.kind;
        const mime = String(attachmentMeta.mimeType || '');
        type = ['image', 'video', 'audio', 'document'].includes(kind)
            ? kind
            : mime.startsWith('image/') ? 'image'
                : mime.startsWith('video/') ? 'video'
                    : mime.startsWith('audio/') ? 'audio'
                        : 'document';
        name = attachmentMeta.fileName || content || 'Archivo';
        mimeType = mime || mimeType;
        taggedUrl = message.media_url;
    }

    return type ? { type, name, mimeType, legacyUrl: safeLegacyUrl(taggedUrl) } : null;
}

function encodeCursor(item: SharedContentItem) {
    return Buffer.from(JSON.stringify({ createdAt: item.createdAt, id: item.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor?: string): SharedContentCursor | null {
    if (!cursor) return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) {
            throw new Error('invalid cursor');
        }
        return parsed;
    } catch {
        throw new AppError('Invalid shared content cursor', 400);
    }
}

function comesAfterCursor(item: SharedContentItem, cursor: SharedContentCursor) {
    return item.createdAt < cursor.createdAt || (item.createdAt === cursor.createdAt && item.id < cursor.id);
}

export function buildSharedContent(input: BuildInput): SharedContentResult {
    const messages = new Map(input.messages.filter((message) => !message.deleted_at).map((message) => [message.id, message]));
    const canonicalMessageIds = new Set<string>();
    const items: SharedContentItem[] = [];

    for (const attachment of input.attachments) {
        if (attachment.lifecycle_status !== 'attached' || !attachment.message_id) continue;
        const message: any = messages.get(attachment.message_id);
        if (!message) continue;
        canonicalMessageIds.add(message.id);
        items.push({
            id: attachment.id,
            type: attachment.kind,
            attachmentId: attachment.id,
            messageId: message.id,
            createdAt: message.created_at,
            sender: senderFor(message),
            file: {
                name: attachment.original_filename,
                mimeType: attachment.mime_type,
                sizeBytes: attachment.size_bytes ?? null,
                durationMs: attachment.duration_ms ?? null,
            },
            link: null,
            source: 'canonical_attachment',
        });
    }

    for (const message of messages.values()) {
        if (!canonicalMessageIds.has(message.id)) {
            const legacy = legacyDescriptor(message);
            if (legacy) {
                items.push({
                    id: `legacy:${message.id}`,
                    type: legacy.type,
                    attachmentId: null,
                    messageId: message.id,
                    createdAt: message.created_at,
                    sender: senderFor(message),
                    file: {
                        name: legacy.name,
                        mimeType: legacy.mimeType,
                        sizeBytes: message.metadata?.attachment?.size ?? null,
                        durationMs: message.metadata?.attachment?.durationMs ?? null,
                    },
                    link: null,
                    source: 'legacy_message',
                    ...(legacy.legacyUrl ? { legacyUrl: legacy.legacyUrl } : {}),
                });
            }
        }

        extractMessageLinks(message.content).forEach((link, index) => {
            items.push({
                id: `link:${message.id}:${index}`,
                type: 'link',
                attachmentId: null,
                messageId: message.id,
                createdAt: message.created_at,
                sender: senderFor(message),
                file: null,
                link: { ...link, title: null },
                source: 'message_link',
            });
        });
    }

    items.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const summary = {
        photos: items.filter((item) => item.type === 'image').length,
        videos: items.filter((item) => item.type === 'video').length,
        audios: items.filter((item) => item.type === 'audio').length,
        documents: items.filter((item) => item.type === 'document').length,
        links: items.filter((item) => item.type === 'link').length,
    };

    let filtered = input.category === 'summary'
        ? items.filter((item) => item.type === 'image' || item.type === 'video')
        : items.filter((item) => input.category === 'visual'
            ? item.type === 'image' || item.type === 'video'
            : item.type === input.category);
    if (input.category === 'visual' && input.kind) filtered = filtered.filter((item) => item.type === input.kind);

    const cursor = decodeCursor(input.cursor);
    if (cursor) filtered = filtered.filter((item) => comesAfterCursor(item, cursor));
    const pageLimit = input.category === 'summary' ? 3 : input.limit;
    const page = filtered.slice(0, pageLimit);
    const hasMore = input.category !== 'summary' && filtered.length > pageLimit;
    return { summary, items: page, nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null };
}

async function loadRows(userId: string, conversationId: string) {
    await assertConversationParticipant(userId, conversationId);

    const readAll = async (buildQuery: () => any) => {
        const rows: any[] = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
            const result = await buildQuery().range(offset, offset + pageSize - 1);
            if (result.error) throw new AppError(result.error.message, 500);
            const page = result.data || [];
            rows.push(...page);
            if (page.length < pageSize) break;
        }
        return rows;
    };

    const [attachmentResult, messageResult] = await Promise.all([
        readAll(() => supabaseAdmin.from('attachments')
            .select('id, kind, message_id, mime_type, size_bytes, duration_ms, original_filename, lifecycle_status, created_at')
            .eq('context_conversation_id', conversationId)
            .eq('lifecycle_status', 'attached')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })),
        readAll(() => supabaseAdmin.from('messages')
            .select('id, content, created_at, sender_id, deleted_at, metadata, media_url, media_bucket, media_object_path, profiles!sender_id(id, email, full_name, avatar_url)')
            .eq('conversation_id', conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })),
    ]);
    return { attachments: attachmentResult, messages: messageResult };
}

export async function getSharedContent(userId: string, conversationId: string, options: {
    category: SharedContentCategory;
    kind?: SharedContentKind;
    cursor?: string;
    limit: number;
}) {
    const rows = await loadRows(userId, conversationId);
    return buildSharedContent({ ...rows, ...options });
}

export async function getLegacyConversationMedia(userId: string, conversationId: string) {
    const { messages } = await loadRows(userId, conversationId);
    return messages.filter((message: any) => Boolean(legacyDescriptor(message)));
}
