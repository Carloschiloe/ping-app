import {
    copyAttachmentImageAsync,
    saveAttachmentForUserAsync,
    shareAttachmentAsync,
    type SignedAttachment,
} from './attachmentActions';
import { resolveAttachmentUrl, resolvePrivateFileUrl } from '../lib/privateFiles';
import type { SharedContentItem } from '../types/sharedContent';

const FALLBACK_MIME_TYPES: Record<Exclude<SharedContentItem['type'], 'link'>, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/m4a',
    document: 'application/octet-stream',
};

export function sharedContentAttachment(
    item: SharedContentItem,
    signedUrl: string,
): SignedAttachment {
    return {
        signedUrl,
        mimeType: item.file?.mimeType || FALLBACK_MIME_TYPES[item.type as Exclude<SharedContentItem['type'], 'link'>],
        fileName: item.file?.name || `ping-${item.type}`,
    };
}

export async function resolveSharedContentAttachment(
    item: SharedContentItem,
    signedUrl?: string | null,
): Promise<SignedAttachment> {
    if (item.type === 'link') throw new Error('link-is-not-an-attachment');
    let resolvedUrl = signedUrl || null;
    if (!resolvedUrl) {
        const access = item.attachmentId
            ? await resolveAttachmentUrl(item.attachmentId, { forceRefresh: true })
            : item.legacyUrl
                ? { signedUrl: item.legacyUrl }
                : await resolvePrivateFileUrl('message', item.messageId, { forceRefresh: true });
        resolvedUrl = access.signedUrl;
    }
    if (!resolvedUrl) throw new Error('attachment-url-unavailable');
    return sharedContentAttachment(item, resolvedUrl);
}

export async function saveSharedContentItemAsync(item: SharedContentItem, signedUrl?: string | null) {
    return saveAttachmentForUserAsync(await resolveSharedContentAttachment(item, signedUrl));
}

export async function shareSharedContentItemAsync(item: SharedContentItem, signedUrl?: string | null) {
    await shareAttachmentAsync(await resolveSharedContentAttachment(item, signedUrl));
}

export async function copySharedContentImageAsync(item: SharedContentItem, signedUrl?: string | null) {
    await copyAttachmentImageAsync(await resolveSharedContentAttachment(item, signedUrl));
}
