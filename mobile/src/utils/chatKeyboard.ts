export type ChatKeyboardBehavior = 'padding' | 'height';

export function getChatKeyboardBehavior(platform: string): ChatKeyboardBehavior {
    return platform === 'ios' ? 'padding' : 'height';
}
