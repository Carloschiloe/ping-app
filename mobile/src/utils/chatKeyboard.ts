export type ChatKeyboardBehavior = 'padding' | 'height';

export function getChatKeyboardBehavior(platform: string): ChatKeyboardBehavior {
    return platform === 'ios' ? 'padding' : 'height';
}

export function getChatKeyboardOffset(platform: string, bottomInset: number): number {
    if (platform === 'ios') return 90;

    // Android edge-to-edge needs extra displacement for the system navigation
    // area. A negative offset increases the avoided keyboard height.
    return -Math.max(20, bottomInset + 12);
}
