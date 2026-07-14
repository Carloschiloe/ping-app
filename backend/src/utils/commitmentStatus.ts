// Estados canonicos V2. Estos son los UNICOS valores que el backend puede
// persistir en commitments.status (coincide exactamente con el CHECK
// constraint commitments_status_check del baseline V2). 'completed' ya NO es
// un estado: fue reemplazado por 'resolved' (asunto cerrado) y
// action_completed_at (accion realizada, columna aparte, ver
// commitmentTransitions.ts).
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

// Alias legacy -> V2. Existen SOLO para interpretar datos/inputs legacy en
// una frontera de compatibilidad (ej. un query param ?status=pending enviado
// por un cliente mobile todavia no adaptado). Nunca deben usarse para decidir
// que escribir en la base V2: el valor persistido siempre debe ser uno de
// CANONICAL_STATUSES.
const LEGACY_STATUS_READ_ALIASES: Record<string, CanonicalCommitmentStatus> = {
    pending: 'proposed',
    in_progress: 'accepted',
    postponed: 'counter_proposal',
    done: 'resolved',
    completed: 'resolved',
};

export class UnknownCommitmentStatusError extends Error {
    public readonly rawStatus: unknown;

    constructor(rawStatus: unknown) {
        super(`Unknown commitment status: ${JSON.stringify(rawStatus)}`);
        this.name = 'UnknownCommitmentStatusError';
        this.rawStatus = rawStatus;
    }
}

export function isCanonicalCommitmentStatus(status: unknown): status is CanonicalCommitmentStatus {
    return typeof status === 'string' && (CANONICAL_STATUSES as string[]).includes(status);
}

// Normaliza un status (canonico V2 o alias legacy de lectura) a un
// CanonicalCommitmentStatus. null/undefined/'' se interpreta como 'proposed'
// (coincide con el default de la columna y con la logica de creacion). Un
// valor que no sea ninguno de los anteriores NUNCA se asume 'proposed' en
// silencio: se lanza UnknownCommitmentStatusError para forzar un manejo
// explicito en el llamador (nunca debe llegar a persistirse en la BD).
export function normalizeCommitmentStatus(status: unknown): CanonicalCommitmentStatus {
    if (status === null || status === undefined || status === '') return 'proposed';
    if (isCanonicalCommitmentStatus(status)) return status;
    if (typeof status === 'string' && LEGACY_STATUS_READ_ALIASES[status]) {
        return LEGACY_STATUS_READ_ALIASES[status];
    }
    throw new UnknownCommitmentStatusError(status);
}

// Variante que nunca lanza: para contextos defensivos de solo-lectura (ej.
// mostrar datos potencialmente corruptos sin tumbar el request). Devuelve
// null en vez de adivinar un estado.
export function tryNormalizeCommitmentStatus(status: unknown): CanonicalCommitmentStatus | null {
    try {
        return normalizeCommitmentStatus(status);
    } catch {
        return null;
    }
}

export function isPendingResponseStatus(status: unknown): boolean {
    const normalized = tryNormalizeCommitmentStatus(status);
    return normalized === 'proposed' || normalized === 'counter_proposal';
}

export function isOpenCommitmentStatus(status: unknown): boolean {
    const normalized = tryNormalizeCommitmentStatus(status);
    return normalized === 'proposed' || normalized === 'accepted' || normalized === 'counter_proposal';
}

export function isClosedCommitmentStatus(status: unknown): boolean {
    const normalized = tryNormalizeCommitmentStatus(status);
    return normalized === 'resolved' || normalized === 'cancelled' || normalized === 'rejected';
}
