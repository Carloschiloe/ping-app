// Espejo de backend/src/utils/commitmentStatus.ts. Estados canonicos V2 (los
// unicos que el backend persiste): 'completed' YA NO es un estado, fue
// reemplazado por 'resolved' (asunto cerrado) + action_completed_at (accion
// realizada, ver components/GroupTaskCard.tsx para la distincion visual).
export type CanonicalCommitmentStatus =
    | 'proposed'
    | 'accepted'
    | 'counter_proposal'
    | 'rejected'
    | 'resolved'
    | 'cancelled';

const CANONICAL_STATUSES: readonly CanonicalCommitmentStatus[] = [
    'proposed', 'accepted', 'counter_proposal', 'rejected', 'resolved', 'cancelled',
];

// Alias legacy -> V2. SOLO para interpretar compatibilidad (ej. datos viejos
// en cache local); el backend V2 nunca devuelve estos valores en `status`.
// Tarea futura: retirar cuando ya no queden restos de cache/local storage V1.
const LEGACY_STATUS_READ_ALIASES: Record<string, CanonicalCommitmentStatus> = {
    pending: 'proposed',
    in_progress: 'accepted',
    postponed: 'counter_proposal',
    done: 'resolved',
    completed: 'resolved',
};

export function isCanonicalCommitmentStatus(status: unknown): status is CanonicalCommitmentStatus {
    return typeof status === 'string' && (CANONICAL_STATUSES as string[]).includes(status);
}

// A diferencia del backend, esta variante NUNCA lanza: la UI debe poder
// renderizar aunque llegue un dato inesperado (mejor mostrar "Propuesto" por
// defecto que crashear una pantalla). El backend es la barrera dura que
// impide persistir valores desconocidos; el mobile es solo un consumidor.
export function normalizeCommitmentStatus(status?: string | null): CanonicalCommitmentStatus {
    if (!status) return 'proposed';
    if (isCanonicalCommitmentStatus(status)) return status;
    if (LEGACY_STATUS_READ_ALIASES[status]) return LEGACY_STATUS_READ_ALIASES[status];
    return 'proposed';
}

export function isAgendaVisibleStatus(status?: string | null): boolean {
    const normalized = normalizeCommitmentStatus(status);
    return normalized === 'accepted' || normalized === 'cancelled';
}
