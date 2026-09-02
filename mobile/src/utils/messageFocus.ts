export type MessageFocusDecision = 'idle' | 'already_handled' | 'waiting' | 'unavailable' | 'ready';

export function getMessageFocusDecision(input: {
    requestedMessageId?: string;
    handledMessageId: string | null;
    targetFound?: boolean;
    loadedMessageIds: string[];
}): MessageFocusDecision {
    if (!input.requestedMessageId) return 'idle';
    if (input.handledMessageId === input.requestedMessageId) return 'already_handled';
    if (input.targetFound === false) return 'unavailable';
    if (input.loadedMessageIds.includes(input.requestedMessageId)) return 'ready';
    return 'waiting';
}
