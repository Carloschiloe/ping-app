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
    return Boolean(message?.attachment?.id) && message?.attachment?.lifecycleStatus === 'attached';
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
