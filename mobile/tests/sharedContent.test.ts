import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '../src/theme/theme';
import type { SharedContentItem } from '../src/types/sharedContent';
import {
    EMPTY_SHARED_CONTENT_SUMMARY,
    documentIconName,
    formatSharedDuration,
    formatSharedFileSize,
    sharedContentCount,
    sharedContentReadTarget,
    sharedContentViewState,
    visualFilters,
} from '../src/utils/sharedContent';
import { getChatHeaderCapabilities } from '../src/utils/chatHeaderCapabilities';
import { getMessageFocusDecision } from '../src/utils/messageFocus';

const item: SharedContentItem = {
    id: 'a1', type: 'document', attachmentId: 'a1', messageId: 'm1',
    createdAt: '2026-09-01T12:00:00Z', sender: { id: 'u1', name: 'Alice', avatarUrl: null },
    file: { name: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: 1536, durationMs: null },
    link: null, source: 'canonical_attachment',
};

describe('Shared Content mobile presentation', () => {
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

    it('uses theme tokens with distinct light and dark surfaces', () => {
        expect(lightTheme.colors.surface).not.toBe(darkTheme.colors.surface);
        expect(lightTheme.colors.text.primary).not.toBe(darkTheme.colors.text.primary);
        expect(lightTheme.colors.accent).toBeTruthy();
        expect(darkTheme.colors.accent).toBeTruthy();
    });

    it('hides call and participant actions only in self-chat', () => {
        expect(getChatHeaderCapabilities(true)).toEqual({ voiceCall: false, videoCall: false, participantActions: false });
        expect(getChatHeaderCapabilities(false)).toEqual({ voiceCall: true, videoCall: true, participantActions: true });
    });

    it('focuses loaded and remote-window messages once and handles deletion', () => {
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: undefined, loadedMessageIds: [] })).toBe('waiting');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: true, loadedMessageIds: ['m1'] })).toBe('ready');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: 'm1', targetFound: true, loadedMessageIds: ['m1'] })).toBe('already_handled');
        expect(getMessageFocusDecision({ requestedMessageId: 'm1', handledMessageId: null, targetFound: false, loadedMessageIds: [] })).toBe('unavailable');
    });
});
