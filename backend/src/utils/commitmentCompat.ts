// Capa temporal de compatibilidad entre el esquema V2 de `commitments`
// (conversation_id, sin is_group_task, sin group_conversation_id) y el shape
// que el mobile actual todavia lee/escribe. Ver
// supabase/migrations/20260712000000_baseline_v2.sql y el informe de esta
// fase para el detalle de cada alias. Retirar cuando mobile se adapte a V2
// (fase futura, fuera de alcance de esta tarea).
//
// IMPORTANTE (documentado, no solucionable desde el backend): el mobile
// actual (mobile/src/hooks/commitments.ts) suscribe realtime de Supabase con
// un filtro `group_conversation_id=eq.<id>`. Los filtros de realtime de
// Supabase se evaluan contra la columna real de Postgres, NO contra la
// respuesta JSON de esta API — ningun alias de este archivo puede arreglar
// esa suscripcion, porque la columna real en V2 es `conversation_id`. Esa
// suscripcion dejara de recibir actualizaciones en vivo hasta que mobile se
// adapte. Ver seccion de riesgos del informe final.

// Alias de RESPUESTA (lectura): nunca escribir estos campos de vuelta a la
// base de datos, se derivan siempre de las columnas reales.
export function toLegacyCommitmentShape<T extends Record<string, any> | null | undefined>(row: T): T {
    if (!row) return row;
    return {
        ...row,
        // group_conversation_id <- conversation_id (mobile lee esto en
        // GroupTaskCard.tsx, y lo reenvia al crear/editar).
        group_conversation_id: row.conversation_id ?? null,
        // is_group_task: derivado (V2 nunca guarda esta columna; era
        // huerfano incluso en V1 segun la auditoria). true cuando hay
        // conversacion pero no hay un asignado especifico.
        is_group_task: !!row.conversation_id && !row.assigned_to_user_id,
        // completed: alias booleano temporal de `resolved`, NO reemplaza
        // status (status sigue devolviendo el valor real V2). No hay
        // consumidor confirmado en mobile hoy, pero el mandato de esta fase
        // pide exponerlo explicitamente para no ocultar el mapeo completed->resolved.
        completed: row.resolved_at !== null && row.resolved_at !== undefined,
        // rejection_reason y proposed_due_at ya son columnas reales de
        // primera clase en V2: no requieren alias, se devuelven tal cual.
    };
}

export function toLegacyCommitmentListShape<T extends Record<string, any>>(rows: T[] | null | undefined): T[] {
    return (rows || []).map((row) => toLegacyCommitmentShape(row) as T);
}

// Alias de ENTRADA (escritura): el mobile actual todavia envia
// group_conversation_id/groupConversationId al crear un compromiso
// (ChatScreen.tsx), y camelCase (assignedToUserId/dueAt) desde el flujo de
// sugerencias de IA. Estos helpers SOLO leen el input; nunca escriben un
// campo legacy a la base de datos.
export function readLegacyConversationId(data: Record<string, any>): string | null {
    return data.conversation_id || data.group_conversation_id || data.groupConversationId || null;
}

export function readLegacyAssignedToUserId(data: Record<string, any>): string | null {
    return data.assigned_to_user_id || data.assignedToUserId || null;
}

export function readLegacyDueAt(data: Record<string, any>): string | null {
    return data.due_at || data.dueAt || null;
}
