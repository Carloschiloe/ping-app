import { describe, expect, it } from 'vitest';
import { getChatKeyboardBehavior, getChatKeyboardOffset } from '../src/utils/chatKeyboard';

describe('chat keyboard layout', () => {
    it('uses explicit height avoidance on Android and Expo Go', () => {
        expect(getChatKeyboardBehavior('android')).toBe('height');
    });

    it('keeps padding avoidance on iOS', () => {
        expect(getChatKeyboardBehavior('ios')).toBe('padding');
    });

    it('raises the Android composer above edge-to-edge navigation controls', () => {
        expect(getChatKeyboardOffset('android', 24)).toBe(-36);
        expect(getChatKeyboardOffset('android', 0)).toBe(-20);
    });

    it('keeps the established iOS header offset', () => {
        expect(getChatKeyboardOffset('ios', 34)).toBe(90);
    });
});
