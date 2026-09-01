// Capa temporal de compatibilidad entre el esquema V2 de `messages`
// (content/metadata) y el shape que el mobile actual todavía consume
// (text/meta). Ver supabase/migrations/README.md y el informe de la fase de
// adaptación de backend para el detalle de cada alias.
//
// Alias temporales:
//   - text     <- content   (mobile lee message.text en ChatScreen.tsx,
//                             MessageItem.tsx, ConversationsScreen.tsx, etc.)
//   - meta     <- metadata  (mobile lee message.meta?.isSystem,
//                             message.meta?.suggestedTask, etc.)
//
// Retirar cuando mobile se adapte a V2 (próxima fase, fuera de alcance de
// esta tarea) y deje de leer `text`/`meta` directamente.
function receiptProjection(row: Record<string, any>, viewerUserId?: string) {
    if (!Array.isArray(row.message_receipts)) return {};

    const receipts = row.message_receipts;
    const delivered = receipts.filter((receipt: any) => Boolean(receipt.delivered_at));
    const read = receipts.filter((receipt: any) => Boolean(receipt.read_at));
    const recipientCount = receipts.length;
    const status = recipientCount > 0 && read.length === recipientCount
        ? 'read'
        : recipientCount > 0 && delivered.length === recipientCount
            ? 'delivered'
            : 'sent';

    return {
        status,
        receipt_summary: {
            recipient_count: recipientCount,
            delivered_count: delivered.length,
            read_count: read.length,
            delivered_user_ids: delivered.map((receipt: any) => receipt.user_id),
            read_user_ids: read.map((receipt: any) => receipt.user_id),
            delivered_to_all: recipientCount > 0 && delivered.length === recipientCount,
            read_by_all: recipientCount > 0 && read.length === recipientCount,
            not_applicable: recipientCount === 0,
        },
        viewer_receipt: viewerUserId
            ? receipts.find((receipt: any) => receipt.user_id === viewerUserId) || null
            : undefined,
    };
}

export function toLegacyMessageShape<T extends Record<string, any> | null | undefined>(row: T, viewerUserId?: string): T {
    if (!row) return row;
    const attachmentRow = Array.isArray(row.attachments)
        ? row.attachments[0] || null
        : row.attachments || row.attachment || null;
    const attachment = attachmentRow ? {
        id: attachmentRow.id,
        kind: attachmentRow.kind,
        mimeType: attachmentRow.mime_type ?? attachmentRow.mimeType,
        sizeBytes: attachmentRow.size_bytes ?? attachmentRow.sizeBytes,
        durationMs: attachmentRow.duration_ms ?? attachmentRow.durationMs,
        originalFilename: attachmentRow.original_filename ?? attachmentRow.originalFilename,
        lifecycleStatus: attachmentRow.lifecycle_status ?? attachmentRow.lifecycleStatus,
        createdAt: attachmentRow.created_at ?? attachmentRow.createdAt,
    } : null;
    const replyTo = row.reply_to?.deleted_at
        ? { ...row.reply_to, content: null, text: 'Mensaje eliminado' }
        : row.reply_to;
    if (row.deleted_at) {
        return {
            ...row,
            ...receiptProjection(row, viewerUserId),
            content: null,
            text: 'Mensaje eliminado',
            metadata: { tombstone: true },
            meta: { tombstone: true },
            media_url: null,
            media_bucket: null,
            media_object_path: null,
            media_metadata: {},
            attachments: undefined,
            attachment: attachment ? {
                id: attachment.id,
                lifecycleStatus: 'tombstoned',
            } : null,
            message_reactions: [],
            ...(replyTo ? { reply_to: replyTo } : {}),
        };
    }
    return {
        ...row,
        ...receiptProjection(row, viewerUserId),
        attachments: undefined,
        attachment,
        text: row.content ?? row.text ?? null,
        meta: row.metadata ?? row.meta ?? {},
        ...(replyTo ? { reply_to: replyTo } : {}),
    };
}

export function toLegacyMessageListShape<T extends Record<string, any>>(rows: T[] | null | undefined, viewerUserId?: string): T[] {
    return (rows || []).map((row) => toLegacyMessageShape(row, viewerUserId) as T);
}
