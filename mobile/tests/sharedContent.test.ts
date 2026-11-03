import { describe, expect, it } from 'vitest';
import type { SharedContentItem } from '../src/types/sharedContent';
import {
    EMPTY_SHARED_CONTENT_SUMMARY,
    documentIconName,
    formatSharedDuration,
    formatSharedFileSize,
    sharedContentCount,
    sharedContentReadTarget,
    sharedContentTitle,
    sharedContentViewState,
    visualFilters,
} from '../src/utils/sharedContent';
import { getMessageFocusDecision } from '../src/utils/messageFocus';

const item: SharedContentItem = {
    id: 'a1', type: 'document', attachmentId: 'a1', messageId: 'm1',
    createdAt: '2026-09-01T12:00:00Z', sender: { id: 'u1', name: 'Alice', avatarUrl: null },
    file: { name: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: 1536, durationMs: null },
    link: null, source: 'canonical_attachment',
};

describe('Shared Content mobile presentation', () => {
    it('names photos, videos and audios by who sent them, not by the internal file name', () => {
        const photo = { ...item, type: 'image' as const, file: { ...item.file!, name: '3f2a9c1e-8b7d.jpg', mimeType: 'image/jpeg' } };
        expect(sharedContentTitle(photo)).toBe('Foto de Alice');
        expect(sharedContentTitle({ ...photo, type: 'video' })).toBe('Video de Alice');
        expect(sharedContentTitle({ ...photo, type: 'audio' })).toBe('Audio de Alice');
        expect(sharedContentTitle({ ...photo, sender: { id: 'u1', name: ' ', avatarUrl: null } })).toBe('Foto');
        expect(sharedContentTitle(item)).toBe('informe.pdf');
        expect(sharedContentTitle({ ...item, type: 'link', file: null, link: { url: 'https://a.cl/x', domain: 'a.cl', title: null } })).toBe('a.cl');
    });

    it('maps summary counts and discreet empty values', () => {
        expect(sharedContentCount(EMPTY_SHARED_CONTENT_SUMMARY, 'visual')).toBe(0);
        expect(sharedContentCount({ ...EMPTY_SHARED_CONTENT_SUMMARY, photos: 2, videos: 1 }, 'visual')).toBe(3);
        expect(sharedContentCount({ ...EMPTY_SHARED_CONTENT_SUMMARY, audios: 4 }, 'audio')).toBe(4);
    });

    it('distinguishes loading, error, empty and ready states', () => {
        expect(sharedContentViewState({ isLoading: true, isError: false, itemCount: 0 })).toBe('loading');
        expect(sharedContentViewState({ isLoading: false, isError: true, itemCount: 0 })).toBe('error');
        expect(sharedContentViewState({ isLoading: false, isError: false, itemCount: 0 })).toBe('empty');
        expect(sharedContentViewState({ isLoading: false, isError: false, itemCount: 1 })).toBe('ready');
    });

    it('shows visual filters only when photos and videos coexist', () => {
        expect(visualFilters({ ...EMPTY_SHARED_CONTENT_SUMMARY, photos: 2 })).toEqual([]);
        expect(visualFilters({ ...EMPTY_SHARED_CONTENT_SUMMARY, photos: 2, videos: 1 })).toEqual(['all', 'image', 'video']);
    });

    it('formats audio duration and document details', () => {
        expect(formatSharedDuration(65_000)).toBe('1:05');
        expect(formatSharedFileSize(item.file?.sizeBytes)).toBe('2 KB');
        expect(documentIconName(item)).toBe('document-text-outline');
    });

    it('resolves canonical items by attachment and legacy items by message', () => {
        expect(sharedContentReadTarget(item)).toEqual({ type: 'attachment', id: 'a1' });
        expect(sharedContentReadTarget({ ...item, id: 'legacy:m1', attachmentId: null, source: 'legacy_message' }))
            .toEqual({ type: 'message', id: 'm1' });
    });

    it('focuses loaded and remote-window messages once and handles deletion', () => {
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: undefined, loadedMessageIds: [] })).toBe('waiting');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: true, loadedMessageIds: ['m1'] })).toBe('ready');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: 'm1', targetFound: true, loadedMessageIds: ['m1'] })).toBe('already_handled');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: false, loadedMessageIds: [] })).toBe('unavailable');
    });
});
