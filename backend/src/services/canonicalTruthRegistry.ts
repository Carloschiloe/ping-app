// M-2 FINAL — OPERATIONAL MEMORY + CANONICAL INVARIANTS.
//
// Capa EXTENSIBLE de dominancia canónica (secciones 1-3 del ticket): antes,
// `enforceMemoryCanonicalDominance` sólo sabía comparar
// `commitment_status:<id>` -- un `if (predicate === ...)` disfrazado. Este
// archivo lo reemplaza por un REGISTRO de resolvers, uno por dominio
// canónico real de Ping, para que un futuro entity type se agregue como una
// entrada más, nunca como una nueva rama condicional dispersa por el código.
//
// Contrato de cada resolver: dado un predicate que afirma conocer el valor
// ACTUAL de un campo perteneciente a una entidad canónica, resuelve el valor
// REAL de esa entidad ahora mismo, autorizado para `ownerUserId` -- nunca
// expone nada fuera de lo que ese owner ya podía ver por las reglas de
// autorización existentes (reutiliza authz.ts/commitmentVisibility.ts, nunca
// las reimplementa). `null` significa "no se pudo resolver" (entidad no
// encontrada, o el owner no tiene acceso) -- en ESE caso nunca se fuerza
// nada sobre la memoria (ausencia de prueba no es prueba de lo contrario).
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getSharedProfileIds, assertConversationParticipant } from '../utils/authz';
import { getParticipantProposalIds, buildCommitmentVisibilityFilter, buildCommitmentProposalVisibilityFilter } from '../utils/commitmentVisibility';
import type { RetrievalCommitment } from '../types/retrieval';
import type { RetrievalMemory } from '../types/memory';

export interface PreloadedCanonicalData {
    // Conjunto de commitments/proposals YA cargado en este request (ej.
    // AgentContext.commitments) -- evita una segunda consulta cuando la
    // entidad referenciada ya está disponible en memoria de proceso.
    commitments?: RetrievalCommitment[];
}

export interface CanonicalTruthResolver {
    domain: string;
    matches: (predicate: string) => boolean;
    resolveCurrentValue: (predicate: string, ownerUserId: string, preloaded: PreloadedCanonicalData) => Promise<string | null>;
}

// ─── Dominio: commitment_status (commitments Y commitment_proposals -- un
// mismo RetrievalCommitment unificado, ver retrieval.ts) ───────────────────
async function resolveCommitmentStatus(predicate: string, ownerUserId: string, preloaded: PreloadedCanonicalData): Promise<string | null> {
    const id = predicate.slice('commitment_status:'.length);
    const fromPreloaded = preloaded.commitments?.find((c) => c.id === id);
    if (fromPreloaded) return fromPreloaded.status;

    // Fallback autorizado: la entidad referenciada por la memoria puede no
    // estar en el batch ya cargado de este request (ej. quedó fuera del
    // budget de retrieval) -- se reutiliza EXACTAMENTE el mismo criterio de
    // visibilidad ya certificado para el Agent, nunca uno más laxo.
    const participantProposalIds = await getParticipantProposalIds(ownerUserId);
    const { data: commitmentRow } = await supabaseAdmin
        .from('commitments').select('status').eq('id', id)
        .or(buildCommitmentVisibilityFilter(ownerUserId, participantProposalIds)).maybeSingle();
    if (commitmentRow) return commitmentRow.status;

    const { data: proposalRow } = await supabaseAdmin
        .from('commitment_proposals').select('status').eq('id', id)
        .or(buildCommitmentProposalVisibilityFilter(ownerUserId, participantProposalIds)).maybeSingle();
    return proposalRow ? proposalRow.status : null;
}

// ─── Dominio: identidad canónica de perfil (profile_field:<userId>:<field>) ─
// ADVERSARIAL C del ticket: una memoria no puede inventar un dato de
// perfil actual que contradiga la fuente estructurada real.
const PROFILE_FIELDS = new Set(['full_name', 'email', 'phone']);
async function resolveProfileIdentity(predicate: string, ownerUserId: string): Promise<string | null> {
    const [, userId, field] = predicate.split(':');
    if (!userId || !field || !PROFILE_FIELDS.has(field)) return null;
    if (userId !== ownerUserId) {
        const allowed = new Set(await getSharedProfileIds(ownerUserId));
        if (!allowed.has(userId)) return null; // nunca resuelve fuera del universo autorizado del actor
    }
    // `.select(field)` con un nombre de columna dinámico rompe la inferencia
    // de tipos por template-literal de supabase-js (espera un literal
    // conocido en compile-time) -- `as any` es intencional aquí, el runtime
    // funciona igual, sólo se pierde el tipado estático de esta única llamada.
    const { data } = await (supabaseAdmin.from('profiles').select as any)(field).eq('id', userId).maybeSingle();
    if (!data) return null;
    const value = (data as Record<string, unknown>)[field];
    return value === null || value === undefined ? null : String(value);
}

// ─── Dominio: identidad canónica de contacto (contact_field:<contactId>:<field>) ─
const CONTACT_FIELDS = new Set(['display_name', 'email', 'phone']);
async function resolveContactIdentity(predicate: string, ownerUserId: string): Promise<string | null> {
    const [, contactId, field] = predicate.split(':');
    if (!contactId || !field || !CONTACT_FIELDS.has(field)) return null;
    const { data } = await (supabaseAdmin.from('contacts').select as any)(`${field}, owner_user_id`).eq('id', contactId).maybeSingle();
    if (!data || (data as Record<string, unknown>).owner_user_id !== ownerUserId) return null; // un contacto siempre es sólo de su owner
    const value = (data as Record<string, unknown>)[field];
    return value === null || value === undefined ? null : String(value);
}

// ─── Dominio: membresía de conversación (conversation_member:<conversationId>:<userId>) ─
async function resolveConversationMembership(predicate: string, ownerUserId: string): Promise<string | null> {
    const [, conversationId, userId] = predicate.split(':');
    if (!conversationId || !userId) return null;
    try {
        await assertConversationParticipant(ownerUserId, conversationId); // el actor debe poder ver esta conversación para siquiera preguntar
    } catch {
        return null;
    }
    const { data } = await supabaseAdmin.from('conversation_participants').select('user_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
    return data ? 'member' : 'not_member';
}

// ─── Dominio: ciclo de vida de adjuntos (attachment_lifecycle:<attachmentId>) ─
async function resolveAttachmentLifecycle(predicate: string, ownerUserId: string): Promise<string | null> {
    const id = predicate.slice('attachment_lifecycle:'.length);
    const { data } = await supabaseAdmin.from('attachments').select('lifecycle_status, context_conversation_id').eq('id', id).maybeSingle();
    if (!data) return null;
    try {
        await assertConversationParticipant(ownerUserId, data.context_conversation_id);
    } catch {
        return null;
    }
    return data.lifecycle_status;
}

// Mensajes NUNCA tienen resolver: un mensaje es evidencia histórica inmutable
// por diseño (no existe "estado actual de un mensaje" que dominar) -- esto es
// una conclusión arquitectónica explícita, no un dominio faltante.
const CANONICAL_RESOLVERS: CanonicalTruthResolver[] = [
    { domain: 'commitment_status', matches: (p) => p.startsWith('commitment_status:'), resolveCurrentValue: resolveCommitmentStatus },
    { domain: 'profile_identity', matches: (p) => p.startsWith('profile_field:'), resolveCurrentValue: (p, o) => resolveProfileIdentity(p, o) },
    { domain: 'contact_identity', matches: (p) => p.startsWith('contact_field:'), resolveCurrentValue: (p, o) => resolveContactIdentity(p, o) },
    { domain: 'conversation_membership', matches: (p) => p.startsWith('conversation_member:'), resolveCurrentValue: (p, o) => resolveConversationMembership(p, o) },
    { domain: 'attachment_lifecycle', matches: (p) => p.startsWith('attachment_lifecycle:'), resolveCurrentValue: (p, o) => resolveAttachmentLifecycle(p, o) },
];

export function findCanonicalResolver(predicate: string): CanonicalTruthResolver | undefined {
    return CANONICAL_RESOLVERS.find((r) => r.matches(predicate));
}

// ─── Dominancia canónica generalizada (invariante no negociable) ──────────
// M-2 ABSOLUTE FINAL — Blocker C. La versión anterior comparaba VALORES
// (¿coincide la memoria con el estado canónico actual?) y sólo forzaba
// isCurrent=false cuando NO coincidían. Eso todavía permitía una "verdad
// activa duplicada": si la memoria coincidía por casualidad (recién ocurrió
// la transición), quedaba isCurrent=true -- una segunda autoridad paralela
// afirmando lo mismo que ya afirma la entidad canónica.
//
// Invariante correcta (sección 14 del ticket: "no crear una verdad actual
// competidora para predicates canon-owned, EN PRIMER LUGAR"): la verdad
// ACTUAL de un campo canon-owned vive EXCLUSIVAMENTE en su entidad canónica
// (commitments/profiles/contacts/conversation_participants/attachments),
// nunca en memoria -- COINCIDA O NO coincida el valor recordado. Por eso
// cualquier memoria cuyo predicate pertenece a un dominio canónico conocido
// se marca isCurrent=false INCONDICIONALMENTE. Esto es lo que hace que
// "¿cuál es el estado de Entrenar?" resuelva SIEMPRE desde `commitments`
// (canonical, nunca memoria) y que "¿cuándo aceptamos Entrenar?" pueda
// seguir usando el mismo registro histórico de eventos vía
// historicalMemoryFacts -- nunca se pierde la cadena de transición
// (supersession la preserva, ver memory.service.ts), sólo se le quita la
// posibilidad de presentarse como "la verdad de ahora".
//
// `resolveCurrentValue` de cada resolver NO se usa para esta invariante --
// queda como utilidad real, probada y disponible (reverse-authorized lookup
// de commitment/profile/contact/conversation/attachment) para una futura
// función de síntesis tipo "qué cambió" que quiera anotar "la memoria decía
// X, lo canónico dice Y ahora" en vez de sólo ocultar X. No añadir una
// segunda función paralela para eso -- reusar `findCanonicalResolver(...).resolveCurrentValue(...)`
// cuando ese caso de uso se implemente.
export function enforceMemoryCanonicalDominance(memories: RetrievalMemory[]): RetrievalMemory[] {
    return memories.map((m) => {
        if (!findCanonicalResolver(m.predicate)) return m; // no pertenece a ningún dominio canónico conocido -- memoria libre, nunca se toca
        return m.isCurrent ? { ...m, isCurrent: false } : m;
    });
}
