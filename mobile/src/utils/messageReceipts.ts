type MessageReceiptLike = {
    sender_id?: string | null;
    status?: string | null;
    deleted_at?: string | null;
    metadata?: Record<string, any> | null;
    meta?: Record<string, any> | null;
    viewer_receipt?: {
        delivered_at?: string | null;
        read_at?: string | null;
    } | null;
};

function isReceiptCandidate(message: MessageReceiptLike, viewerUserId: string) {
    const metadata = message.metadata ?? message.meta;
    return message.sender_id !== viewerUserId
        && !metadata?.isSystem
        && !message.deleted_at;
}

export function needsDeliveryReceipt(message: MessageReceiptLike, viewerUserId: string) {
    if (!isReceiptCandidate(message, viewerUserId)) return false;
    if (message.viewer_receipt) return !message.viewer_receipt.delivered_at;
    return message.status === 'sent';
}

export function needsReadReceipt(message: MessageReceiptLike, viewerUserId: string) {
    if (!isReceiptCandidate(message, viewerUserId)) return false;
    if (message.viewer_receipt) return !message.viewer_receipt.read_at;
    return message.status !== 'read';
}
