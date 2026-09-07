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
    | 'commitment_proposal'
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
    // M-1H — 'commitment' (tabla canónica) o 'commitment_proposal' (tabla
    // separada, aún sin confirmar). El mismo shape estructural se reutiliza
    // para ambas fuentes (mismo pipeline de síntesis/overdue), pero este
    // campo es la fuente de verdad de qué es REALMENTE cada item — nunca se
    // finge una proposal como commitment. Ver retrieval.service.ts
    // #retrieveCommitmentProposals.
    entityType: 'commitment' | 'commitment_proposal';
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

    // M-1H v5 — CANONICAL PROPOSAL PARTICIPATION MODEL. Presentes SÓLO
    // cuando entityType==='commitment_proposal' (undefined para un
    // commitment canónico) — ver utils/proposalParticipation.ts. El Core
    // (nunca el LLM) ya resuelve "¿quién falta por responder?" y "¿puede
    // este actor actuar?" antes de llegar a síntesis; el modelo sólo
    // fraseia estos hechos, nunca los infiere de status/due_at por su
    // cuenta (sección 15 del ticket).
    actorHasApproved?: boolean;
    actorCanRespond?: boolean;
    pendingResponderNamesSafe?: string[]; // nombres ya resueltos, nunca ids/uuids expuestos a síntesis
    // M-1H v6 (Gap B, secciones 9/11 del ticket) — ids reales, SÓLO para
    // filtrado determinístico del Core (agentContextBuilder.service.ts,
    // proposalFocus='pending_response_from_person'). Nunca se serializa al
    // modelo (ver agentResponseSynthesizer.service.ts#serializeContextForSynthesis,
    // que sólo copia pendingResponderNamesSafe) -- el LLM nunca decide ni ve
    // un id, sólo el resultado ya filtrado.
    pendingResponderIds?: string[];
    isFullyApproved?: boolean;
    // M-1H v5 — "la fecha propuesta ya pasó" (hecho informativo, nunca
    // "vencido" -- ver utils/overdueSemantics.ts#isProposalDatePassed).
    // Presente sólo para entityType==='commitment_proposal'.
    proposalDatePassed?: boolean;
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
    // M-1H v5 — instante "ahora" real del caller (ISO), propagado para que
    // retrieveCommitmentProposals pueda calcular proposalDatePassed sin
    // depender de un new Date() propio no determinista. Opcional: si se
    // omite (callers directos/tests), se usa el reloj real como fallback.
    now?: string;
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
    // M-1G.2 — hallazgo real de staging: sin esto, retrieveCommitments
    // siempre ordena por created_at DESC (más reciente primero). Un
    // commitment REALMENTE vencido pero creado hace tiempo (ej. "Entrenar",
    // vencido hace 36 días) podía quedar fuera del budget de 10 si el actor
    // tenía actividad más reciente sin relación, así que nunca llegaba al
    // contexto del Agent para que isOverdue pudiera siquiera evaluarlo. true
    // ordena por due_at ascendente (lo más vencido primero) en vez de por
    // creación — sólo se usa cuando la consulta es específicamente sobre
    // vencidos (ver agentContextBuilder.service.ts, Interpretation.wantsOverdueFocus).
    orderByOverdueFirst?: boolean;
    // M-1H FINAL CERTIFICATION (ticket "STAGING PUBLICATION", sección 1/2/6)
    // — hallazgo real durante el audit: KEYSET pagination por página fue
    // implementada primero y luego DESCARTADA tras una prueba empírica
    // directa contra Postgres real: `commitment_proposals.due_at` es
    // mutable en producción (respond_to_commitment_proposal con
    // decision='counter_propose' hace
    // `update commitment_proposals set due_at = ...`) -- si una fila
    // TODAVÍA no alcanzada por la paginación cambia su due_at a un valor
    // ANTERIOR al cursor ya consumido, esa fila queda permanentemente fuera
    // de las páginas restantes de ESA request (comprobado con un UPDATE
    // real entre dos fetches: la fila mutada desapareció de la página
    // siguiente). El keyset resuelve inserciones concurrentes y reordenamiento
    // por OFFSET, pero NO mutación del propio valor de orden de una fila
    // aún no vista -- ninguna paginación multi-request puede resolver eso
    // sin snapshot/transacción explícita.
    //
    // Solución real adoptada: UN solo fetch atómico (`rawOrder`, ver abajo)
    // hasta el safety cap, en vez de N fetches paginados -- una única
    // sentencia SQL ve una snapshot MVCC consistente de Postgres por
    // definición (garantía real de Postgres, no una suposición), inmune
    // TANTO a inserciones como a mutaciones concurrentes durante la misma
    // request. `agentContextBuilder.service.ts#fillProposalFocusMatches`
    // ya no pagina en absoluto -- pide hasta PROPOSAL_FOCUS_SAFETY_CAP filas
    // en una sola llamada y filtra/acumula en JS sobre ese array ya
    // completo y consistente.
    //
    // `rawOrder=true` le dice a retrieveCommitmentProposals que devuelva
    // filas en el orden canónico SQL (due_at/created_at + id tiebreaker)
    // hasta `limit`, SIN el post-proceso de rank+slice por relevancia
    // textual (ese post-proceso es para "mejores N por relevancia" con un
    // límite pequeño -- no aplica cuando el límite ES el safety cap y el
    // resultado se va a filtrar por proposalFocus en JS de todos modos).
    rawOrder?: boolean;
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
