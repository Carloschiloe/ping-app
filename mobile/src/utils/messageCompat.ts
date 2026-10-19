// V2: content/metadata son las columnas reales de `messages`. text/meta son
// el alias temporal que todavia expone el backend (ver
// backend/src/utils/messageCompat.ts) para no romper clientes viejos.
// Centralizar la lectura aqui evita que cada pantalla reimplemente el mismo
// fallback y facilita retirarlo cuando el backend deje de enviarlo.
export function resolveMessageContent(message: any): string {
    return message?.content ?? message?.text ?? '';
}

export function resolveMessageMetadata(message: any): Record<string, any> {
    return message?.metadata ?? message?.meta ?? {};
}

export type MessageAttachmentKind = 'image' | 'video' | 'audio' | 'document';

export type MessageAttachmentPresentation = {
    kind: MessageAttachmentKind | null;
    mimeType: string;
    fileName: string;
    hasPrivateReference: boolean;
    legacyUrl: string | null;
};

function attachmentRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function attachmentKind(value: unknown): MessageAttachmentKind | null {
    const normalized = String(value || '').trim().toLowerCase();
    if (['image', 'photo', 'picture', 'fotografia', 'imagen'].includes(normalized)) return 'image';
    if (['video', 'movie', 'clip', 'pelicula'].includes(normalized)) return 'video';
    if (['audio', 'voice', 'voicenote', 'nota_de_voz', 'nota-de-voz'].includes(normalized)) return 'audio';
    if (['document', 'file', 'archivo', 'file_attachment'].includes(normalized)) return 'document';
    return null;
}

function attachmentKindFromMime(value: unknown): MessageAttachmentKind | null {
    const mimeType = String(value || '').toLowerCase();
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType && mimeType !== 'application/octet-stream') return 'document';
    return null;
}

function safeLegacyUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value.trim());
        return ['http:', 'https:'].includes(url.protocol) && !url.search && !url.hash ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Derives one attachment presentation contract from canonical and historical
 * message shapes. This is metadata-only; private bytes still require a
 * server-issued signed URL.
 */
export function resolveMessageAttachmentPresentation(message: any, pending = false): MessageAttachmentPresentation {
    const metadata = attachmentRecord(resolveMessageMetadata(message));
    const mediaMetadata = attachmentRecord(message?.media_metadata);
    const candidates = [
        attachmentRecord(message?.attachment),
        attachmentRecord(metadata.attachment),
        mediaMetadata,
    ];
    const mimeType = pending ? '' : String(
        candidates.map((candidate) => candidate.mimeType || candidate.mime_type || candidate.mimetype).find(Boolean)
        || '',
    );
    const messageText = String(resolveMessageContent(message)).trim();
    const legacyTag = messageText.match(/^\[(imagen|video|audio|document)=?/i);
    const kind = candidates.map((candidate) => attachmentKind(candidate.kind || candidate.type)).find(Boolean)
        || attachmentKindFromMime(mimeType)
        || attachmentKind(message?.message_type || message?.type)
        || (legacyTag ? attachmentKind(legacyTag[1]) : null)
        // A canonical attachment can legitimately have a generic MIME type
        // (for example application/octet-stream). Keep it actionable instead
        // of dropping the file actions from the message menu.
        || (!pending && candidates.some((candidate) => Boolean(
            candidate.id || candidate.originalFilename || candidate.fileName || candidate.file_name,
        )) ? 'document' : null);
    const fileName = String(
        candidates.map((candidate) => candidate.originalFilename || candidate.fileName || candidate.file_name || candidate.name).find(Boolean)
        || '',
    );
    const attachmentLifecycleStatus = message?.attachment?.lifecycleStatus
        ?? message?.attachment?.lifecycle_status;
    const hasPrivateReference = Boolean(message?.attachment?.id && attachmentLifecycleStatus === 'attached')
        || Boolean(message?.media_bucket && message?.media_object_path);

    return {
        kind,
        mimeType,
        fileName,
        hasPrivateReference,
        // Historical public URLs are accepted only as a URL-shaped fallback;
        // private bucket/path messages intentionally return no URL here.
        legacyUrl: hasPrivateReference ? null : safeLegacyUrl(message?.media_url),
    };
}

export function isMessageFromUser(message: any, userId?: string | null): boolean {
    if (!userId) return false;
    return message?.sender_id === userId;
}

export function resolveReactionEmoji(reaction: any): string | null {
    const value = reaction?.reaction ?? reaction?.emoji;
    return typeof value === 'string' && value.trim() ? value : null;
}

// Message lifecycle and attachment lifecycle are separate canonical truths
// — a message's deletion state is owned exclusively by messages.deleted_at
// (see backend's tombstone_message RPC and toLegacyMessageShape, which
// always selects '*' and therefore always passes deleted_at through
// verbatim on every message fetch path). Attachment lifecycle
// (pending/uploaded/attached/tombstoned) is a distinct field that can be
// 'tombstoned' for reasons that do NOT imply the message itself was
// deleted (e.g. this repo's own tombstone_message RPC only cascades to
// attachments that were 'attached' — future lifecycle transitions could
// tombstone an attachment independently). Inferring "the whole message is
// deleted" from attachment.lifecycleStatus would be backwards: it derives
// a stronger canonical fact (message deletion) from a weaker, narrower one
// (attachment state) that was never designed to carry that meaning.
export function isMessageTombstoned(message: any): boolean {
    return Boolean(message?.deleted_at);
}

// Independent check: is there a live, fetchable private attachment on this
// message right now? This is NOT "is the message deleted" — a message can
// be perfectly live while its attachment is not yet 'attached' (still
// uploading) or has been tombstoned for a reason unrelated to message
// deletion. The backend's authorize_message_attachment_read RPC only ever
// authorizes a signed read when lifecycle_status = 'attached', so mobile
// must apply the exact same gate before attempting to resolve one — both a
// non-'attached' attachment AND a deleted message must independently
// short-circuit to zero signed-read attempts, for different reasons.
export function hasLiveAttachment(message: any): boolean {
    const lifecycleStatus = message?.attachment?.lifecycleStatus
        ?? message?.attachment?.lifecycle_status;
    return Boolean(message?.attachment?.id) && lifecycleStatus === 'attached';
}

// The exact id MessageItem.tsx is allowed to pass to resolveAttachmentUrl().
// Returns null (never attempts a fetch) for a non-'attached' attachment —
// pending/uploaded/tombstoned all yield null here — regardless of whether
// the message itself is deleted. This is what guarantees "zero
// resolveAttachmentUrl calls, zero retry loop" for a tombstoned/non-live
// attachment: there is no separate boolean flag to keep in sync, the id
// itself is simply unavailable to fetch with.
export function resolvableAttachmentId(message: any): string | null {
    return hasLiveAttachment(message) ? message.attachment.id : null;
}

// PING — REMOVE EMPTY MEDIA BUBBLE AFTER DELETE: the label shown for a
// tombstoned message. The backend's toLegacyMessageShape deliberately
// strips attachment.kind/mimeType down to only { id, lifecycleStatus:
// 'tombstoned' } on delete (see backend/src/utils/messageCompat.ts) — there
// is no canonical, reliable signal of the original attachment's media type
// left on the wire. Per the task's own explicit fallback rule, inventing
// "Foto eliminada"/"Video eliminado" from anything else (URL shape, stale
// local mimeType, a legacy [imagen]/[video] text prefix) would be guessing,
// which this codebase's standard forbids. If a future backend change
// intentionally starts preserving a reliable kind on tombstoned payloads,
// this is the single place to extend the policy — not MessageItem.tsx.
export function resolveDeletedMessageLabel(_message: any): string {
    return 'Mensaje eliminado';
}
