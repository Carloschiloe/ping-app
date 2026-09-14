export type ChatKeyboardBehavior = 'padding' | 'height';

export function getChatKeyboardBehavior(platform: string): ChatKeyboardBehavior {
    return platform === 'ios' ? 'padding' : 'height';
}

// PING — ANDROID CHAT COMPOSER HIDDEN BEHIND KEYBOARD (regression fix):
// KeyboardAvoidingView computes keyboardY = keyboardFrame.screenY -
// keyboardVerticalOffset, then (for behavior:'height') the avoided height
// as frame.y + frame.height - keyboardY (see react-native's own
// KeyboardAvoidingView.js#_relativeKeyboardHeight). A NEGATIVE offset
// therefore INCREASES keyboardY, which SHRINKS the avoided height -- the
// exact opposite of the "raises the composer" intent this function's
// comment used to claim, and the actual root cause of the composer
// ending up partially behind the keyboard on Android. A previously-green
// test (chatKeyboard.test.ts) had encoded that same wrong assumption,
// which is why this regression shipped silently. The fix: a POSITIVE
// offset (or zero) is what actually reserves extra space above the
// keyboard for the Android system navigation/gesture area.
export function getChatKeyboardOffset(platform: string, bottomInset: number): number {
    if (platform === 'ios') return 90;

    return Math.max(20, bottomInset + 12);
}
