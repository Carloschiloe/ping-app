import { describe, expect, it } from 'vitest';
import { getChatKeyboardBehavior, getChatKeyboardOffset } from '../src/utils/chatKeyboard';

describe('chat keyboard layout', () => {
    it('uses explicit height avoidance on Android and Expo Go', () => {
        expect(getChatKeyboardBehavior('android')).toBe('height');
    });

    it('keeps padding avoidance on iOS', () => {
        expect(getChatKeyboardBehavior('ios')).toBe('padding');
    });

    // PING — ANDROID CHAT COMPOSER HIDDEN BEHIND KEYBOARD (regression fix):
    // the previous expectations here (-36 / -20) encoded the exact wrong
    // sign that caused the physical regression -- KeyboardAvoidingView
    // computes keyboardY = screenY - keyboardVerticalOffset, so a NEGATIVE
    // offset shrinks (not grows) the avoided-keyboard height for
    // behavior:'height', leaving the composer partially under the
    // keyboard. A positive offset is what actually reserves extra space
    // above the keyboard for Android's edge-to-edge navigation area.
    it('raises the Android composer above edge-to-edge navigation controls with a POSITIVE offset (negative would shrink, not grow, the avoided height)', () => {
        expect(getChatKeyboardOffset('android', 24)).toBe(36);
        expect(getChatKeyboardOffset('android', 0)).toBe(20);
        expect(getChatKeyboardOffset('android', 24)).toBeGreaterThan(0);
    });

    it('keeps the established iOS header offset', () => {
        expect(getChatKeyboardOffset('ios', 34)).toBe(90);
    });

    // PING — ANDROID CHAT COMPOSER HIDDEN BEHIND KEYBOARD (regression fix):
    // reproduces react-native's OWN KeyboardAvoidingView._relativeKeyboardHeight
    // formula (behavior:'height' branch) directly against this util's
    // output, so a future sign/magnitude regression fails here instead of
    // only being caught on a physical device. Source:
    // node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js
    //   keyboardY = keyboardFrame.screenY - keyboardVerticalOffset
    //   avoidedHeight (behavior:'height') = max(frame.y + frame.height - keyboardY, 0)
    function relativeKeyboardHeightForHeightBehavior(
        frameY: number, frameHeight: number, keyboardScreenY: number, keyboardVerticalOffset: number,
    ): number {
        const keyboardY = keyboardScreenY - keyboardVerticalOffset;
        return Math.max(frameY + frameHeight - keyboardY, 0);
    }

    it('a positive Android offset INCREASES the real avoided-keyboard height computed by KeyboardAvoidingView -- the composer is pushed further above the keyboard, never under it', () => {
        const frameY = 0;
        const frameHeight = 800;
        const keyboardScreenY = 550; // top edge of the keyboard on screen
        const zeroOffsetHeight = relativeKeyboardHeightForHeightBehavior(frameY, frameHeight, keyboardScreenY, 0);
        const androidOffset = getChatKeyboardOffset('android', 24);
        const withOffsetHeight = relativeKeyboardHeightForHeightBehavior(frameY, frameHeight, keyboardScreenY, androidOffset);

        expect(androidOffset).toBeGreaterThan(0);
        expect(withOffsetHeight).toBeGreaterThan(zeroOffsetHeight);
    });

    it('regression guard: the OLD negative offset would have SHRUNK the avoided-keyboard height below the zero-offset baseline -- proves why the composer ended up partially behind the keyboard', () => {
        const frameY = 0;
        const frameHeight = 800;
        const keyboardScreenY = 550;
        const zeroOffsetHeight = relativeKeyboardHeightForHeightBehavior(frameY, frameHeight, keyboardScreenY, 0);
        const oldRegressedOffset = -36; // the exact value this fix replaces
        const withOldOffsetHeight = relativeKeyboardHeightForHeightBehavior(frameY, frameHeight, keyboardScreenY, oldRegressedOffset);

        expect(withOldOffsetHeight).toBeLessThan(zeroOffsetHeight);
    });
});
