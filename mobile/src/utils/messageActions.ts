const LOCAL_MESSAGE_PREFIXES = ['temp-', 'offline-'];
const MEDIA_CONTENT_PREFIXES = ['[imagen]', '[video]', '[audio]', '[document='];

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
    const lifecycleStatus = message?.attachment?.lifecycleStatus
        ?? message?.attachment?.lifecycle_status;
    const hasCanonicalAttachment = lifecycleStatus === 'attached'
        && Boolean(message?.attachment?.id);
    const hasContent = Boolean(text || hasCanonicalAttachment);

    return Boolean(
        isConfirmedMessageId(message?.id)
        && hasContent
        && !metadata?.isSystem
        && (!MEDIA_CONTENT_PREFIXES.some((prefix) => text.startsWith(prefix)) || hasCanonicalAttachment)
    );
}

export function orderMessagesForForward(messages: any[]) {
    return [...messages].sort((left, right) =>
        String(left?.created_at || '').localeCompare(String(right?.created_at || ''))
    );
}
