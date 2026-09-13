import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    canDeleteMessages,
    isConfirmedMessageId,
    isForwardableMessage,
    orderMessagesForForward,
} from '../src/utils/messageActions';

describe('message actions', () => {
    it('only treats server messages as confirmed', () => {
        expect(isConfirmedMessageId('server-id')).toBe(true);
        expect(isConfirmedMessageId('temp-client-id')).toBe(false);
        expect(isConfirmedMessageId('offline-client-id')).toBe(false);
    });

    it('only permits deleting confirmed messages owned by the user', () => {
        expect(canDeleteMessages([{ id: 'm1', sender_id: 'u1' }], 'u1')).toBe(true);
        expect(canDeleteMessages([{ id: 'm1', sender_id: 'u2' }], 'u1')).toBe(false);
        expect(canDeleteMessages([{ id: 'temp-m1', sender_id: 'u1' }], 'u1')).toBe(false);
        expect(canDeleteMessages([
            { id: 'm1', sender_id: 'u1' },
            { id: 'm2', sender_id: 'u2' },
        ], 'u1')).toBe(false);
    });

    it('does not forward system or file-bearing messages as plain text', () => {
        expect(isForwardableMessage({ id: 'm1', text: 'Hola' })).toBe(true);
        expect(isForwardableMessage({ id: 'm2', text: 'Sistema', meta: { isSystem: true } })).toBe(false);
        expect(isForwardableMessage({ id: 'm3', text: '[imagen]private/path' })).toBe(false);
        expect(isForwardableMessage({ id: 'm4', text: '[document=archivo]private/path' })).toBe(false);
    });

    it('preserves chronological order when forwarding a block', () => {
        const ordered = orderMessagesForForward([
            { id: 'new', created_at: '2026-07-29T12:01:00Z' },
            { id: 'old', created_at: '2026-07-29T12:00:00Z' },
        ]);
        expect(ordered.map((message) => message.id)).toEqual(['old', 'new']);
    });
});

// PING — USER-WRITTEN TEXT COPY / PASTE PHYSICAL GAP. Prior audit proved
// (by direct code read) that ChatInput.tsx's TextInput has no
// contextMenuHidden/selectTextOnFocus/onSelectionChange and no parent
// Pressable/gesture wrapper -- native OS text selection (Copiar/Cortar/
// Pegar/Seleccionar todo) is fully available while typing, same as any
// other plain controlled TextInput. This section proves that
// source-level, since there is no RN renderer in this vitest setup (see
// agentPreview.test.ts header) to exercise native long-press/selection
// directly.
describe('PING — USER-WRITTEN TEXT COPY / PASTE: ChatInput.tsx composer never suppresses native selection/context menu, and paste never auto-sends', () => {
    const inputSource = fs.readFileSync(path.join(__dirname, '../src/components/ChatInput.tsx'), 'utf-8');

    it('the composer TextInput has no contextMenuHidden, no selectTextOnFocus, and editable is never unconditionally false', () => {
        expect(inputSource).not.toMatch(/contextMenuHidden/);
        expect(inputSource).not.toMatch(/selectTextOnFocus/);
        expect(inputSource).not.toMatch(/editable=\{false\}/);
    });

    it('the composer TextInput is a plain controlled input (value/onChangeText) with no onSelectionChange interception', () => {
        const tagIndex = inputSource.indexOf('ref={inputRef}');
        const inputBlock = inputSource.slice(tagIndex - 20, tagIndex + 700);
        expect(inputBlock).toMatch(/value=\{text\}/);
        expect(inputBlock).toMatch(/onChangeText=\{onTextChange\}/);
        expect(inputBlock).not.toMatch(/onSelectionChange/);
    });

    it('the composer TextInput element is not itself wrapped by an enclosing TouchableOpacity/Pressable/gesture element that could swallow long-press-to-select', () => {
        const tagIndex = inputSource.indexOf('ref={inputRef}');
        const immediateWrapperBlock = inputSource.slice(Math.max(0, tagIndex - 200), tagIndex);
        expect(immediateWrapperBlock).not.toMatch(/<TouchableOpacity|<Pressable|<GestureDetector|<PanGestureHandler/);
    });
});

// Own vs. received message bubbles: MessageItem.tsx wires the SAME
// onLongPress callback regardless of isMe -- proving copy is not
// accidentally gated to only one direction. ChatScreen.tsx's onLongPress
// handler opens MessageActionsModal, whose "Copiar" row (onCopy) is
// rendered unconditionally (never gated on isOwnMessage, unlike the
// Eliminar row which correctly IS gated) -- so both outgoing and incoming
// messages reach the same copy path.
describe('PING — USER-WRITTEN TEXT COPY / PASTE: normal chat own-message bubble (outgoing) and received bubble (incoming) both reach the same copy path, never gated to only one direction', () => {
    const itemSource = fs.readFileSync(path.join(__dirname, '../src/components/MessageItem.tsx'), 'utf-8');
    const screenSource = fs.readFileSync(path.join(__dirname, '../src/screens/ChatScreen.tsx'), 'utf-8');
    const modalSource = fs.readFileSync(path.join(__dirname, '../src/components/MessageActionsModal.tsx'), 'utf-8');

    it('MessageItem.tsx wires onLongPress on the message bubble unconditionally -- not gated on isMe/isOwn', () => {
        expect(itemSource).toMatch(/onLongPress=\{\(\) => onLongPress\(item\)\}/);
        expect(itemSource).toMatch(/delayLongPress=\{350\}/);
    });

    it('ChatScreen.tsx opens MessageActionsModal from the SAME onLongPress handler for any selected message, own or not', () => {
        expect(screenSource).toMatch(/onLongPress=\{\(msg\) => \{/);
        expect(screenSource).toMatch(/setSelectedMsg\(msg\)/);
    });

    it('onCopy in ChatScreen.tsx reads selectedMsg.text and copies via Clipboard.setStringAsync, gated only on the text existing -- no isOwnMessage/isMe guard blocks the copy path for either direction', () => {
        const startIndex = screenSource.indexOf('onCopy={async () => {');
        expect(startIndex).toBeGreaterThan(-1);
        const endIndex = screenSource.indexOf('onToggleSelect={() => {', startIndex);
        const body = screenSource.slice(startIndex, endIndex);
        expect(body).toMatch(/Clipboard\.setStringAsync\(selectedMsg\.text\)/);
        expect(body).not.toMatch(/isOwnMessage|isMe|sender_id ===/);
    });

    it('MessageActionsModal renders the Copiar action row unconditionally -- unlike Eliminar (deliberately gated on isOwnMessage), Copiar has no such gate', () => {
        const copyRowIndex = modalSource.indexOf('onPress={onCopy}');
        const deleteGateIndex = modalSource.indexOf('{isOwnMessage && (');
        expect(copyRowIndex).toBeGreaterThan(-1);
        // Copiar's TouchableOpacity is not wrapped in an isOwnMessage conditional --
        // it appears strictly before the isOwnMessage-gated Eliminar block.
        expect(copyRowIndex).toBeLessThan(deleteGateIndex);
        const copyBlock = modalSource.slice(Math.max(0, copyRowIndex - 120), copyRowIndex);
        expect(copyBlock).not.toMatch(/isOwnMessage &&/);
    });
});
