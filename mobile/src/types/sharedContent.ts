export type SharedContentCategory = 'summary' | 'visual' | 'audio' | 'document' | 'link';
export type SharedVisualKind = 'image' | 'video';

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

export type SharedContentSummary = {
    photos: number;
    videos: number;
    audios: number;
    documents: number;
    links: number;
};

export type SharedContentResponse = {
    summary: SharedContentSummary;
    items: SharedContentItem[];
    nextCursor: string | null;
};
