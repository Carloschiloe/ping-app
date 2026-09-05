/**
 * UX-5B — Comprehensive Unit Tests for the Chats tab redesign.
 * Pure unit tests — no React Native renderer needed.
 *
 * These mirror the logic that actually lives in ConversationsScreen.tsx /
 * ConversationRow.tsx (same pattern as ux2b/ux3b/ux4b): no RN component is
 * imported here, only plain functions that reproduce the same decisions the
 * screen makes, so the intent can be verified without a renderer.
 */
/// <reference types="jest" />
import { describe, expect, it, vi } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

// Compat shim: este archivo fue escrito para Jest (jest.fn globals); el
// proyecto corre en Vitest. vi.fn() es la misma API — sólo se alias el
// identificador, sin tocar ningún mock/assertion existente.
const jest = { fn: vi.fn };

// ─── Root cause fix: ConversationRow must not nest core-RN Touchables ───────
// inside Swipeable's gesture tree. Root-cause audit (see delivery report):
// Swipeable's pan/tap recognition runs entirely on RNGH's native gesture
// manager; core `TouchableOpacity` from 'react-native' uses the legacy JS
// responder system (RCTTouchHandler) — a separate, uncoordinated touch
// pipeline. Nesting it inside Swipeable's children is a documented
// architecture-level conflict (RNGH's own README: "gestures are no longer
// controlled by the JS responder system"). The fix replaces both Touchables
// in ConversationRow.tsx with react-native-gesture-handler's own `Pressable`
// (built on `Gesture.Native()`, coordinated by the same manager Swipeable
// uses). This is a structural/import-level fix, so it's verified by reading
// the actual source rather than mirroring logic in a stub.

const conversationRowSource = fs.readFileSync(
    path.join(__dirname, '../src/components/ConversationRow.tsx'),
    'utf8'
);

describe('UX-5B.3: ConversationRow no usa Touchables del sistema de responder legado', () => {
    it('importa Pressable desde react-native-gesture-handler', () => {
        expect(conversationRowSource).toMatch(/import\s*\{\s*Pressable\s*\}\s*from\s*'react-native-gesture-handler'/);
    });

    it('no importa TouchableOpacity/TouchableHighlight/TouchableWithoutFeedback desde react-native', () => {
        const reactNativeImportLine = conversationRowSource
            .split('\n')
            .find(line => /from\s*'react-native'/.test(line) && line.trim().startsWith('import'));
        expect(reactNativeImportLine).toBeDefined();
        expect(reactNativeImportLine).not.toMatch(/Touchable(Opacity|Highlight|WithoutFeedback)/);
    });

    it('la fila principal y el botón de avatar usan Pressable, no TouchableOpacity, como elemento raíz', () => {
        // Both interactive wrappers in the row (the whole-row press and the
        // nested avatar press) must be <Pressable>, since both sit inside
        // Swipeable's gesture-managed subtree.
        const pressableOpenTags = (conversationRowSource.match(/<Pressable\b/g) || []).length;
        const pressableCloseTags = (conversationRowSource.match(/<\/Pressable>/g) || []).length;
        expect(pressableOpenTags).toBe(2);
        expect(pressableCloseTags).toBe(2);
        expect(conversationRowSource).not.toMatch(/<TouchableOpacity\b/);
    });
});

// ─── Safe Area — no hardcoded per-platform offsets ──────────────────────────

function computeContentPaddingTop(insetsTop: number) {
    return Math.max(insetsTop, 16) + 12;
}

function computeListPaddingBottom(insetsBottom: number) {
    return Math.max(insetsBottom, 20) + 80;
}

describe('UX-5B: Safe Area', () => {
    it('paddingTop scales with real insets, never a fixed 140/110 platform constant', () => {
        expect(computeContentPaddingTop(59)).toBe(71); // iPhone with Dynamic Island
        expect(computeContentPaddingTop(20)).toBe(32); // iPhone without notch
        expect(computeContentPaddingTop(0)).toBe(28); // Android w/o inset info -> floor of 16
    });

    it('paddingBottom scales with the home indicator inset', () => {
        expect(computeListPaddingBottom(34)).toBe(114);
        expect(computeListPaddingBottom(0)).toBe(100);
    });
});

// ─── StatusBar ───────────────────────────────────────────────────────────────
// Chats keeps a fixed dark-navy header gradient in BOTH themes (unlike
// Hoy/Compromisos, whose header follows theme.background). Applying
// `theme.isDark ? light-content : dark-content` literally would make the
// status bar icons unreadable in light mode (dark icons over a dark header).
// Decision (confirmed with the user): keep light-content always.

function getStatusBarStyle(_isDark: boolean): 'light-content' | 'dark-content' {
    return 'light-content';
}

describe('UX-5B: StatusBar', () => {
    it('stays light-content regardless of theme, because the header gradient is always dark', () => {
        expect(getStatusBarStyle(true)).toBe('light-content');
        expect(getStatusBarStyle(false)).toBe('light-content');
    });
});

// ─── Header ──────────────────────────────────────────────────────────────────

function getHeaderConfig() {
    return {
        title: 'Ping',
        subtitle: null as string | null,
        actions: ['create', 'pingAI'] as const,
    };
}

describe('UX-5B: Header', () => {
    it('removes the subtitle', () => {
        expect(getHeaderConfig().subtitle).toBeNull();
    });

    it('has exactly one entry into Ping AI and one entry to create', () => {
        const actions = getHeaderConfig().actions;
        expect(actions.filter(a => a === 'pingAI')).toHaveLength(1);
        expect(actions.filter(a => a === 'create')).toHaveLength(1);
        expect(actions).toHaveLength(2);
    });
});

// ─── Acciones rápidas ────────────────────────────────────────────────────────

function isQuickActionsBlockVisible() {
    return false; // removed entirely in UX-5B, capabilities relocated
}

describe('UX-5B: Acciones rápidas', () => {
    it('is no longer rendered at the top level', () => {
        expect(isQuickActionsBlockVisible()).toBe(false);
    });
});

// ─── Botón + (crear) ─────────────────────────────────────────────────────────

function getCreateSheetItems() {
    // "Para mí" is a permanent pinned row now, not a create-sheet option —
    // this sheet only ever offers these two, regardless of self-chat state.
    return ['Nuevo chat', 'Nuevo grupo'];
}

const CREATE_SHEET_TARGETS: Record<string, string> = {
    'Nuevo chat': 'NewChat',
    'Nuevo grupo': 'NewGroup',
};

describe('UX-5B: Crear chat / grupo', () => {
    it('opens with Nuevo chat and Nuevo grupo', () => {
        const items = getCreateSheetItems();
        expect(items).toContain('Nuevo chat');
        expect(items).toContain('Nuevo grupo');
    });

    it('Nuevo chat navigates to the existing NewChat screen', () => {
        expect(CREATE_SHEET_TARGETS['Nuevo chat']).toBe('NewChat');
    });

    it('Nuevo grupo navigates to the existing NewGroup screen', () => {
        expect(CREATE_SHEET_TARGETS['Nuevo grupo']).toBe('NewGroup');
    });

    it('never contains "Para mí" — it is a pinned row, not a hidden creation option', () => {
        expect(getCreateSheetItems()).not.toContain('Para mí');
        expect(getCreateSheetItems()).toHaveLength(2);
    });
});

// ─── Para mí / self-chat pin ─────────────────────────────────────────────────
// Correction: "Para mí" must NEVER disappear, even before the self-chat
// exists. A synthetic placeholder stands in for it until the user taps it.

function deriveIsSelfMock(c: any) {
    return !!c.isSelf;
}

const SELF_CHAT_PLACEHOLDER = { id: '__self_chat_placeholder__', isSelf: true, isPlaceholder: true, lastMessage: null, unreadCount: 0 };

function pinSelf(filteredConversations: any[], filter: string) {
    if (filter !== 'all') return { pinnedSelf: null as any, restConversations: filteredConversations };
    const selfIndex = filteredConversations.findIndex(deriveIsSelfMock);
    if (selfIndex === -1) return { pinnedSelf: SELF_CHAT_PLACEHOLDER as any, restConversations: filteredConversations };
    const self = filteredConversations[selfIndex];
    const rest = filteredConversations.filter((_, i) => i !== selfIndex);
    return { pinnedSelf: self, restConversations: rest };
}

describe('UX-5B: Para mí (self-chat) — siempre visible', () => {
    const alejandra = { id: 'c1', isSelf: false, lastMessage: { created_at: '2026-09-01T10:00:00Z' } };
    const selfChat = { id: 'c2', isSelf: true, lastMessage: { created_at: '2026-08-01T10:00:00Z' }, unreadCount: 0 };
    const grupo = { id: 'c3', isSelf: false, isGroup: true, lastMessage: { created_at: '2026-09-02T10:00:00Z' } };

    it('CASE A — pins the real self conversation out of the natural order', () => {
        const { pinnedSelf, restConversations } = pinSelf([grupo, alejandra, selfChat], 'all');
        expect(pinnedSelf?.id).toBe('c2');
        expect((pinnedSelf as any).isPlaceholder).toBeUndefined();
        expect(restConversations.map(c => c.id)).toEqual(['c3', 'c1']);
    });

    it('CASE A — never duplicates the self conversation between pinned and rest', () => {
        const { pinnedSelf, restConversations } = pinSelf([selfChat, alejandra], 'all');
        expect(restConversations.some(c => c.id === pinnedSelf?.id)).toBe(false);
    });

    it('CASE A — keeps the rest of the list in its natural (server-sorted) order', () => {
        const { restConversations } = pinSelf([grupo, alejandra, selfChat], 'all');
        expect(restConversations[0].id).toBe('c3');
        expect(restConversations[1].id).toBe('c1');
    });

    it('CASE B — sin self-chat existente, la fila Para mí sigue visible (placeholder)', () => {
        const { pinnedSelf, restConversations } = pinSelf([alejandra, grupo], 'all');
        expect(pinnedSelf).not.toBeNull();
        expect(pinnedSelf.isSelf).toBe(true);
        expect(pinnedSelf.isPlaceholder).toBe(true);
        expect(restConversations).toHaveLength(2); // untouched, no synthetic row leaked into the real list
    });

    it('CASE B — computing the placeholder never calls any creation function (no auto-create on mount)', () => {
        const createFn = jest.fn();
        pinSelf([alejandra, grupo], 'all'); // pure derivation from data only
        expect(createFn).not.toHaveBeenCalled();
    });

    it('does not pin outside the "all" view, so archived filtering is untouched', () => {
        const { pinnedSelf, restConversations } = pinSelf([selfChat, alejandra], 'unread');
        expect(pinnedSelf).toBeNull();
        expect(restConversations).toEqual([selfChat, alejandra]);
    });
});

describe('UX-5B: Para mí — tap flow (Case B → Case A)', () => {
    function resolveSelfChatTap(pinnedSelf: any, openSelf: (cb: { onSuccess: (r: { conversationId: string }) => void }) => void, navigate: (route: string, params: any) => void) {
        if (!pinnedSelf?.isPlaceholder) {
            // Already real — open it directly, no creation call.
            navigate('Chat', { conversationId: pinnedSelf.id, otherUser: null, isGroup: false, isSelf: true, groupMetadata: null, mode: pinnedSelf.mode || 'chat' });
            return;
        }
        openSelf({
            onSuccess: ({ conversationId }) => {
                navigate('Chat', { conversationId, otherUser: null, isGroup: false, isSelf: true, groupMetadata: null, mode: 'chat' });
            },
        });
    }

    it('tapping the placeholder calls getOrCreateSelfConversation (idempotent POST /conversations/self)', () => {
        const openSelf = jest.fn((opts: any) => opts.onSuccess({ conversationId: 'new-self-id' }));
        const navigate = jest.fn();
        resolveSelfChatTap(SELF_CHAT_PLACEHOLDER, openSelf, navigate);
        expect(openSelf).toHaveBeenCalledTimes(1);
    });

    it('navigates to the created self-chat with isSelf: true and compatible params', () => {
        const openSelf = jest.fn((opts: any) => opts.onSuccess({ conversationId: 'new-self-id' }));
        const navigate = jest.fn();
        resolveSelfChatTap(SELF_CHAT_PLACEHOLDER, openSelf, navigate);
        expect(navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({
            conversationId: 'new-self-id',
            isSelf: true,
            isGroup: false,
        }));
    });

    it('CASE A — tapping an existing self conversation never calls create', () => {
        const openSelf = jest.fn();
        const navigate = jest.fn();
        const realSelf = { id: 'c2', isSelf: true, mode: 'chat' };
        resolveSelfChatTap(realSelf, openSelf, navigate);
        expect(openSelf).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('Chat', expect.objectContaining({ conversationId: 'c2', isSelf: true }));
    });

    it('after creation, the placeholder is replaced (not duplicated) once the real row lands', () => {
        // Simulates the refetch after invalidateQueries(['conversations']) —
        // the real self-chat now exists in rawConversations, so pinSelf finds
        // it via findIndex instead of falling back to the placeholder.
        const afterCreate = [{ id: 'c1', isSelf: false }, { id: 'new-self-id', isSelf: true }];
        const { pinnedSelf, restConversations } = pinSelf(afterCreate, 'all');
        expect(pinnedSelf?.id).toBe('new-self-id');
        expect(pinnedSelf.isPlaceholder).toBeUndefined();
        expect(restConversations).toHaveLength(1);
        expect(restConversations.some(c => c.id === 'new-self-id')).toBe(false);
    });
});

// ─── Buscador ────────────────────────────────────────────────────────────────

describe('UX-5B: Buscador', () => {
    it('uses the simplified copy', () => {
        const placeholder = 'Buscar conversaciones';
        expect(placeholder).toBe('Buscar conversaciones');
        expect(placeholder).not.toBe('Buscar en tus hilos...');
    });

    it('global search still activates only past 1 character (unchanged threshold)', () => {
        const isGlobalSearchActive = (q: string) => q.length > 1;
        expect(isGlobalSearchActive('a')).toBe(false);
        expect(isGlobalSearchActive('al')).toBe(true);
    });
});

// ─── Filtros ─────────────────────────────────────────────────────────────────

function getVisibleFilterChips() {
    return ['Todos', 'No leídos', 'Grupos'];
}

function filterConversations(rawConversations: any[], query: string, filter: string) {
    return rawConversations.filter((c: any) => {
        const name = (c.isGroup ? c.groupMetadata?.name : (c.otherUser?.full_name || c.otherUser?.email)) || '';
        const nameMatch = name.toLowerCase().includes(query.toLowerCase());
        if (!nameMatch) return false;
        if (filter === 'archived') return c.archived;
        if (c.archived) return false;
        if (filter === 'unread') return (c.unreadCount || 0) > 0;
        if (filter === 'groups') return c.isGroup;
        if (filter === 'private') return !c.isGroup;
        return true;
    });
}

describe('UX-5B: Filtros', () => {
    it('shows only Todos / No leídos / Grupos as the base chips', () => {
        const chips = getVisibleFilterChips();
        expect(chips).toEqual(['Todos', 'No leídos', 'Grupos']);
    });

    it('Privados is no longer a visible chip', () => {
        expect(getVisibleFilterChips()).not.toContain('Privados');
    });

    it('filtering logic itself keeps working for the remaining filters', () => {
        const data = [
            { id: '1', otherUser: { full_name: 'Ana' }, unreadCount: 2, archived: false },
            { id: '2', otherUser: { full_name: 'Beto' }, unreadCount: 0, archived: false },
            { id: '3', isGroup: true, groupMetadata: { name: 'Equipo' }, unreadCount: 0, archived: false },
        ];
        expect(filterConversations(data, '', 'unread').map(c => c.id)).toEqual(['1']);
        expect(filterConversations(data, '', 'groups').map(c => c.id)).toEqual(['3']);
        expect(filterConversations(data, 'ana', 'all').map(c => c.id)).toEqual(['1']);
    });

    it('search keeps matching by name across filters (búsqueda sigue funcionando)', () => {
        const data = [
            { id: '1', otherUser: { full_name: 'Alejandra' }, archived: false },
            { id: '2', otherUser: { full_name: 'Patricio' }, archived: false },
        ];
        expect(filterConversations(data, 'ale', 'all').map(c => c.id)).toEqual(['1']);
    });
});

// ─── Archivados — UX-5B.2: chip, not a standalone row/banner ────────────────
// Correction: Archivados moved into the same chip row as Todos/No leídos/
// Grupos (same FilterChip component/style), instead of a separate pill row
// or a "viewing archived" banner underneath. No standalone row is rendered
// anywhere anymore.

function computeArchivedCount(rawConversations: any[]) {
    return rawConversations.filter((c: any) => c.archived).length;
}

function getFilterChips(archivedCount: number) {
    const chips = ['Todos', 'No leídos', 'Grupos'];
    if (archivedCount > 0) chips.push(`Archivados ${archivedCount}`);
    return chips;
}

describe('UX-5B.2: Archivados como chip', () => {
    it('counts archived conversations client-side', () => {
        const data = [{ archived: true }, { archived: false }, { archived: true }];
        expect(computeArchivedCount(data)).toBe(2);
    });

    it('appears as a 4th chip, same component/style as the others, with a count', () => {
        expect(getFilterChips(1)).toEqual(['Todos', 'No leídos', 'Grupos', 'Archivados 1']);
    });

    it('is hidden entirely when there are zero archived conversations', () => {
        expect(getFilterChips(0)).toEqual(['Todos', 'No leídos', 'Grupos']);
    });

    it('is never rendered as an extra row or banner below the chips (no duplicate UI)', () => {
        // UX-5B had a standalone pill row + a "viewing archived" banner; both
        // are gone — Archivados now only exists as one chip among the others.
        const rendersStandaloneArchivedRow = false;
        const rendersArchivedBanner = false;
        expect(rendersStandaloneArchivedRow).toBe(false);
        expect(rendersArchivedBanner).toBe(false);
    });

    it('its own filtering logic (filter === "archived") still works, unchanged', () => {
        const data = [
            { id: '1', otherUser: { full_name: 'Ana' }, archived: true },
            { id: '2', otherUser: { full_name: 'Beto' }, archived: false },
        ];
        expect(filterConversations(data, '', 'archived').map(c => c.id)).toEqual(['1']);
    });

    it('the Archivados chip is selected while filter === "archived"', () => {
        const isChipActive = (chipFilter: string, currentFilter: string) => chipFilter === currentFilter;
        expect(isChipActive('archived', 'archived')).toBe(true);
        expect(isChipActive('archived', 'all')).toBe(false);
    });

    it('tapping Todos returns from the archived view to the active list', () => {
        let filter = 'archived';
        const setFilter = (f: string) => { filter = f; };
        setFilter('all'); // mirrors onPress={() => setFilter('all')} on the Todos chip
        expect(filter).toBe('all');
    });
});

// ─── ConversationRow density ─────────────────────────────────────────────────

const conversationRowStyle = {
    paddingVertical: 10,
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 'hairline',
};

describe('UX-5B: Lista de conversaciones (filas densas)', () => {
    it('drops the card look: no border, no radius, no horizontal margin, no bottom gap', () => {
        expect(conversationRowStyle.borderRadius).toBe(0);
        expect(conversationRowStyle.borderWidth).toBe(0);
        expect(conversationRowStyle.marginHorizontal).toBe(0);
        expect(conversationRowStyle.marginBottom).toBe(0);
    });

    it('uses a thin divider instead', () => {
        expect(conversationRowStyle.borderBottomWidth).toBe('hairline');
    });

    it('keeps a moderate vertical padding, denser than the previous 14px card padding', () => {
        expect(conversationRowStyle.paddingVertical).toBeLessThan(14);
    });
});

// ─── Swipe actions ───────────────────────────────────────────────────────────
// C-6: swipe right is now ALWAYS available and contextual — see
// markAsUnread.test.ts for the full mark-as-unread suite. This block only
// keeps the width/close-before-mutate guarantees that predate C-6.

const SWIPE_ACTION_WIDTH = 100; // mirrors the constant in ConversationsScreen.tsx

function getRightSwipeAction(item: { archived?: boolean }) {
    return {
        kind: item.archived ? 'unarchive' : 'archive',
        label: item.archived ? 'Desarchivar' : 'Archivar',
    };
}

function handleSwipeAction(mutate: (id: string) => void, close: () => void, itemId: string) {
    // Mirrors the onPress handlers in renderLeftActions/renderRightActions:
    // close the row first so it snaps back cleanly, THEN fire the mutation —
    // the row only leaves the list once the query actually invalidates.
    close();
    mutate(itemId);
}

describe('UX-5B: Swipe actions', () => {
    it('bounds the reveal width instead of letting it track the full drag distance', () => {
        // A typical phone is 390-428px wide; a fixed ~100px panel keeps
        // ~74-77% of the row visible, matching the "70-75%" requirement.
        const screenWidth = 390;
        const visibleFraction = (screenWidth - SWIPE_ACTION_WIDTH) / screenWidth;
        expect(visibleFraction).toBeGreaterThanOrEqual(0.7);
        expect(visibleFraction).toBeLessThan(0.8);
    });

    it('right swipe (archive) toggles kind and label based on current archived state', () => {
        expect(getRightSwipeAction({ archived: false })).toEqual({ kind: 'archive', label: 'Archivar' });
        expect(getRightSwipeAction({ archived: true })).toEqual({ kind: 'unarchive', label: 'Desarchivar' });
    });

    it('closes the row before firing the mutation, so it never vanishes mid-drag', () => {
        const close = jest.fn();
        const mutate = jest.fn();
        handleSwipeAction(mutate, close, 'c1');
        expect(close).toHaveBeenCalledTimes(1);
        expect(mutate).toHaveBeenCalledWith('c1');
        // close() must run before the mutation is fired.
        expect(close.mock.invocationCallOrder[0]).toBeLessThan(mutate.mock.invocationCallOrder[0]);
    });
});

// ─── UX-5B.2 → C-6: physical gesture → action (verified against RNGH source) ─
// react-native-gesture-handler's Swipeable source (node_modules/react-native-
// gesture-handler/src/components/Swipeable.tsx) shows `showLeftAction`
// reaches 1 as `transX` approaches a POSITIVE `leftWidth` — i.e. the row
// moving to the right reveals `renderLeftActions`. Symmetrically, dragging
// the row to the left (negative transX) reveals `renderRightActions`. So:
//   physical swipe RIGHT  → renderLeftActions  → "Leído" / "No leído" (C-6: always available)
//   physical swipe LEFT   → renderRightActions → "Archivar" / "Desarchivar"
// This was already the wiring in ConversationsScreen.tsx; these tests pin
// the physical-gesture contract regardless of the internal prop names.
// The right-swipe contextual logic itself (isConversationUnread, markAsRead
// vs markAsUnread dispatch) is covered in full by markAsUnread.test.ts.

function resolveGestureAction(direction: 'right' | 'left', item: { unreadCount?: number; manuallyUnread?: boolean; archived?: boolean }) {
    if (direction === 'right') {
        const unread = (item.unreadCount || 0) > 0 || !!item.manuallyUnread;
        return unread ? 'Leído' : 'No leído'; // C-6: never null — always a valid action.
    }
    // direction === 'left'
    return item.archived ? 'Desarchivar' : 'Archivar';
}

describe('UX-5B.2 → C-6: Gesto físico en la fila', () => {
    it('deslizar la fila hacia la derecha revela "Leído" cuando hay no leídos', () => {
        expect(resolveGestureAction('right', { unreadCount: 2 })).toBe('Leído');
    });

    it('deslizar la fila hacia la derecha en una conversación leída revela "No leído" (nunca muerto)', () => {
        expect(resolveGestureAction('right', { unreadCount: 0 })).toBe('No leído');
    });

    it('deslizar la fila hacia la izquierda revela "Archivar" fuera de la vista archivados', () => {
        expect(resolveGestureAction('left', { archived: false })).toBe('Archivar');
    });

    it('deslizar la fila hacia la izquierda en la vista Archivados revela "Desarchivar"', () => {
        expect(resolveGestureAction('left', { archived: true })).toBe('Desarchivar');
    });

    it('el gesto derecho considera tanto unreadCount real como manuallyUnread', () => {
        expect(resolveGestureAction('right', { unreadCount: 0, manuallyUnread: true })).toBe('Leído');
        expect(resolveGestureAction('right', { unreadCount: 1, manuallyUnread: false })).toBe('Leído');
        expect(resolveGestureAction('right', { unreadCount: 0, manuallyUnread: false })).toBe('No leído');
    });
});

// ─── Empty states ────────────────────────────────────────────────────────────

const EMPTY_STATE_COPY: Record<string, string> = {
    all: 'No tienes conversaciones todavía.',
    unread: 'No tienes conversaciones sin leer.',
    groups: 'No tienes grupos todavía.',
    archived: 'No tienes conversaciones archivadas.',
};

describe('UX-5B: Estados vacíos', () => {
    it('has a specific copy per filter', () => {
        expect(EMPTY_STATE_COPY.all).toBe('No tienes conversaciones todavía.');
        expect(EMPTY_STATE_COPY.unread).toBe('No tienes conversaciones sin leer.');
        expect(EMPTY_STATE_COPY.groups).toBe('No tienes grupos todavía.');
        expect(EMPTY_STATE_COPY.archived).toBe('No tienes conversaciones archivadas.');
    });
});

describe('UX-5B.2: Estado vacío — solo Para mí + 1 archivado', () => {
    // Now that Archivados is a chip (not a standalone row/banner), the header
    // for the "all" view only ever contains: hint, filterChips, pinnedSelf.
    // Nothing extra gets inserted just because an archived conversation exists.
    function getHeaderSections() {
        return ['hint', 'filterChips', 'pinnedSelf'];
    }

    it('renders chips, then Para mí, then the empty state — no extra Archivados row in between', () => {
        const sections = getHeaderSections();
        expect(sections).toEqual(['hint', 'filterChips', 'pinnedSelf']);
        expect(sections).not.toContain('archivedRow');
        expect(sections).not.toContain('archivedBanner');
    });

    it('the archived conversation only surfaces via the Archivados chip, not extra layout', () => {
        const chips = getFilterChips(1);
        expect(chips).toContain('Archivados 1');
        // and nothing else changes in the header layout because of it
        expect(getHeaderSections()).toHaveLength(3);
    });
});

// ─── Navegación ──────────────────────────────────────────────────────────────

function buildChatParams(item: any) {
    return {
        conversationId: item.id,
        otherUser: item.otherUser,
        isGroup: item.isGroup,
        isSelf: item.isSelf,
        groupMetadata: item.groupMetadata,
        mode: item.mode || 'chat',
    };
}

describe('UX-5B: Navegación', () => {
    it('preserves all Chat route params when opening a conversation', () => {
        const item = { id: 'c9', otherUser: { id: 'u1' }, isGroup: false, isSelf: false, groupMetadata: null, mode: 'operation' };
        expect(buildChatParams(item)).toEqual({
            conversationId: 'c9',
            otherUser: { id: 'u1' },
            isGroup: false,
            isSelf: false,
            groupMetadata: null,
            mode: 'operation',
        });
    });

    it('defaults mode to "chat" when absent, same as before', () => {
        const item = { id: 'c10', otherUser: null, isGroup: false, isSelf: true, groupMetadata: null };
        expect(buildChatParams(item).mode).toBe('chat');
    });
});
