// M-2 — CANONICAL MEMORY + CONTEXT ARCHITECTURE.
//
// "LLM MAY EXTRACT OR SUGGEST. PING CORE OWNS MEMORY TRUTH." Este archivo es
// la ÚNICA autoridad de escritura de memory_records. Nada más en el backend
// hace `.from('memory_records').insert(...)` directamente -- todo pasa por
// `ingestMemoryFromEvent`, que valida determinísticamente antes de escribir.
//
// Pipeline de escritura (sección "memory write authority"):
//   evento de fuente (ya autorizado/resuelto por el llamador)
//     -> parseMemoryExtractionCandidate (whitelist estricta, descarta todo
//        campo que el candidato no debería poder decidir)
//     -> resolveMemorySubject (identidad canónica real, nunca inventada)
//     -> classifySensitivity (Core NUNCA confía ciegamente en el hint)
//     -> dedupe por content_hash (idempotencia real, con índice único en DB)
//     -> conflicto/supersesión por (owner, sujeto, predicate)
//     -> insert
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { resolvePerson } from './retrieval.service';
import type {
    MemoryEvidenceRef,
    MemoryExtractionCandidate,
    MemoryIngestionOutcome,
    MemoryIngestionSourceEvent,
    MemoryQueryPlan,
    MemorySensitivity,
    MemorySourceType,
    MemoryStatus,
    MemorySubjectHint,
    MemoryTemporalHint,
    MemoryType,
    RetrievalMemory,
} from '../types/memory';
import { traceMemory } from '../utils/memoryTrace';
import { decideMemoryPersistence } from './memoryAutoStorePolicy';
import { defaultMemorySearchProvider } from './memorySearchProvider';

const VALID_MEMORY_TYPES = new Set<MemoryType>(['episodic', 'semantic']);
const VALID_SENSITIVITY = new Set<MemorySensitivity>(['normal', 'sensitive', 'restricted']);

// ─── Normalización / hashing (dedup e idempotencia) ────────────────────────
function normalizeForHash(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function subjectKeyFor(subjectPersonId: string | null, subjectContactId: string | null, subjectUnresolvedHint: string | null): string {
    if (subjectPersonId) return `person:${subjectPersonId}`;
    if (subjectContactId) return `contact:${subjectContactId}`;
    if (subjectUnresolvedHint) return `hint:${normalizeForHash(subjectUnresolvedHint)}`;
    return 'none';
}

function computeContentHash(ownerUserId: string, subjectKey: string, predicate: string, objectValue: string): string {
    const normalized = [ownerUserId, subjectKey, normalizeForHash(predicate), normalizeForHash(objectValue)].join('|');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sanitizeTimestamp(value: string | undefined): string | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return new Date(parsed).toISOString();
}

// ─── Frontera de extracción: whitelist estricta ────────────────────────────
// Defensa activa contra un candidato hostil/malformado (sección "tests
// adversariales de extracción"): CUALQUIER campo no listado aquí explícitamente
// se descarta en silencio, nunca se copia. En particular esto es lo que hace
// imposible que un candidato "invente" un subjectPersonId, un sourceType, un
// status, o cualquier otro campo que sólo Core puede resolver -- el tipo de
// retorno (MemoryExtractionCandidate) estructuralmente no tiene esos campos.
export function parseMemoryExtractionCandidate(raw: unknown): MemoryExtractionCandidate | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;

    const memoryTypeHint = typeof r.memoryTypeHint === 'string' && VALID_MEMORY_TYPES.has(r.memoryTypeHint as MemoryType)
        ? (r.memoryTypeHint as MemoryType)
        : null;
    const predicateHint = typeof r.predicateHint === 'string' ? r.predicateHint.trim() : '';
    const objectValueHint = typeof r.objectValueHint === 'string' ? r.objectValueHint.trim() : '';
    const canonicalTextHint = typeof r.canonicalTextHint === 'string' ? r.canonicalTextHint.trim() : '';
    if (!memoryTypeHint || !predicateHint || !objectValueHint || !canonicalTextHint) return null;

    let subjectHint: MemorySubjectHint | null = null;
    if (r.subjectHint && typeof r.subjectHint === 'object') {
        const s = r.subjectHint as Record<string, unknown>;
        const candidate: MemorySubjectHint = {
            isSelf: typeof s.isSelf === 'boolean' ? s.isSelf : undefined,
            name: typeof s.name === 'string' ? s.name.trim().slice(0, 200) : undefined,
            email: typeof s.email === 'string' ? s.email.trim().slice(0, 200) : undefined,
            phone: typeof s.phone === 'string' ? s.phone.trim().slice(0, 60) : undefined,
        };
        if (candidate.isSelf || candidate.name || candidate.email || candidate.phone) subjectHint = candidate;
    }

    let temporalHint: MemoryTemporalHint | undefined;
    if (r.temporalHint && typeof r.temporalHint === 'object') {
        const t = r.temporalHint as Record<string, unknown>;
        temporalHint = {
            observedAtHint: typeof t.observedAtHint === 'string' ? t.observedAtHint : undefined,
            validFromHint: typeof t.validFromHint === 'string' ? t.validFromHint : undefined,
            validUntilHint: typeof t.validUntilHint === 'string' ? t.validUntilHint : undefined,
        };
    }

    const confidenceHint = typeof r.confidenceHint === 'number' && Number.isFinite(r.confidenceHint)
        ? Math.max(0, Math.min(1, r.confidenceHint))
        : undefined;

    const sensitivityHint = typeof r.sensitivityHint === 'string' && VALID_SENSITIVITY.has(r.sensitivityHint as MemorySensitivity)
        ? (r.sensitivityHint as MemorySensitivity)
        : undefined;

    return {
        memoryTypeHint,
        subjectHint,
        predicateHint: predicateHint.slice(0, 200),
        objectValueHint: objectValueHint.slice(0, 2000),
        canonicalTextHint: canonicalTextHint.slice(0, 2000),
        temporalHint,
        confidenceHint,
        sensitivityHint,
    };
}

// ─── Clasificación de sensibilidad: Core nunca confía ciegamente en el hint ─
// Un hint puede SUBIR la sensibilidad (si el proveedor es más cauto que
// nuestra lista de palabras clave) pero nunca puede BAJARLA por debajo de lo
// que el propio contenido revela -- ese es el caso adversarial "sensibilidad
// etiquetada como segura" que el ticket exige rechazar/normalizar.
const SENSITIVE_KEYWORDS = [
    'salud', 'enfermedad', 'diagnostico', 'medic', 'religion', 'orientacion sexual',
    'politica', 'partido politico', 'sueldo', 'salario', 'contrasena', 'password',
    'tarjeta de credito', 'cuenta bancaria', 'embarazo', 'discapacidad', 'vih',
].map(normalizeForHash);

export function classifySensitivity(predicate: string, objectValue: string, hint: MemorySensitivity | undefined): MemorySensitivity {
    const haystack = normalizeForHash(`${predicate} ${objectValue}`);
    const detected = SENSITIVE_KEYWORDS.some((kw) => haystack.includes(kw));
    if (detected) return hint === 'restricted' ? 'restricted' : 'sensitive';
    return hint ?? 'normal';
}

// ─── Resolución de identidad canónica (nunca inventada) ────────────────────
export interface ResolvedMemorySubject {
    subjectPersonId: string | null;
    subjectContactId: string | null;
    subjectUnresolvedHint: string | null;
    // true cuando el candidato AFIRMÓ un sujeto (subjectHint no nulo) pero no
    // resolvió a una identidad canónica real -- ver sección 16 del ticket
    // ("identidad no resuelta permanece no resuelta, nunca se inventa").
    unresolved: boolean;
}

async function resolveMemorySubject(
    ownerUserId: string,
    subjectHint: MemorySubjectHint | null,
    conversationId: string | null,
): Promise<ResolvedMemorySubject> {
    if (!subjectHint) {
        return { subjectPersonId: null, subjectContactId: null, subjectUnresolvedHint: null, unresolved: false };
    }
    if (subjectHint.isSelf) {
        return { subjectPersonId: ownerUserId, subjectContactId: null, subjectUnresolvedHint: null, unresolved: false };
    }

    const result = await resolvePerson(ownerUserId, {
        name: subjectHint.name,
        email: subjectHint.email,
        phone: subjectHint.phone,
        conversationId: conversationId ?? undefined,
    });

    if (result.resolved && !result.ambiguous) {
        if (result.resolved.kind === 'user') {
            return { subjectPersonId: result.resolved.id, subjectContactId: null, subjectUnresolvedHint: null, unresolved: false };
        }
        return { subjectPersonId: null, subjectContactId: result.resolved.id, subjectUnresolvedHint: null, unresolved: false };
    }

    const rawHint = subjectHint.name || subjectHint.email || subjectHint.phone || null;
    return { subjectPersonId: null, subjectContactId: null, subjectUnresolvedHint: rawHint, unresolved: true };
}

// ─── Evidencia relacional (M-2 FINAL, sección "evidence model") ────────────
// `memory_record_evidence` es la AUTORIDAD real de procedencia (reverse
// lookup por fuente, borrado, autorización -- ver
// 20260907040000_memory_record_evidence.sql). `memory_records.evidence_refs`
// (jsonb) es sólo una caché de lectura rápida, SIEMPRE recalculada desde esta
// tabla en cada escritura -- nunca una segunda fuente de verdad independiente
// que pueda desincronizarse.
async function upsertEvidenceRows(memoryRecordId: string, evidenceRefs: MemoryEvidenceRef[]): Promise<void> {
    if (evidenceRefs.length === 0) return;
    const rows = evidenceRefs.map((e) => ({
        memory_record_id: memoryRecordId,
        source_type: e.sourceType,
        source_id: e.sourceId,
        message_id: e.messageId ?? null,
        conversation_id: e.conversationId ?? null,
        occurred_at: e.timestamp ?? null,
    }));
    const { error } = await supabaseAdmin
        .from('memory_record_evidence')
        .upsert(rows, { onConflict: 'memory_record_id,source_type,source_id', ignoreDuplicates: true });
    if (error) throw error;
}

async function readEvidenceRefs(memoryRecordId: string): Promise<MemoryEvidenceRef[]> {
    const { data, error } = await supabaseAdmin
        .from('memory_record_evidence')
        .select('source_type, source_id, message_id, conversation_id, occurred_at')
        .eq('memory_record_id', memoryRecordId);
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
        sourceType: row.source_type as MemorySourceType,
        sourceId: row.source_id as string,
        messageId: row.message_id as string | null,
        conversationId: row.conversation_id as string | null,
        timestamp: row.occurred_at as string | null,
    }));
}

// Recalcula evidence_refs (jsonb) desde memory_record_evidence y lo persiste
// -- el ÚNICO camino de escritura de esa columna a partir de aquí. Devuelve
// la lista resultante para que el llamador pueda decidir invalidar sin una
// segunda lectura.
//
// IMPORTANTE: esta función NUNCA cambia `status` -- un caller que también
// necesite invalidar (evidencia llegó a cero) NO debe llamarla y luego hacer
// un segundo update de status por separado: `evidence_refs=[]` con
// `status='active'` todavía vigente viola el constraint
// `memory_records_evidence_required_when_promoted` de forma transitoria y
// real (hallazgo empírico -- ver invalidateMemoryForDeletedSource /
// revalidateMemoryEvidenceAuthorization, que escriben AMBOS campos en UNA
// sola sentencia cuando toca invalidar, nunca en dos pasos).
async function syncEvidenceJsonCache(memoryRecordId: string): Promise<MemoryEvidenceRef[]> {
    const refs = await readEvidenceRefs(memoryRecordId);
    const { error: updateErr } = await supabaseAdmin.from('memory_records').update({ evidence_refs: refs }).eq('id', memoryRecordId);
    if (updateErr) throw updateErr;
    return refs;
}

interface MemoryRow {
    id: string;
    object_value: string;
    observed_at: string;
    evidence_refs: MemoryEvidenceRef[];
}

async function findActiveSameFact(
    ownerUserId: string,
    subjectPersonId: string | null,
    subjectContactId: string | null,
    subjectUnresolvedHint: string | null,
    predicate: string,
): Promise<MemoryRow | null> {
    let query = supabaseAdmin
        .from('memory_records')
        .select('id, object_value, observed_at, evidence_refs')
        .eq('owner_user_id', ownerUserId)
        .eq('status', 'active')
        .eq('predicate', predicate);

    if (subjectPersonId) query = query.eq('subject_person_id', subjectPersonId);
    else if (subjectContactId) query = query.eq('subject_contact_id', subjectContactId);
    else if (subjectUnresolvedHint) query = query.eq('subject_unresolved_hint', subjectUnresolvedHint);
    else query = query.is('subject_person_id', null).is('subject_contact_id', null).is('subject_unresolved_hint', null);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as MemoryRow | null;
}

// ─── Ingesta (única vía de escritura) ──────────────────────────────────────
export async function ingestMemoryFromEvent(event: MemoryIngestionSourceEvent, traceId?: string): Promise<MemoryIngestionOutcome> {
    const candidate = parseMemoryExtractionCandidate(event.candidate);
    if (!candidate) {
        traceMemory(traceId, 'reject', { reason: 'invalid_candidate_shape', sourceType: event.sourceType });
        return { kind: 'rejected', reason: 'invalid_candidate_shape' };
    }
    if (!event.evidenceRefs || event.evidenceRefs.length === 0) {
        traceMemory(traceId, 'reject', { reason: 'missing_evidence', sourceType: event.sourceType });
        return { kind: 'rejected', reason: 'missing_evidence' };
    }
    if (!event.ownerUserId || !event.observedAt) {
        traceMemory(traceId, 'reject', { reason: 'missing_core_fields', sourceType: event.sourceType });
        return { kind: 'rejected', reason: 'missing_core_fields' };
    }

    const subject = await resolveMemorySubject(event.ownerUserId, candidate.subjectHint, event.conversationId);
    const sensitivity = classifySensitivity(candidate.predicateHint, candidate.objectValueHint, candidate.sensitivityHint);

    const confidence = candidate.confidenceHint !== undefined
        ? (event.extractionMethod === 'llm' ? Math.min(candidate.confidenceHint, 0.9) : candidate.confidenceHint)
        : (event.extractionMethod === 'llm' ? 0.7 : 1.0);

    // M-2 FINAL (sección 13-15) — "classifySensitivity dijo sensitive" NO es
    // una política por sí sola: decideMemoryPersistence decide el desenlace
    // real considerando también identidad resuelta/confianza/método. Un
    // hecho sensible-no-restringido YA NO se auto-activa directo (hallazgo
    // explícito del ticket) -- ver memoryAutoStorePolicy.ts.
    const persistenceOutcome = decideMemoryPersistence({
        memoryType: candidate.memoryTypeHint,
        predicate: candidate.predicateHint.trim().toLowerCase(),
        sensitivity,
        sourceType: event.sourceType,
        extractionMethod: event.extractionMethod,
        confidence,
        identityResolved: !subject.unresolved,
    });
    if (persistenceOutcome === 'never_store' || persistenceOutcome === 'requires_confirmation') {
        traceMemory(traceId, 'reject', { reason: `policy_${persistenceOutcome}`, sourceType: event.sourceType, sensitivity });
        return { kind: 'rejected', reason: `policy_${persistenceOutcome}` };
    }
    // 'candidate_only' fuerza status='candidate' incondicionalmente (incluso
    // con identidad resuelta) -- nunca se auto-activa un hecho sensible o de
    // baja confianza sólo porque el sujeto sí resolvió.
    const forcedCandidateByPolicy = persistenceOutcome === 'candidate_only';

    const predicate = candidate.predicateHint.trim().toLowerCase().slice(0, 200);
    const objectValueNormalized = candidate.objectValueHint.trim();
    const subjectKey = subjectKeyFor(subject.subjectPersonId, subject.subjectContactId, subject.subjectUnresolvedHint);
    const contentHash = computeContentHash(event.ownerUserId, subjectKey, predicate, objectValueNormalized);

    const { data: existingSame, error: existingErr } = await supabaseAdmin
        .from('memory_records')
        .select('id, evidence_refs')
        .eq('owner_user_id', event.ownerUserId)
        .eq('content_hash', contentHash)
        .neq('status', 'deleted')
        .maybeSingle();
    if (existingErr) throw existingErr;
    if (existingSame) {
        await upsertEvidenceRows(existingSame.id, event.evidenceRefs);
        await syncEvidenceJsonCache(existingSame.id);
        traceMemory(traceId, 'duplicate', { existingId: existingSame.id, sourceType: event.sourceType });
        return { kind: 'duplicate', existingId: existingSame.id };
    }

    const validFrom = sanitizeTimestamp(candidate.temporalHint?.validFromHint);
    const validUntil = sanitizeTimestamp(candidate.temporalHint?.validUntilHint);

    let status: MemoryStatus = (subject.unresolved || forcedCandidateByPolicy) ? 'candidate' : 'active';
    let supersedesId: string | null = null;
    let supersededByExistingId: string | null = null;
    let supersededByExistingAt: string | null = null;

    // Un hecho forzado a 'candidate' por política (sensible-no-restringido o
    // baja confianza) nunca compite por superseder/ser superseded -- eso es
    // exclusivo de la línea de verdad 'active' real, igual que la identidad
    // no resuelta.
    if (!subject.unresolved && !forcedCandidateByPolicy) {
        const existingActive = await findActiveSameFact(
            event.ownerUserId, subject.subjectPersonId, subject.subjectContactId, subject.subjectUnresolvedHint, predicate,
        );
        if (existingActive && normalizeForHash(existingActive.object_value) !== normalizeForHash(objectValueNormalized)) {
            if (new Date(event.observedAt).getTime() >= new Date(existingActive.observed_at).getTime()) {
                supersedesId = existingActive.id;
            } else {
                // El hecho entrante es MÁS ANTIGUO que el activo vigente
                // (ingesta fuera de orden, ej. un mensaje viejo procesado
                // tarde) -- nunca reemplaza la verdad actual. Se inserta
                // directamente como histórico, ya enlazado hacia adelante.
                status = 'superseded';
                supersededByExistingId = existingActive.id;
                supersededByExistingAt = existingActive.observed_at;
            }
        }
    }

    const insertRow = {
        owner_user_id: event.ownerUserId,
        memory_type: candidate.memoryTypeHint,
        subject_person_id: subject.subjectPersonId,
        subject_contact_id: subject.subjectContactId,
        subject_unresolved_hint: subject.subjectUnresolvedHint,
        predicate,
        object_value: objectValueNormalized,
        canonical_text: candidate.canonicalTextHint.trim(),
        source_type: event.sourceType,
        source_id: event.sourceId,
        conversation_id: event.conversationId,
        evidence_refs: event.evidenceRefs,
        observed_at: event.observedAt,
        valid_from: validFrom,
        valid_until: validUntil,
        status,
        superseded_by: supersededByExistingId,
        superseded_at: supersededByExistingAt,
        confidence,
        sensitivity,
        visibility_scope: 'private' as const,
        extraction_method: event.extractionMethod,
        model_provider: event.modelProvider ?? null,
        model_version: event.modelVersion ?? null,
        content_hash: contentHash,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('memory_records')
        .insert(insertRow)
        .select('id')
        .single();
    if (insertErr) {
        // Carrera real: dos ingestas concurrentes del mismo hecho pueden
        // perder la lectura previa de "existingSame" -- el índice único de
        // (owner_user_id, content_hash) en la migración es la garantía real,
        // esta rama sólo la traduce a la misma respuesta idempotente.
        if ((insertErr as { code?: string }).code === '23505') {
            const { data: raceExisting } = await supabaseAdmin
                .from('memory_records')
                .select('id, evidence_refs')
                .eq('owner_user_id', event.ownerUserId)
                .eq('content_hash', contentHash)
                .neq('status', 'deleted')
                .maybeSingle();
            if (raceExisting) {
                await upsertEvidenceRows(raceExisting.id, event.evidenceRefs);
                await syncEvidenceJsonCache(raceExisting.id);
                traceMemory(traceId, 'duplicate', { existingId: raceExisting.id, sourceType: event.sourceType, race: true });
                return { kind: 'duplicate', existingId: raceExisting.id };
            }
        }
        throw insertErr;
    }

    await upsertEvidenceRows(inserted.id, event.evidenceRefs);

    if (supersedesId) {
        await supabaseAdmin
            .from('memory_records')
            .update({ status: 'superseded', superseded_by: inserted.id, superseded_at: event.observedAt })
            .eq('id', supersedesId);
        traceMemory(traceId, 'superseded', { newId: inserted.id, supersededId: supersedesId, sourceType: event.sourceType });
        return { kind: 'superseded', id: inserted.id, supersededId: supersedesId };
    }

    traceMemory(traceId, 'inserted', { id: inserted.id, status, sourceType: event.sourceType, memoryType: candidate.memoryTypeHint });
    return { kind: 'inserted', id: inserted.id, status };
}

// Helper determinístico (extractionMethod='deterministic', sin LLM) para
// cerrar el ciclo de dominancia canónica EN LA INGESTA: cuando un
// commitment/proposal cambia de estado, esto genera un hecho episódico que
// SUPERSEDE automáticamente cualquier memoria previa sobre el estado de esa
// misma entidad -- así la memoria nunca queda "atrasada" respecto al estado
// canónico real. Diseñado para ser llamado desde los mismos puntos donde hoy
// se registran commitment_events (ver commitmentEvents en el repo); cablear
// TODOS esos call sites es trabajo de integración futuro (permitido
// explícitamente por el ticket, sección "ingesta orientada a eventos": "no
// necesariamente cablear todo ahora") -- esta función y su cobertura de test
// prueban que el MECANISMO es correcto de punta a punta cuando se invoca.
export async function deriveMemoryFromCommitmentStatusChange(input: {
    ownerUserId: string;
    sourceType: 'commitment' | 'commitment_proposal';
    sourceId: string;
    title: string;
    newStatus: string;
    conversationId: string | null;
    occurredAt: string;
}): Promise<MemoryIngestionOutcome> {
    const event: MemoryIngestionSourceEvent = {
        ownerUserId: input.ownerUserId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        conversationId: input.conversationId,
        observedAt: input.occurredAt,
        evidenceRefs: [{ sourceType: input.sourceType, sourceId: input.sourceId, timestamp: input.occurredAt }],
        extractionMethod: 'deterministic',
        candidate: {
            memoryTypeHint: 'episodic',
            subjectHint: null,
            predicateHint: `commitment_status:${input.sourceId}`,
            objectValueHint: input.newStatus,
            canonicalTextHint: `El compromiso "${input.title}" está en estado ${input.newStatus}.`,
        },
    };
    return ingestMemoryFromEvent(event);
}

// M-2 FINAL — la dominancia canónica se movió a canonicalTruthRegistry.ts:
// un registro EXTENSIBLE de resolvers por dominio (commitment_status,
// profile_identity, contact_identity, conversation_membership,
// attachment_lifecycle), no un `if (predicate === ...)` acoplado sólo a
// commitments. Ver enforceMemoryCanonicalDominance ahí -- este archivo ya no
// la define, sólo la consume donde haga falta.

// ─── Retrieval (lectura, siempre owner-scoped -- sección 11) ──────────────
// M-2 ABSOLUTE FINAL (sección 16-17) — `retrieveMemory` es ahora una FACHADA
// delgada sobre `MemorySearchProvider` (memorySearchProvider.ts). Ningún
// call site existente cambia (agentContextBuilder.service.ts sigue llamando
// esta misma función); un futuro motor semantic/híbrido implementa la MISMA
// interfaz y se sustituye ahí, sin tocar Core.
export async function retrieveMemory(plan: MemoryQueryPlan, traceId?: string): Promise<RetrievalMemory[]> {
    return defaultMemorySearchProvider.search(plan, traceId);
}

// ─── Ganchos de borrado/retención (sección "deletion/retention") ──────────
// M-2 FINAL — cierre real del hallazgo anterior: el reverse-lookup ahora
// corre sobre `memory_record_evidence` (índice real por source_type+
// source_id), así que encuentra CUALQUIER memoria que cite esta fuente,
// sea evidencia PRIMARIA o SECUNDARIA fusionada por deduplicación -- ya no
// hay una clase de evidencia obsoleta que sobreviva a la limpieza. Nunca deja
// una fila "activa"/"superseded" sin evidencia verificable: si era la ÚNICA
// evidencia, invalida; si quedan otras, sólo se retira esa referencia y la
// memoria se mantiene (con menos respaldo, pero respaldo real).
export async function invalidateMemoryForDeletedSource(sourceType: MemorySourceType, sourceId: string, traceId?: string): Promise<void> {
    const { data: evidenceRows, error } = await supabaseAdmin
        .from('memory_record_evidence')
        .select('memory_record_id')
        .eq('source_type', sourceType)
        .eq('source_id', sourceId);
    if (error) throw error;

    const affectedMemoryIds = Array.from(new Set((evidenceRows || []).map((r: { memory_record_id: string }) => r.memory_record_id)));
    for (const memoryId of affectedMemoryIds) {
        const { error: delErr } = await supabaseAdmin
            .from('memory_record_evidence')
            .delete()
            .eq('memory_record_id', memoryId)
            .eq('source_type', sourceType)
            .eq('source_id', sourceId);
        if (delErr) throw delErr;
        // Una sola sentencia cuando toca invalidar (ver comentario en
        // syncEvidenceJsonCache): escribir evidence_refs=[] con status
        // todavía 'active' en un paso separado viola el constraint real de
        // forma transitoria -- hallazgo empírico contra Postgres real.
        const remaining = await readEvidenceRefs(memoryId);
        if (remaining.length === 0) {
            await supabaseAdmin.from('memory_records').update({ status: 'invalidated', evidence_refs: remaining }).eq('id', memoryId).neq('status', 'deleted');
        } else {
            await supabaseAdmin.from('memory_records').update({ evidence_refs: remaining }).eq('id', memoryId);
        }
        traceMemory(traceId, 'evidence_cleanup', { memoryId, remainingEvidenceCount: remaining.length, sourceType, reason: 'source_deleted' });
    }
}

// Sección 7 del ticket M-2 FINAL ("evidence authorization invariant"): una
// memoria owner-autorizada NO es suficiente si una de sus fuentes de
// evidencia dejó de ser accesible para ESE owner específicamente (ej. fue
// removido de la conversación que contenía el mensaje/proposal de origen) --
// sin que la fuente en sí haya sido borrada globalmente (por eso NO reutiliza
// invalidateMemoryForDeletedSource tal cual: ese limpia para TODOS los
// dueños que citan la fuente; esto limpia SÓLO para el owner que perdió
// acceso, otros propietarios con acceso legítimo no se ven afectados).
// Reutiliza el MISMO mecanismo de limpieza de evidencia (nunca una segunda
// lógica de invalidación paralela) -- se invoca desde el mismo tipo de
// evento (membership/autorización) que dispara un cambio real, nunca en
// tiempo de lectura (evita N verificaciones de autorización por consulta).
export async function revalidateMemoryEvidenceAuthorization(
    ownerUserId: string,
    sourceType: MemorySourceType,
    sourceId: string,
    traceId?: string,
): Promise<void> {
    const { data: evidenceRows, error } = await supabaseAdmin
        .from('memory_record_evidence')
        .select('memory_record_id')
        .eq('source_type', sourceType)
        .eq('source_id', sourceId);
    if (error) throw error;
    const candidateIds = Array.from(new Set((evidenceRows || []).map((r: { memory_record_id: string }) => r.memory_record_id)));
    if (candidateIds.length === 0) return;

    const { data: ownedMemories, error: ownErr } = await supabaseAdmin
        .from('memory_records')
        .select('id')
        .in('id', candidateIds)
        .eq('owner_user_id', ownerUserId);
    if (ownErr) throw ownErr;

    for (const row of ownedMemories || []) {
        const { error: delErr } = await supabaseAdmin
            .from('memory_record_evidence')
            .delete()
            .eq('memory_record_id', row.id)
            .eq('source_type', sourceType)
            .eq('source_id', sourceId);
        if (delErr) throw delErr;
        const remaining = await readEvidenceRefs(row.id);
        if (remaining.length === 0) {
            await supabaseAdmin.from('memory_records').update({ status: 'invalidated', evidence_refs: remaining }).eq('id', row.id).neq('status', 'deleted');
        } else {
            await supabaseAdmin.from('memory_records').update({ evidence_refs: remaining }).eq('id', row.id);
        }
        traceMemory(traceId, 'evidence_cleanup', { memoryId: row.id, remainingEvidenceCount: remaining.length, sourceType, reason: 'authorization_revoked' });
    }
}

export async function invalidateMemoryForConversationDeletion(conversationId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('memory_records')
        .update({ status: 'invalidated' })
        .eq('conversation_id', conversationId)
        .neq('status', 'deleted');
    if (error) throw error;
}

// FK `owner_user_id references profiles(id) on delete cascade` ya limpia
// físicamente estas filas si `profiles` borra la fila real. Esta función es
// el gancho explícito para un futuro flujo de borrado de cuenta que sea un
// soft-delete (no borra la fila de profiles) en vez de un borrado físico.
export async function deleteMemoryForAccountDeletion(ownerUserId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('memory_records')
        .update({ status: 'deleted' })
        .eq('owner_user_id', ownerUserId)
        .neq('status', 'deleted');
    if (error) throw error;
}
