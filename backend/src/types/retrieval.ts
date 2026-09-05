// M-1B — Structured Retrieval canónico. DTOs pequeños y explícitos: nunca se
// devuelven filas crudas de Supabase a un consumidor (Agent, Voice, Memory,
// Morning Routine). Cada tipo aquí es intencionalmente delgado — solo los
// campos que un consumidor de retrieval necesita, nunca el objeto completo de
// la tabla de origen.
//
// Ningún dato aquí se copia como fuente de verdad: todo campo tiene su origen
// exacto en una tabla canónica (ver M-1A, sección 7 "no duplicar fuente de
// verdad"). Retrieval solo proyecta y filtra, nunca posee.
import type { CanonicalCommitmentStatus } from '../utils/commitmentStatus';

export type RetrievalSourceType =
    | 'commitment'
    | 'commitment_event'
    | 'message'
    | 'transcription'
    | 'attachment'
    | 'person';

// Toda entidad devuelta por Retrieval carga su procedencia. Nunca existe un
// resultado "derivado" sin referencia — ver M-1A "Provenance".
export interface RetrievalProvenance {
    sourceType: RetrievalSourceType;
    sourceId: string;
    conversationId?: string | null;
    messageId?: string | null;
    attachmentId?: string | null;
    commitmentId?: string | null;
    timestamp?: string | null;
}

export interface RetrievalPerson {
    kind: 'user' | 'contact';
    id: string; // profiles.id o contacts.id según kind
    displayName: string;
    email?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
}

export interface PersonResolutionResult {
    resolved: RetrievalPerson | null;
    ambiguous: boolean;
    candidates: RetrievalPerson[];
}

export interface RetrievalCommitment {
    id: string;
    title: string;
    description: string | null;
    status: CanonicalCommitmentStatus;
    type: string;
    priority: string | null;
    dueAt: string | null;
    proposedDueAt: string | null;
    expectedResult: string | null;
    resolvedAt: string | null;
    resolutionResult: string | null;
    rejectionReason: string | null;
    ownerUserId: string;
    assignedToUserId: string | null;
    counterpartyContactId: string | null;
    conversationId: string | null;
    messageId: string | null;
    createdAt: string;
    provenance: RetrievalProvenance;
    // M-1C: sólo presente cuando la búsqueda usó texto (RetrieveContextInput.query).
    // Score explicable, no ML — ver docs/M-1C-FULL-TEXT-RETRIEVAL.md, "Ranking".
    textRank?: number;
}

export interface RetrievalCommitmentEvent {
    id: string;
    commitmentId: string;
    actorUserId: string | null;
    eventType: string;
    previousStatus: string | null;
    newStatus: string | null;
    createdAt: string;
    provenance: RetrievalProvenance;
}

export interface RetrievalMessage {
    id: string;
    conversationId: string;
    senderId: string | null;
    content: string | null;
    isSystem: boolean;
    createdAt: string;
    provenance: RetrievalProvenance;
    // M-1C: sólo presente cuando la búsqueda usó texto.
    textRank?: number;
}

export interface RetrievalTranscript {
    id: string;
    attachmentId: string;
    messageId: string | null;
    conversationId: string | null;
    transcriptText: string;
    languageDetected: string | null;
    completedAt: string | null;
    provenance: RetrievalProvenance;
    // M-1C: sólo presente cuando la búsqueda usó texto.
    textRank?: number;
}

export interface RetrievalAttachment {
    id: string;
    messageId: string | null;
    conversationId: string;
    kind: 'image' | 'video' | 'audio' | 'document';
    mimeType: string;
    originalFilename: string;
    lifecycleStatus: string;
    createdAt: string | null;
    provenance: RetrievalProvenance;
}

export interface RetrievalTimeRange {
    from?: string; // ISO timestamp
    to?: string;   // ISO timestamp
}

export interface RetrievalMessageWindow {
    aroundMessageId: string;
    before?: number;
    after?: number;
}

export interface RetrievalLimits {
    commitments?: number;
    events?: number;
    messages?: number;
    transcriptions?: number;
    attachments?: number;
}

// Contrato de entrada. actorUserId SIEMPRE se resuelve del actor autenticado
// en la capa que llama a este servicio (req.user.id) — nunca se acepta desde
// un cliente sin pasar por auth. personId/contactId deben llegar YA
// resueltos (ver resolvePerson) — retrieveContext no interpreta lenguaje
// natural.
export interface RetrieveContextInput {
    actorUserId: string;
    // M-1C: búsqueda full-text canónica (Postgres tsvector/GIN, config
    // 'spanish' — ver docs/M-1C-FULL-TEXT-RETRIEVAL.md). Se combina siempre
    // con AND sobre el scope estructurado (conversationId/personId/status/
    // timeRange) — nunca lo reemplaza ni lo amplía. No es NLP: es texto plano
    // que Postgres tokeniza. Este es el ÚNICO campo de texto libre — no se
    // introduce un "textQuery" separado para mantener un solo nombre coherente
    // (ver doc, sección "API de retrieval / naming").
    query?: string;
    conversationId?: string;
    personId?: string;   // profiles.id ya resuelto
    contactId?: string;  // contacts.id ya resuelto
    timeRange?: RetrievalTimeRange;
    types?: RetrievalSourceType[];
    statuses?: CanonicalCommitmentStatus[];
    limits?: RetrievalLimits;
    messageWindow?: RetrievalMessageWindow;
    attachmentKinds?: ('image' | 'video' | 'audio' | 'document')[];
}

export interface RetrievalScope {
    actorUserId: string;
    conversationId: string | null;
    personId: string | null;
    contactId: string | null;
}

export interface RetrievalResult {
    query: string | null;
    scope: RetrievalScope;
    people: RetrievalPerson[];
    commitments: RetrievalCommitment[];
    events: RetrievalCommitmentEvent[];
    messages: RetrievalMessage[];
    transcriptions: RetrievalTranscript[];
    attachments: RetrievalAttachment[];
    provenance: RetrievalProvenance[];
}
