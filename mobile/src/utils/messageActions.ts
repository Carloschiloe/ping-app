const LOCAL_MESSAGE_PREFIXES = ['temp-', 'offline-'];
const NON_FORWARDABLE_CONTENT_PREFIXES = ['[imagen]', '[video]', '[audio]', '[document='];

export function isConfirmedMessageId(messageId: string | null | undefined) {
    return Boolean(
        messageId
        && !LOCAL_MESSAGE_PREFIXES.some((prefix) => messageId.startsWith(prefix))
    );
}

export function canDeleteMessages(messages: any[], userId: string | null | undefined) {
    return Boolean(
        userId
        && messages.length > 0
        && messages.every((message) =>
            message?.sender_id === userId
            && isConfirmedMessageId(message?.id)
        )
    );
}

export function isForwardableMessage(message: any) {
    const text = String(message?.text || message?.content || '').trim();
    const metadata = message?.metadata ?? message?.meta;

    return Boolean(
        isConfirmedMessageId(message?.id)
        && text
        && !metadata?.isSystem
        && !NON_FORWARDABLE_CONTENT_PREFIXES.some((prefix) => text.startsWith(prefix))
    );
}

export function orderMessagesForForward(messages: any[]) {
    return [...messages].sort((left, right) =>
        String(left?.created_at || '').localeCompare(String(right?.created_at || ''))
    );
}
