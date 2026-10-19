export type MessageAttachmentKind = 'image' | 'video' | 'audio' | 'document';

const KINDS = new Set<MessageAttachmentKind>(['image', 'video', 'audio', 'document']);

function record(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function normalizeKind(value: unknown): MessageAttachmentKind | null {
    const kind = String(value || '').trim().toLowerCase();
    if (KINDS.has(kind as MessageAttachmentKind)) return kind as MessageAttachmentKind;
    if (['photo', 'picture', 'fotografia', 'imagen'].includes(kind)) return 'image';
    if (['movie', 'clip', 'pelicula', 'video'].includes(kind)) return 'video';
    if (['voice', 'voicenote', 'nota_de_voz', 'nota-de-voz'].includes(kind)) return 'audio';
    if (['file', 'archivo', 'file_attachment'].includes(kind)) return 'document';
    return null;
}

function kindFromMime(value: unknown): MessageAttachmentKind | null {
    const mime = String(value || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime && mime !== 'application/octet-stream') return 'document';
    return null;
}

export function resolveMessageAttachmentMetadata(message: any): {
    kind: MessageAttachmentKind | null;
    mimeType: string;
    fileName: string;
} {
    const metadata = record(message?.metadata ?? message?.meta);
    const mediaMetadata = record(message?.media_metadata);
    const attachment = record(metadata.attachment);
    const candidates = [attachment, mediaMetadata, message?.attachment || {}];

    const mimeType = String(
        candidates.map((candidate) => candidate.mimeType || candidate.mime_type || candidate.mimetype).find(Boolean)
        || '',
    );
    const kind = candidates.map((candidate) => normalizeKind(candidate.kind || candidate.type)).find(Boolean)
        || kindFromMime(mimeType)
        || normalizeKind(message?.message_type || message?.type);
    const fileName = String(
        candidates.map((candidate) => candidate.fileName || candidate.file_name || candidate.originalFilename || candidate.name).find(Boolean)
        || '',
    );

    return { kind, mimeType, fileName };
}

export function hasLegacyMessageAttachmentReference(message: any): boolean {
    return Boolean(message?.media_bucket && message?.media_object_path)
        || Boolean(message?.media_url)
        || Boolean(normalizeKind(message?.message_type || message?.type));
}
