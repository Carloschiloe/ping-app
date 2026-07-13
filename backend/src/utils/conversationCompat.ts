// Alias temporales de compatibilidad entre el esquema V2 de `conversations`/
// `conversation_participants` y el shape que el mobile actual todavía
// consume. Ver supabase/migrations/README.md y el informe de la fase de
// adaptación de backend para el detalle de cada alias.
//
// Alias temporales:
//   - isGroup  <- conversation_type === 'group'  (mobile lee
//                 conversation.isGroup en ConversationsScreen.tsx, etc.)
//   - archived <- archived_at IS NOT NULL         (mobile lee
//                 conversation.archived como booleano)
//
// Retirar cuando mobile se adapte a V2 (próxima fase, fuera de alcance de
// esta tarea) y lea conversation_type/archived_at directamente.
export function toLegacyIsGroup(conversationType: string | null | undefined): boolean {
    return conversationType === 'group';
}

export function toLegacyArchived(archivedAt: string | null | undefined): boolean {
    return archivedAt !== null && archivedAt !== undefined;
}
