// M-1B — Structured Retrieval canónico.
//
// Responsabilidad única: recuperar contexto útil desde datos ESTRUCTURADOS
// que ya existen (commitments, commitment_events, messages, attachments,
// audio_transcriptions, profiles, contacts). No copia esos datos a ninguna
// tabla nueva, no usa embeddings, no llama a ningún LLM.
//
// Consumidores previstos (ninguno conectado todavía en este slice): un
// futuro Ping Agent, Voice, Morning Routine, Memory derivada, u otra
// interfaz interna. Este archivo es servicio puro de aplicación — no es un
// controller, no expone ruta HTTP.
//
// Regla no negociable: AUTHORIZATION FIRST. Nunca se consulta un recurso
// antes de confirmar que el actor puede verlo. El orden es siempre:
//   actor → conversaciones permitidas → datos permitidos → retrieval.
// Nunca: "traer todo y filtrar después".
//
// M-1B.1 — safe by default: toda función EXPORTADA de este archivo se
// autoriza a sí misma; ningún consumidor presente o futuro necesita recordar
// "autorizar antes de llamar". Las funciones que asumen autorización previa
// (sufijo "Internal") nunca se exportan — existen sólo para que
// retrieveContext, que ya autorizó una vez, no repita el chequeo. Ver
// docs/M-1B-STRUCTURED-RETRIEVAL-CONTRACT.md, sección "Authorization".
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationParticipant, getSharedProfileIds } from '../utils/authz';
import { getParticipantProposalIds, buildCommitmentVisibilityFilter } from '../utils/commitmentVisibility';
import { normalizePhoneInput } from '../utils/profileValidation';
import { isOpenCommitmentStatus, type CanonicalCommitmentStatus } from '../utils/commitmentStatus';
import type {
    RetrievalAttachment,
    RetrievalCommitment,
    RetrievalCommitmentEvent,
    RetrievalMessage,
    RetrievalMessageWindow,
    RetrievalPerson,
    RetrievalProvenance,
    RetrievalResult,
    RetrievalSourceType,
    RetrievalTimeRange,
    RetrievalTranscript,
    RetrieveContextInput,
    PersonResolutionResult,
} from '../types/retrieval';

// ─── Límites por defecto (sección 13) ───────────────────────────────────────
// Nunca se ejecuta una consulta sin límite. Un caller puede pedir menos o
// más (hasta el tope), nunca "todo".
const DEFAULT_LIMITS = {
    commitments: 20,
    events: 20,
    messages: 30,
    transcriptions: 10,
    attachments: 10,
} as const;

const MAX_LIMIT_MULTIPLIER = 5; // tope duro: nunca más de 5x el default, sin importar lo que pida el caller.

export function clampLimit(requested: number | undefined, fallback: number): number {
    const n = requested ?? fallback;
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.floor(n), fallback * MAX_LIMIT_MULTIPLIER);
}

const ALL_TYPES: RetrievalSourceType[] = [
    'person', 'commitment', 'commitment_event', 'message', 'transcription', 'attachment',
];

function typeSet(types?: RetrievalSourceType[]): Set<RetrievalSourceType> {
    return new Set(types && types.length > 0 ? types : ALL_TYPES);
}

// ─── Dedupe (sección 14) ────────────────────────────────────────────────────
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        result.push(row);
    }
    return result;
}

export function dedupeProvenance(items: RetrievalProvenance[]): RetrievalProvenance[] {
    const seen = new Set<string>();
    const result: RetrievalProvenance[] = [];
    for (const item of items) {
        const key = `${item.sourceType}:${item.sourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

// ─── Personas (sección 7) ───────────────────────────────────────────────────
// Estrategia mínima, sin LLM: id directo primero; si no, coincidencia EXACTA
// normalizada de nombre/email/teléfono, acotada al universo que el actor ya
// puede ver. Ambigüedad nunca se resuelve arbitrariamente — se devuelve
// `ambiguous: true` con los candidatos, y el llamador decide.
function normalizeNameForMatch(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function contactToPerson(row: { id: string; display_name: string; phone: string | null; email: string | null }): RetrievalPerson {
    return { kind: 'contact', id: row.id, displayName: row.display_name, phone: row.phone, email: row.email };
}

function profileToPerson(row: { id: string; full_name: string | null; email: string; avatar_url: string | null }): RetrievalPerson {
    return { kind: 'user', id: row.id, displayName: row.full_name || row.email, email: row.email, avatarUrl: row.avatar_url };
}

export interface ResolvePersonInput {
    userId?: string;
    contactId?: string;
    name?: string;
    email?: string;
    phone?: string;
    // Si se provee, la resolución por nombre/email/teléfono prioriza a los
    // participantes de esta conversación antes de ampliar al resto del
    // universo autorizado del actor.
    conversationId?: string;
}

export async function resolvePerson(actorUserId: string, input: ResolvePersonInput): Promise<PersonResolutionResult> {
    // 1. IDs directos: se confía en el ID, pero SIEMPRE se autoriza antes de
    // devolver nada (nunca se expone un perfil/contacto fuera de alcance).
    if (input.userId) {
        if (input.userId === actorUserId) {
            const { data } = await supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').eq('id', input.userId).maybeSingle();
            return data ? { resolved: profileToPerson(data), ambiguous: false, candidates: [] } : { resolved: null, ambiguous: false, candidates: [] };
        }
        const allowed = new Set(await getSharedProfileIds(actorUserId));
        if (!allowed.has(input.userId)) return { resolved: null, ambiguous: false, candidates: [] };
        const { data } = await supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').eq('id', input.userId).maybeSingle();
        return data ? { resolved: profileToPerson(data), ambiguous: false, candidates: [] } : { resolved: null, ambiguous: false, candidates: [] };
    }

    if (input.contactId) {
        const { data } = await supabaseAdmin
            .from('contacts')
            .select('id, owner_user_id, display_name, phone, email')
            .eq('id', input.contactId)
            .maybeSingle();
        if (!data || data.owner_user_id !== actorUserId) return { resolved: null, ambiguous: false, candidates: [] };
        return { resolved: contactToPerson(data), ambiguous: false, candidates: [] };
    }

    // 2. Resolución por texto: nombre / email / teléfono exactos normalizados.
    if (!input.name && !input.email && !input.phone) {
        return { resolved: null, ambiguous: false, candidates: [] };
    }

    const conversationParticipantIds = input.conversationId
        ? await getConversationParticipantProfileIds(actorUserId, input.conversationId)
        : null;
    const widerAllowedIds = new Set(await getSharedProfileIds(actorUserId));

    const candidates: RetrievalPerson[] = [];

    if (input.email) {
        const email = input.email.trim().toLowerCase();
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').eq('email', email);
        for (const p of profiles || []) {
            if (p.id === actorUserId || widerAllowedIds.has(p.id)) candidates.push(profileToPerson(p));
        }
        const { data: contacts } = await supabaseAdmin.from('contacts').select('id, display_name, phone, email').eq('owner_user_id', actorUserId).eq('email', email);
        for (const c of contacts || []) candidates.push(contactToPerson(c));
    } else if (input.phone) {
        let normalizedPhone: string | null;
        try {
            normalizedPhone = normalizePhoneInput(input.phone);
        } catch {
            normalizedPhone = null; // formato invalido -> sin candidatos, nunca un 400 por texto libre malformado
        }
        if (normalizedPhone) {
            const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').eq('phone', normalizedPhone);
            for (const p of profiles || []) {
                if (p.id === actorUserId || widerAllowedIds.has(p.id)) candidates.push(profileToPerson(p));
            }
            const { data: contacts } = await supabaseAdmin.from('contacts').select('id, display_name, phone, email').eq('owner_user_id', actorUserId).eq('phone', normalizedPhone);
            for (const c of contacts || []) candidates.push(contactToPerson(c));
        }
    } else if (input.name) {
        const normalizedName = normalizeNameForMatch(input.name);

        // Contactos: siempre son del propio actor (libreta personal).
        const { data: contacts } = await supabaseAdmin.from('contacts').select('id, display_name, phone, email').eq('owner_user_id', actorUserId);
        for (const c of contacts || []) {
            if (normalizeNameForMatch(c.display_name) === normalizedName) candidates.push(contactToPerson(c));
        }

        // Perfiles: primero acotado a la conversación (si se dio); solo se
        // amplía al universo compartido completo del actor si ahí no hubo
        // ningún match (no simplemente "si conversationId no vino").
        const matchProfileIds = async (ids: string[]): Promise<RetrievalPerson[]> => {
            if (ids.length === 0) return [];
            const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').in('id', ids);
            return (profiles || [])
                .filter((p) => p.full_name && normalizeNameForMatch(p.full_name) === normalizedName)
                .map(profileToPerson);
        };

        let profileMatches: RetrievalPerson[] = [];
        if (conversationParticipantIds) {
            profileMatches = await matchProfileIds(conversationParticipantIds);
        }
        if (profileMatches.length === 0) {
            profileMatches = await matchProfileIds(Array.from(widerAllowedIds));
        }
        candidates.push(...profileMatches);
    }

    const unique = dedupeById(candidates);
    if (unique.length === 0) return { resolved: null, ambiguous: false, candidates: [] };
    if (unique.length === 1) return { resolved: unique[0], ambiguous: false, candidates: unique };
    return { resolved: null, ambiguous: true, candidates: unique }; // nunca se elige arbitrariamente
}

async function getConversationParticipantProfileIds(actorUserId: string, conversationId: string): Promise<string[]> {
    await assertConversationParticipant(actorUserId, conversationId); // Authorization first.
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId);
    if (error) throw new AppError(error.message, 500);
    return (data || []).map((row) => row.user_id).filter((id) => id !== actorUserId);
}

// ─── Commitments (sección 8) ────────────────────────────────────────────────
const COMMITMENT_SELECT = `
    id, title, description, status, type, priority, due_at, proposed_due_at,
    expected_result, resolved_at, resolution_result, rejection_reason,
    owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, message_id,
    created_at
`;

function toRetrievalCommitment(row: any): RetrievalCommitment {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        type: row.type,
        priority: row.priority,
        dueAt: row.due_at,
        proposedDueAt: row.proposed_due_at,
        expectedResult: row.expected_result,
        resolvedAt: row.resolved_at,
        resolutionResult: row.resolution_result,
        rejectionReason: row.rejection_reason,
        ownerUserId: row.owner_user_id,
        assignedToUserId: row.assigned_to_user_id,
        counterpartyContactId: row.counterparty_contact_id,
        conversationId: row.conversation_id,
        messageId: row.message_id,
        createdAt: row.created_at,
        provenance: {
            sourceType: 'commitment',
            sourceId: row.id,
            conversationId: row.conversation_id,
            messageId: row.message_id,
            commitmentId: row.id,
            timestamp: row.created_at,
        },
    };
}

// PÚBLICA, segura por defecto (auditada en M-1B.1): a diferencia de las
// demás funciones de este archivo, esta NO necesita un assertConversationParticipant
// explícito para ser segura. buildCommitmentVisibilityFilter se aplica con
// AND a cualquier conversationId/personId/contactId recibido, así que un
// conversationId ajeno simplemente no puede devolver filas que el actor no
// sea ya owner/assignee/proposal-participant de — y agregar un assert
// rompería el caso legítimo de un actor que ve un commitment propio de una
// conversación de la que ya no es miembro. Un conversationId ajeno sin
// relación propia produce lista vacía, nunca un throw ni una fuga.
export async function retrieveCommitments(input: RetrieveContextInput, limit: number): Promise<RetrievalCommitment[]> {
    // Authorization: la MISMA visibilidad canónica que ya usa /search — nunca
    // se reinventa. Se aplica siempre, incluso cuando se filtra además por
    // conversación o persona (AND, no OR): un conversationId/personId nunca
    // amplía lo que el actor puede ver, solo lo acota más.
    const participantProposalIds = await getParticipantProposalIds(input.actorUserId);
    const visibilityFilter = buildCommitmentVisibilityFilter(input.actorUserId, participantProposalIds);

    let query = supabaseAdmin
        .from('commitments')
        .select(COMMITMENT_SELECT)
        .or(visibilityFilter)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (input.conversationId) query = query.eq('conversation_id', input.conversationId);
    if (input.personId) query = query.or(`assigned_to_user_id.eq.${input.personId},owner_user_id.eq.${input.personId}`);
    if (input.contactId) query = query.eq('counterparty_contact_id', input.contactId);
    if (input.statuses && input.statuses.length > 0) query = query.in('status', input.statuses);
    if (input.timeRange?.from) query = query.gte('due_at', input.timeRange.from);
    if (input.timeRange?.to) query = query.lte('due_at', input.timeRange.to);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    return dedupeById((data || []).map(toRetrievalCommitment));
}

// ─── Ranking (sección 16) ────────────────────────────────────────────────────
// Determinista, explicable, sin ML. Orden de peso: scope de conversación
// exacto > match de persona exacto > estado activo > recencia.
export function rankCommitments(commitments: RetrievalCommitment[], input: RetrieveContextInput): RetrievalCommitment[] {
    const now = Date.now();
    const scored = commitments.map((c) => {
        let score = 0;
        if (input.conversationId && c.conversationId === input.conversationId) score += 100;
        if (input.personId && (c.assignedToUserId === input.personId || c.ownerUserId === input.personId)) score += 50;
        if (input.contactId && c.counterpartyContactId === input.contactId) score += 50;
        if (isOpenCommitmentStatus(c.status)) score += 25;
        const ageDays = (now - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 10 - ageDays); // decae a 0 despues de ~10 dias, nunca negativo
        return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.c);
}

// ─── Commitment events (sección 9) ──────────────────────────────────────────
function toRetrievalEvent(row: any): RetrievalCommitmentEvent {
    return {
        id: row.id,
        commitmentId: row.commitment_id,
        actorUserId: row.actor_user_id,
        eventType: row.event_type,
        previousStatus: row.previous_status,
        newStatus: row.new_status,
        createdAt: row.created_at,
        provenance: {
            sourceType: 'commitment_event',
            sourceId: row.id,
            commitmentId: row.commitment_id,
            timestamp: row.created_at,
        },
    };
}

// INTERNA, no exportada: asume que commitmentIds ya fue autorizado por el
// caller (retrieveContext le pasa IDs que ya salieron de retrieveCommitments,
// que a su vez ya aplicó buildCommitmentVisibilityFilter). Nunca debe
// exponerse directamente — no tiene forma de saber si sus IDs son legítimos.
async function retrieveCommitmentEventsInternal(commitmentIds: string[], limit: number): Promise<RetrievalCommitmentEvent[]> {
    if (commitmentIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
        .from('commitment_events')
        .select('id, commitment_id, actor_user_id, event_type, previous_status, new_status, created_at')
        .in('commitment_id', commitmentIds)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new AppError(error.message, 500);
    return dedupeById((data || []).map(toRetrievalEvent));
}

// PÚBLICA, segura por defecto (M-1B.1): revalida qué de los commitmentIds
// recibidos el actor puede realmente ver — la MISMA visibilidad canónica que
// retrieveCommitments, nunca confía en que el caller ya los filtró. Un
// commitmentId ajeno simplemente no aparece en el resultado (no es un error:
// mismo estilo "vacío seguro" que retrieveCommitments, consistente con esa
// función, ya que ambas comparten la misma fuente de verdad de visibilidad).
export async function retrieveCommitmentEvents(actorUserId: string, commitmentIds: string[], limit: number): Promise<RetrievalCommitmentEvent[]> {
    if (commitmentIds.length === 0) return [];
    const participantProposalIds = await getParticipantProposalIds(actorUserId);
    const visibilityFilter = buildCommitmentVisibilityFilter(actorUserId, participantProposalIds);
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select('id')
        .in('id', commitmentIds)
        .or(visibilityFilter);
    if (error) throw new AppError(error.message, 500);
    const authorizedIds = (data || []).map((row) => row.id);
    return retrieveCommitmentEventsInternal(authorizedIds, limit);
}

// ─── Messages (sección 10) ───────────────────────────────────────────────────
const MESSAGE_SELECT = 'id, conversation_id, sender_id, content, metadata, created_at, deleted_at';

function toRetrievalMessage(row: any): RetrievalMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        content: row.content,
        isSystem: Boolean(row.metadata?.isSystem),
        createdAt: row.created_at,
        provenance: {
            sourceType: 'message',
            sourceId: row.id,
            conversationId: row.conversation_id,
            messageId: row.id,
            timestamp: row.created_at,
        },
    };
}

async function retrieveRecentMessages(conversationId: string, limit: number, timeRange?: RetrievalTimeRange): Promise<RetrievalMessage[]> {
    let query = supabaseAdmin
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (timeRange?.from) query = query.gte('created_at', timeRange.from);
    if (timeRange?.to) query = query.lte('created_at', timeRange.to);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    return dedupeById((data || []).reverse().map(toRetrievalMessage)); // orden cronológico ascendente, más legible
}

// Ventana alrededor de un mensaje: N anteriores + el propio + N posteriores.
// Usado para "mensajes alrededor de source_message_id" y, por el llamador,
// para "mensajes asociados a commitment.messageId" (pasando ese mismo id).
async function retrieveMessageWindow(actorUserId: string, window: RetrievalMessageWindow): Promise<RetrievalMessage[]> {
    const { data: source, error } = await supabaseAdmin
        .from('messages')
        .select('id, conversation_id, created_at')
        .eq('id', window.aroundMessageId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!source) return [];

    // Authorization first: se confirma membership ANTES de traer nada más de
    // esta conversación, incluso el propio mensaje source.
    await assertConversationParticipant(actorUserId, source.conversation_id);

    const before = clampLimit(window.before, 5);
    const after = clampLimit(window.after, 5);

    const [beforeRows, sourceRow, afterRows] = await Promise.all([
        supabaseAdmin.from('messages').select(MESSAGE_SELECT)
            .eq('conversation_id', source.conversation_id).is('deleted_at', null)
            .lt('created_at', source.created_at).order('created_at', { ascending: false }).limit(before),
        supabaseAdmin.from('messages').select(MESSAGE_SELECT).eq('id', window.aroundMessageId).maybeSingle(),
        supabaseAdmin.from('messages').select(MESSAGE_SELECT)
            .eq('conversation_id', source.conversation_id).is('deleted_at', null)
            .gt('created_at', source.created_at).order('created_at', { ascending: true }).limit(after),
    ]);
    if (beforeRows.error) throw new AppError(beforeRows.error.message, 500);
    if (afterRows.error) throw new AppError(afterRows.error.message, 500);

    const combined = [
        ...(beforeRows.data || []).reverse(),
        ...(sourceRow.data ? [sourceRow.data] : []),
        ...(afterRows.data || []),
    ];
    return dedupeById(combined.map(toRetrievalMessage));
}

// INTERNA, no exportada: la rama de ventana ya se autoriza a sí misma
// (retrieveMessageWindow resuelve el mensaje → su conversación → membership
// ANTES de traer nada) sin importar quién la llame. La rama de
// conversationId directo, en cambio, ASUME que el caller ya autorizó esa
// conversación — nunca debe exponerse sin ese wrapper.
async function retrieveMessagesInternal(input: RetrieveContextInput, limit: number): Promise<RetrievalMessage[]> {
    if (input.messageWindow?.aroundMessageId) {
        return retrieveMessageWindow(input.actorUserId, input.messageWindow);
    }
    if (input.conversationId) {
        return retrieveRecentMessages(input.conversationId, limit, input.timeRange);
    }
    // Sin conversationId ni ventana explícita no hay alcance seguro que
    // recuperar — nunca se listan mensajes "de cualquier conversación".
    return [];
}

// PÚBLICA, segura por defecto (M-1B.1): si se pide por conversationId directo
// (sin ventana), autoriza membership ANTES de delegar. La ventana alrededor
// de un mensaje no necesita este chequeo adicional aquí porque ya se
// autoriza a sí misma dentro de retrieveMessageWindow, sin importar la
// entrada — incluyendo un messageId ajeno, que resuelve su conversación real
// y rechaza ahí, nunca confiando en un conversationId que el caller pudiera
// pasar junto al messageWindow.
export async function retrieveMessages(input: RetrieveContextInput, limit: number): Promise<RetrievalMessage[]> {
    if (!input.messageWindow?.aroundMessageId && input.conversationId) {
        await assertConversationParticipant(input.actorUserId, input.conversationId);
    }
    return retrieveMessagesInternal(input, limit);
}

// ─── Transcriptions (sección 11) ────────────────────────────────────────────
function toRetrievalTranscript(row: any, attachmentId: string, messageId: string | null, conversationId: string | null): RetrievalTranscript {
    return {
        id: row.id,
        attachmentId,
        messageId,
        conversationId,
        transcriptText: row.transcript_text,
        languageDetected: row.language_detected,
        completedAt: row.completed_at,
        provenance: {
            sourceType: 'transcription',
            sourceId: row.id,
            attachmentId,
            messageId,
            conversationId,
            timestamp: row.completed_at,
        },
    };
}

// INTERNA, no exportada: asume que conversationId ya fue autorizado por el
// caller. Nunca debe exponerse directamente.
async function retrieveTranscriptionsInternal(conversationId: string, limit: number, timeRange?: RetrievalTimeRange): Promise<RetrievalTranscript[]> {
    const { data: attachmentRows, error: attErr } = await supabaseAdmin
        .from('attachments')
        .select('id, message_id')
        .eq('context_conversation_id', conversationId)
        .eq('kind', 'audio')
        .neq('lifecycle_status', 'tombstoned');
    if (attErr) throw new AppError(attErr.message, 500);
    const attachmentIds = (attachmentRows || []).map((a) => a.id);
    if (attachmentIds.length === 0) return [];
    const messageIdByAttachment = new Map((attachmentRows || []).map((a) => [a.id, a.message_id as string | null]));

    let query = supabaseAdmin
        .from('audio_transcriptions')
        .select('id, attachment_id, status, transcript_text, language_detected, completed_at')
        .in('attachment_id', attachmentIds)
        .eq('status', 'completed') // solo transcripciones completadas — nunca pending/processing/failed
        .order('completed_at', { ascending: false })
        .limit(limit);
    if (timeRange?.from) query = query.gte('completed_at', timeRange.from);
    if (timeRange?.to) query = query.lte('completed_at', timeRange.to);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    return dedupeById((data || [])
        .filter((row) => Boolean(row.transcript_text))
        .map((row) => toRetrievalTranscript(row, row.attachment_id, messageIdByAttachment.get(row.attachment_id) ?? null, conversationId)));
}

// PÚBLICA, segura por defecto (M-1B.1): autoriza membership de la
// conversación ANTES de delegar — nunca confía en que el caller ya lo hizo.
export async function retrieveTranscriptions(actorUserId: string, conversationId: string, limit: number, timeRange?: RetrievalTimeRange): Promise<RetrievalTranscript[]> {
    await assertConversationParticipant(actorUserId, conversationId);
    return retrieveTranscriptionsInternal(conversationId, limit, timeRange);
}

// Transcripción de un attachment específico — autoriza vía la conversación
// del propio attachment, sin depender de que el caller ya la conozca.
export async function retrieveTranscriptionForAttachment(actorUserId: string, attachmentId: string): Promise<RetrievalTranscript | null> {
    const { data: attachment, error: attErr } = await supabaseAdmin
        .from('attachments')
        .select('id, message_id, context_conversation_id, kind, lifecycle_status')
        .eq('id', attachmentId)
        .maybeSingle();
    if (attErr) throw new AppError(attErr.message, 500);
    if (!attachment || attachment.lifecycle_status === 'tombstoned') return null;

    await assertConversationParticipant(actorUserId, attachment.context_conversation_id);
    if (attachment.kind !== 'audio') return null;

    const { data, error } = await supabaseAdmin
        .from('audio_transcriptions')
        .select('id, attachment_id, status, transcript_text, language_detected, completed_at')
        .eq('attachment_id', attachmentId)
        .eq('status', 'completed')
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data || !data.transcript_text) return null;
    return toRetrievalTranscript(data, attachmentId, attachment.message_id, attachment.context_conversation_id);
}

// ─── Attachments (sección 12) ────────────────────────────────────────────────
// Retrieval devuelve REFERENCIAS únicamente: nunca genera signed URLs, nunca
// descarga contenido, nunca hace OCR/parsing.
function toRetrievalAttachment(row: any): RetrievalAttachment {
    return {
        id: row.id,
        messageId: row.message_id,
        conversationId: row.context_conversation_id,
        kind: row.kind,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        lifecycleStatus: row.lifecycle_status,
        createdAt: row.attached_at || row.created_at,
        provenance: {
            sourceType: 'attachment',
            sourceId: row.id,
            attachmentId: row.id,
            messageId: row.message_id,
            conversationId: row.context_conversation_id,
            timestamp: row.attached_at || row.created_at,
        },
    };
}

// INTERNA, no exportada: asume que conversationId ya fue autorizado por el
// caller. Nunca debe exponerse directamente.
async function retrieveAttachmentsInternal(
    conversationId: string,
    limit: number,
    kinds?: ('image' | 'video' | 'audio' | 'document')[],
): Promise<RetrievalAttachment[]> {
    let query = supabaseAdmin
        .from('attachments')
        .select('id, message_id, context_conversation_id, kind, mime_type, original_filename, lifecycle_status, attached_at, created_at')
        .eq('context_conversation_id', conversationId)
        .neq('lifecycle_status', 'tombstoned')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (kinds && kinds.length > 0) query = query.in('kind', kinds);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);
    return dedupeById((data || []).map(toRetrievalAttachment));
}

// PÚBLICA, segura por defecto (M-1B.1): autoriza membership de la
// conversación ANTES de delegar — nunca confía en que el caller ya lo hizo.
export async function retrieveAttachments(
    actorUserId: string,
    conversationId: string,
    limit: number,
    kinds?: ('image' | 'video' | 'audio' | 'document')[],
): Promise<RetrievalAttachment[]> {
    await assertConversationParticipant(actorUserId, conversationId);
    return retrieveAttachmentsInternal(conversationId, limit, kinds);
}

// ─── Orquestador principal ───────────────────────────────────────────────────
export async function retrieveContext(input: RetrieveContextInput): Promise<RetrievalResult> {
    if (!input.actorUserId) throw new AppError('actorUserId is required', 400);

    const types = typeSet(input.types);
    const limits = {
        commitments: clampLimit(input.limits?.commitments, DEFAULT_LIMITS.commitments),
        events: clampLimit(input.limits?.events, DEFAULT_LIMITS.events),
        messages: clampLimit(input.limits?.messages, DEFAULT_LIMITS.messages),
        transcriptions: clampLimit(input.limits?.transcriptions, DEFAULT_LIMITS.transcriptions),
        attachments: clampLimit(input.limits?.attachments, DEFAULT_LIMITS.attachments),
    };

    // AUTHORIZATION FIRST: si se pide contexto de una conversación, se
    // confirma membership antes de ejecutar cualquier otra consulta.
    if (input.conversationId) {
        await assertConversationParticipant(input.actorUserId, input.conversationId);
    }

    const people: RetrievalPerson[] = [];
    if (types.has('person') && (input.personId || input.contactId)) {
        const resolution = input.personId
            ? await resolvePerson(input.actorUserId, { userId: input.personId })
            : await resolvePerson(input.actorUserId, { contactId: input.contactId });
        if (resolution.resolved) people.push(resolution.resolved);
    }

    // Commitments y events pueden ejecutarse en paralelo con messages, ya que
    // son consultas independientes una vez resuelta la autorización de
    // conversationId; events depende del resultado de commitments así que va
    // secuencial después.
    //
    // Nota M-1B.1: de aquí en adelante se llama a las variantes INTERNAS
    // (sin autorización propia) de messages/events/transcriptions/attachments
    // deliberadamente — conversationId ya fue autorizado arriba, y events
    // solo recibe IDs que ya salieron de retrieveCommitments (que aplica su
    // propio filtro de visibilidad). Repetir la autorización aquí sería una
    // cascada redundante (sección 10 del hardening M-1B.1). Las versiones
    // PÚBLICAS de estas mismas funciones siguen siendo seguras por defecto
    // para cualquier otro consumidor que las llame de forma independiente.
    const [commitmentsRaw, messages] = await Promise.all([
        types.has('commitment') ? retrieveCommitments(input, limits.commitments) : Promise.resolve([] as RetrievalCommitment[]),
        types.has('message') ? retrieveMessagesInternal(input, limits.messages) : Promise.resolve([] as RetrievalMessage[]),
    ]);
    const commitments = rankCommitments(commitmentsRaw, input);

    const events = types.has('commitment_event') && commitments.length > 0
        ? await retrieveCommitmentEventsInternal(commitments.map((c) => c.id), limits.events)
        : [];

    const [transcriptions, attachments] = await Promise.all([
        types.has('transcription') && input.conversationId
            ? retrieveTranscriptionsInternal(input.conversationId, limits.transcriptions, input.timeRange)
            : Promise.resolve([] as RetrievalTranscript[]),
        types.has('attachment') && input.conversationId
            ? retrieveAttachmentsInternal(input.conversationId, limits.attachments, input.attachmentKinds)
            : Promise.resolve([] as RetrievalAttachment[]),
    ]);

    const provenance = dedupeProvenance([
        ...commitments.map((c) => c.provenance),
        ...events.map((e) => e.provenance),
        ...messages.map((m) => m.provenance),
        ...transcriptions.map((t) => t.provenance),
        ...attachments.map((a) => a.provenance),
    ]);

    return {
        query: input.query ?? null,
        scope: {
            actorUserId: input.actorUserId,
            conversationId: input.conversationId ?? null,
            personId: input.personId ?? null,
            contactId: input.contactId ?? null,
        },
        people,
        commitments,
        events,
        messages,
        transcriptions,
        attachments,
        provenance,
    };
}
