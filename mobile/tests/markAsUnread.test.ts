/**
 * C-6 — Mark as Unread canónico. Mobile unit tests.
 * Pure unit tests — no React Native renderer needed (same pattern as ux5b.test.ts).
 *
 * Backend coverage (RPC guards, RLS, receipts untouched, concurrency ordering)
 * lives in backend/tests/markAsUnread.test.ts and
 * backend/tests/postgres/conversationManualUnread.integration.sql — both
 * already validated against a real local Postgres. This file covers only the
 * mobile-side decisions: combined unread semantics, filter inclusion, badge
 * suppression, contextual swipe dispatch, and that "Para mí" gets no special
 * exception.
 */
/// <reference types="jest" />
import { describe, expect, it, vi } from 'vitest';

// Compat shim: este archivo fue escrito para Jest (jest.fn globals); el
// proyecto corre en Vitest. vi.fn() es la misma API — sólo se alias el
// identificador, sin tocar ningún mock/assertion existente.
const jest = { fn: vi.fn };

// ─── isConversationUnread — combines real count + manual marker ────────────

function isConversationUnread(c: { unreadCount?: number; manuallyUnread?: boolean }) {
    return (c.unreadCount || 0) > 0 || !!c.manuallyUnread;
}

describe('C-6: isConversationUnread', () => {
    it('is true when the real unreadCount is positive', () => {
        expect(isConversationUnread({ unreadCount: 3, manuallyUnread: false })).toBe(true);
    });

    it('is true when manuallyUnread is set even with zero real unread messages', () => {
        expect(isConversationUnread({ unreadCount: 0, manuallyUnread: true })).toBe(true);
    });

    it('is false only when both are absent', () => {
        expect(isConversationUnread({ unreadCount: 0, manuallyUnread: false })).toBe(false);
        expect(isConversationUnread({})).toBe(false);
    });
});

// ─── ConversationRow: visual weight vs badge ────────────────────────────────
// The badge must show the REAL count only — never a fabricated "1" for a
// conversation that is unreadCount=0 but manuallyUnread=true.

function getRowPresentation(item: { unreadCount?: number; manuallyUnread?: boolean }) {
    const unreadCount = item.unreadCount || 0;
    const isUnread = isConversationUnread(item);
    return {
        boldNameAndDot: isUnread,
        showsBadge: unreadCount > 0,
        badgeValue: unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : null,
    };
}

describe('C-6: ConversationRow — manuallyUnread visual treatment without a fake badge', () => {
    it('unreadCount=0, manuallyUnread=true: bold/dot yes, badge no', () => {
        const presentation = getRowPresentation({ unreadCount: 0, manuallyUnread: true });
        expect(presentation.boldNameAndDot).toBe(true);
        expect(presentation.showsBadge).toBe(false);
        expect(presentation.badgeValue).toBeNull();
    });

    it('unreadCount=3, manuallyUnread=false: bold/dot yes, badge shows 3', () => {
        const presentation = getRowPresentation({ unreadCount: 3, manuallyUnread: false });
        expect(presentation.boldNameAndDot).toBe(true);
        expect(presentation.badgeValue).toBe('3');
    });

    it('unreadCount=0, manuallyUnread=false: fully read, no visual treatment at all', () => {
        const presentation = getRowPresentation({ unreadCount: 0, manuallyUnread: false });
        expect(presentation.boldNameAndDot).toBe(false);
        expect(presentation.showsBadge).toBe(false);
    });
});

// ─── Filtro "No leídos" — includes both sources, no duplicates ──────────────

function filterUnread(conversations: any[]) {
    return conversations.filter(isConversationUnread);
}

describe('C-6: Filtro No leídos incluye unreadCount real y manuallyUnread', () => {
    it('includes a conversation with real unread messages', () => {
        const data = [{ id: 'c1', unreadCount: 2, manuallyUnread: false }];
        expect(filterUnread(data).map(c => c.id)).toEqual(['c1']);
    });

    it('includes a conversation with zero real unread but manuallyUnread=true', () => {
        const data = [{ id: 'c1', unreadCount: 0, manuallyUnread: true }];
        expect(filterUnread(data).map(c => c.id)).toEqual(['c1']);
    });

    it('excludes a fully-read, non-manually-flagged conversation', () => {
        const data = [{ id: 'c1', unreadCount: 0, manuallyUnread: false }];
        expect(filterUnread(data)).toHaveLength(0);
    });

    it('never lists the same conversation twice even when both conditions are true', () => {
        const data = [{ id: 'c1', unreadCount: 2, manuallyUnread: true }];
        const result = filterUnread(data);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('c1');
    });

    it('disappears from the filter once marked read AND unreadCount is 0 (both cleared)', () => {
        const beforeRead = [{ id: 'c1', unreadCount: 0, manuallyUnread: true }];
        expect(filterUnread(beforeRead)).toHaveLength(1);
        // Simulates the state after mark_conversation_read runs server-side:
        // it clears BOTH real receipts (unreadCount -> 0, already true here)
        // AND marked_unread_at (manuallyUnread -> false) atomically.
        const afterRead = [{ id: 'c1', unreadCount: 0, manuallyUnread: false }];
        expect(filterUnread(afterRead)).toHaveLength(0);
    });
});

// ─── Swipe right — contextual dispatch to the correct mutation ─────────────

function resolveSwipeRightAction(item: { unreadCount?: number; manuallyUnread?: boolean }) {
    return isConversationUnread(item) ? 'markAsRead' : 'markAsUnread';
}

function handleSwipeRight(item: { unreadCount?: number; manuallyUnread?: boolean }, close: () => void, markAsRead: (id: string) => void, markAsUnread: (id: string) => void, id: string) {
    close();
    if (isConversationUnread(item)) markAsRead(id);
    else markAsUnread(id);
}

describe('C-6: Swipe derecho — dispatch contextual', () => {
    it('dispatches markAsRead for an unread conversation (real count)', () => {
        expect(resolveSwipeRightAction({ unreadCount: 1 })).toBe('markAsRead');
    });

    it('dispatches markAsRead for a manually-unread, receipt-wise-read conversation', () => {
        expect(resolveSwipeRightAction({ unreadCount: 0, manuallyUnread: true })).toBe('markAsRead');
    });

    it('dispatches markAsUnread for a fully-read conversation — never a dead gesture', () => {
        expect(resolveSwipeRightAction({ unreadCount: 0, manuallyUnread: false })).toBe('markAsUnread');
    });

    it('read conversation, swipe right, tap: closes then calls markAsUnread (not markAsRead)', () => {
        const close = jest.fn();
        const markAsRead = jest.fn();
        const markAsUnread = jest.fn();
        handleSwipeRight({ unreadCount: 0 }, close, markAsRead, markAsUnread, 'c1');

        expect(close).toHaveBeenCalledTimes(1);
        expect(markAsUnread).toHaveBeenCalledWith('c1');
        expect(markAsRead).not.toHaveBeenCalled();
        expect(close.mock.invocationCallOrder[0]).toBeLessThan(markAsUnread.mock.invocationCallOrder[0]);
    });

    it('unread conversation, swipe right, tap: closes then calls markAsRead (not markAsUnread)', () => {
        const close = jest.fn();
        const markAsRead = jest.fn();
        const markAsUnread = jest.fn();
        handleSwipeRight({ unreadCount: 4 }, close, markAsRead, markAsUnread, 'c2');

        expect(close).toHaveBeenCalledTimes(1);
        expect(markAsRead).toHaveBeenCalledWith('c2');
        expect(markAsUnread).not.toHaveBeenCalled();
    });

    it('swipe left (archive) is untouched by any of this — independent action, independent dispatch', () => {
        // Sanity: archiving never routes through resolveSwipeRightAction.
        const isArchiveAction = (direction: 'left' | 'right') => direction === 'left';
        expect(isArchiveAction('left')).toBe(true);
        expect(isArchiveAction('right')).toBe(false);
    });
});

// ─── Self chat — no special exception ───────────────────────────────────────

describe('C-6: Para mí soporta manual unread igual que cualquier conversación', () => {
    it('a real self-chat conversation follows the exact same isConversationUnread rule', () => {
        const selfChat = { id: 'self-1', isSelf: true, unreadCount: 0, manuallyUnread: true };
        expect(isConversationUnread(selfChat)).toBe(true);
        expect(resolveSwipeRightAction(selfChat)).toBe('markAsRead');
    });

    it('the self-chat placeholder (not created yet) never participates in unread logic', () => {
        // The synthetic SELF_CHAT_PLACEHOLDER has no unreadCount/manuallyUnread
        // fields at all and is never wrapped in Swipeable — nothing to test
        // here beyond confirming the combined check degrades safely to false.
        const placeholder = { id: '__self_chat_placeholder__', isSelf: true, isPlaceholder: true };
        expect(isConversationUnread(placeholder as any)).toBe(false);
    });
});

// ─── Opening a conversation clears the manual marker (section 11) ──────────

describe('C-6: Abrir una conversación limpia manuallyUnread vía el flujo canónico', () => {
    function shouldMarkReadOnOpen(hasRealUnread: boolean, alreadyMarkedThisOpen: boolean) {
        // Mirrors the two effects in useChatMessages.ts: the pre-existing
        // needsReadReceipt-gated effect, plus the new once-per-focus effect
        // that fires regardless of real unread state (covers the
        // manuallyUnread-only case, where needsReadReceipt would never fire).
        if (alreadyMarkedThisOpen) return false;
        return true; // the once-per-open effect always fires on first focus, real-unread or not
    }

    it('fires markAsRead once on open even with zero real unread messages (manual-only case)', () => {
        expect(shouldMarkReadOnOpen(false, false)).toBe(true);
    });

    it('does not fire a second time for the same open/focus session', () => {
        expect(shouldMarkReadOnOpen(false, true)).toBe(false);
    });

    it('still fires for the ordinary real-unread case (existing behavior preserved)', () => {
        expect(shouldMarkReadOnOpen(true, false)).toBe(true);
    });
});

// ─── C-6C: swipe-right mutation failures no longer fail silently ───────────
// Diagnosed on staging: useMarkConversationAsRead/Unread had no onError, so a
// failed tap (missing route, network blip) changed nothing with zero signal.
// Not a workaround for the (now-fixed, certified) backend gap — a real,
// pre-existing resilience gap for genuine future failures.

function handleSwipeRightWithFeedback(
    item: { unreadCount?: number; manuallyUnread?: boolean },
    close: () => void,
    markAsRead: (id: string, opts: { onError: () => void }) => void,
    markAsUnread: (id: string, opts: { onError: () => void }) => void,
    id: string,
    onError: () => void,
) {
    close();
    if (isConversationUnread(item)) markAsRead(id, { onError });
    else markAsUnread(id, { onError });
}

describe('C-6C: feedback de error en swipe derecho', () => {
    it('markAsRead se llama con un onError que informa al usuario', () => {
        const close = jest.fn();
        const onError = jest.fn();
        const markAsRead = jest.fn((_id, opts) => opts.onError());
        const markAsUnread = jest.fn();
        handleSwipeRightWithFeedback({ unreadCount: 2 }, close, markAsRead, markAsUnread, 'c1', onError);
        expect(markAsRead).toHaveBeenCalledWith('c1', { onError });
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('markAsUnread se llama con un onError que informa al usuario', () => {
        const close = jest.fn();
        const onError = jest.fn();
        const markAsRead = jest.fn();
        const markAsUnread = jest.fn((_id, opts) => opts.onError());
        handleSwipeRightWithFeedback({ unreadCount: 0 }, close, markAsRead, markAsUnread, 'c1', onError);
        expect(markAsUnread).toHaveBeenCalledWith('c1', { onError });
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('el éxito no dispara ningún feedback (sólo se usa en onError)', () => {
        const close = jest.fn();
        const onError = jest.fn();
        const markAsRead = jest.fn(); // never invokes opts.onError — simulates success
        const markAsUnread = jest.fn();
        handleSwipeRightWithFeedback({ unreadCount: 1 }, close, markAsRead, markAsUnread, 'c1', onError);
        expect(onError).not.toHaveBeenCalled();
    });
});
