import { describe, expect, it } from 'vitest';
import { getChatKeyboardBehavior } from '../src/utils/chatKeyboard';

describe('chat keyboard layout', () => {
    it('uses explicit height avoidance on Android and Expo Go', () => {
        expect(getChatKeyboardBehavior('android')).toBe('height');
    });

    it('keeps padding avoidance on iOS', () => {
        expect(getChatKeyboardBehavior('ios')).toBe('padding');
    });
});
