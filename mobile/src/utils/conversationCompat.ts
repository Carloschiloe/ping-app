// V2: conversation_type ('group' | 'direct') es el campo canonico en el
// backend. El API actual de GET /conversations devuelve `isGroup` ya
// derivado (ver backend/src/utils/conversationCompat.ts:toLegacyIsGroup).
// Esta funcion es el unico punto del mobile que decide "es un grupo",
// preparada para leer conversation_type directamente si el API lo expone en
// el futuro, sin tener que tocar cada pantalla que hoy consume `isGroup`.
export function deriveIsGroup(input: { conversation_type?: string | null; isGroup?: boolean }): boolean {
    if (input.conversation_type != null) return input.conversation_type === 'group';
    return !!input.isGroup;
}

export function deriveIsDirect(input: { conversation_type?: string | null; isGroup?: boolean }): boolean {
    return !deriveIsGroup(input);
}
