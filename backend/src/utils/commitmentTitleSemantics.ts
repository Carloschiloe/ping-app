// A creation title must describe the activity, not repeat the object type
// requested by the user. This is shared by interpretation and planning so a
// provider placeholder cannot become executable merely by crossing a module
// boundary.
// Indefinite placeholders ("algo", "una cosa") name no activity either: the
// title is still missing and must be asked for.
const INDEFINITE_TITLE_PLACEHOLDER = /^(?:algo|alguna\s+cosa|una\s+cosa|cosas|something|anything)$/iu;
const GENERIC_COMMITMENT_TITLE = /^(?:(?:el|la|un|una|a|an|the)\s+)?(?:compromiso|compromisos|tarea|tareas|reuni[oó]n|reuniones|cita|citas|propuesta|propuestas|recordatorio|recordatorios|pendiente|pendientes|commitment|task|meeting|appointment|reminder)$/iu;

export function isGenericCommitmentTitleHint(value: string | null | undefined): boolean {
    const normalized = value
        ?.replace(/[.,;:!?]+\s*$/u, '')
        .trim();
    return !!normalized && (GENERIC_COMMITMENT_TITLE.test(normalized) || INDEFINITE_TITLE_PLACEHOLDER.test(normalized));
}
