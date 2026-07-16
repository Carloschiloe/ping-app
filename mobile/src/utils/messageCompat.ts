// V2: content/metadata son las columnas reales de `messages`. text/meta son
// el alias temporal que todavia expone el backend (ver
// backend/src/utils/messageCompat.ts) para no romper clientes viejos.
// Centralizar la lectura aqui evita que cada pantalla reimplemente el mismo
// fallback y facilita retirarlo cuando el backend deje de enviarlo.
export function resolveMessageContent(message: any): string {
    return message?.content ?? message?.text ?? '';
}

export function resolveMessageMetadata(message: any): Record<string, any> {
    return message?.metadata ?? message?.meta ?? {};
}

export function isMessageFromUser(message: any, userId?: string | null): boolean {
    if (!userId) return false;
    return message?.sender_id === userId;
}
