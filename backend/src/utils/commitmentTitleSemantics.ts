// A creation title must describe the activity, not repeat the object type
// requested by the user. This is shared by interpretation and planning so a
// provider placeholder cannot become executable merely by crossing a module
// boundary.
const GENERIC_COMMITMENT_TITLE = /^(?:(?:el|la|un|una|a|an|the)\s+)?(?:compromiso|compromisos|tarea|tareas|reuni[oó]n|reuniones|cita|citas|propuesta|propuestas|recordatorio|recordatorios|pendiente|pendientes|commitment|task|meeting|appointment|reminder)$/iu;

export function isGenericCommitmentTitleHint(value: string | null | undefined): boolean {
    const normalized = value
        ?.replace(/[.,;:!?]+\s*$/u, '')
        .trim();
    return !!normalized && GENERIC_COMMITMENT_TITLE.test(normalized);
}
