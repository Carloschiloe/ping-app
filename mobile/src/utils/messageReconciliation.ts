type MessageLike = {
    id?: string;
    client_message_id?: string | null;
    sender_id?: string | null;
    text?: string | null;
    content?: string | null;
};

function messageText(message: MessageLike): string {
    return message.content ?? message.text ?? '';
}

export function isOptimisticMessage(message: MessageLike): boolean {
    return typeof message.id === 'string' && message.id.startsWith('temp-');
}

export function matchesConfirmedMessage(
    candidate: MessageLike,
    confirmed: MessageLike
): boolean {
    if (candidate.id && confirmed.id && candidate.id === confirmed.id) return true;

    if (
        candidate.client_message_id
        && confirmed.client_message_id
        && candidate.client_message_id === confirmed.client_message_id
    ) {
        return true;
    }

    // Compatibilidad temporal con mensajes optimistas creados antes de que el
    // cliente propagara client_message_id. Nunca se usa para dos mensajes ya
    // confirmados.
    return isOptimisticMessage(candidate)
        && candidate.sender_id === confirmed.sender_id
        && messageText(candidate) === messageText(confirmed);
}

export function reconcileConfirmedMessage<T extends MessageLike>(
    messages: T[],
    confirmed: T
): T[] {
    let inserted = false;
    const reconciled: T[] = [];

    for (const message of messages) {
        if (matchesConfirmedMessage(message, confirmed)) {
            if (!inserted) {
                reconciled.push({ ...message, ...confirmed });
                inserted = true;
            }
            continue;
        }
        reconciled.push(message);
    }

    return inserted ? reconciled : [confirmed, ...reconciled];
}

export function hasConfirmedClientMessage(
    messages: MessageLike[],
    clientMessageId?: string | null
): boolean {
    if (!clientMessageId) return false;
    return messages.some((message) =>
        !isOptimisticMessage(message)
        && message.client_message_id === clientMessageId
    );
}
