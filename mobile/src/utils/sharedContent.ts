import type { SharedContentItem, SharedContentSummary, SharedVisualKind } from '../types/sharedContent';

export const EMPTY_SHARED_CONTENT_SUMMARY: SharedContentSummary = {
    photos: 0,
    videos: 0,
    audios: 0,
    documents: 0,
    links: 0,
};

export function formatSharedFileSize(bytes: number | null | undefined) {
    if (!bytes || bytes <= 0) return 'Tamaño no disponible';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Formats duration from milliseconds. Returns empty string if no duration (so callers
 * can omit the bullet separator gracefully).
 */
export function formatSharedDuration(durationMs: number | null | undefined): string {
    if (!durationMs || durationMs <= 0) return '';
    const totalSec = Math.round(durationMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Returns a clean 'DD MMM YYYY · HH:MM' string respecting device locale.
 * Uses 24h where possible via Intl options.
 */
export function formatSharedDateTime(isoString: string): string {
    try {
        const d = new Date(isoString);
        const datePart = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${datePart} · ${timePart}`;
    } catch {
        return isoString;
    }
}

export function visualFilters(summary: SharedContentSummary): ('all' | SharedVisualKind)[] {
    if (summary.photos > 0 && summary.videos > 0) return ['all', 'image', 'video'];
    return [];
}

export function sharedContentReadTarget(item: SharedContentItem) {
    return item.attachmentId
        ? { type: 'attachment' as const, id: item.attachmentId }
        : { type: 'message' as const, id: item.messageId };
}

export function documentIconName(item: SharedContentItem) {
    const mime = item.file?.mimeType || '';
    const name = item.file?.name?.toLowerCase() || '';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'document-text-outline' as const;
    if (mime.includes('spreadsheet') || /\.(xlsx?|csv)$/.test(name)) return 'grid-outline' as const;
    if (mime.includes('word') || /\.docx?$/.test(name)) return 'reader-outline' as const;
    return 'document-outline' as const;
}

export function sharedContentCount(summary: SharedContentSummary, category: 'visual' | 'audio' | 'document' | 'link') {
    if (category === 'visual') return summary.photos + summary.videos;
    if (category === 'audio') return summary.audios;
    if (category === 'document') return summary.documents;
    return summary.links;
}

export function sharedContentViewState(input: { isLoading: boolean; isError: boolean; itemCount: number }) {
    if (input.isLoading) return 'loading' as const;
    if (input.isError) return 'error' as const;
    if (input.itemCount === 0) return 'empty' as const;
    return 'ready' as const;
}
