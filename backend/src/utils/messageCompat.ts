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
export function toLegacyMessageShape<T extends Record<string, any> | null | undefined>(row: T): T {
    if (!row) return row;
    return {
        ...row,
        text: row.content ?? row.text ?? null,
        meta: row.metadata ?? row.meta ?? {},
    };
}

export function toLegacyMessageListShape<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
    return (rows || []).map((row) => toLegacyMessageShape(row) as T);
}
