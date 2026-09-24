import { z } from 'zod';

const TEMPORAL_INTENT_SCHEMA = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('calendar_day'), offsetDays: z.number().int().min(-366).max(366), futureOnly: z.boolean() }),
    z.object({ kind: z.literal('calendar_week'), offsetWeeks: z.number().int().min(-52).max(52), futureOnly: z.boolean() }),
    z.object({ kind: z.literal('relative_days'), daysAhead: z.number().int().min(1).max(366), futureOnly: z.literal(true) }),
    z.object({ kind: z.literal('upcoming_horizon'), daysAhead: z.number().int().min(1).max(366).nullable(), futureOnly: z.literal(true) }),
]);

// M-1D.1 — Schema estricto para la salida estructurada del LLM Input
// Interpreter. Esta es la ÚNICA superficie por la que pasa cualquier
// interpretación generada por un modelo antes de llegar al resto del
// pipeline (sección 6 del ticket).
//
// Garantía de seguridad estructural: `z.object()` en modo "strip" (default
// de zod) DESCARTA silenciosamente cualquier campo no declarado aquí. Si el
// modelo devuelve `personId`, `conversationId`, `commitmentId`,
// `attachmentId` o `userId` — ya sea por error o por un intento de
// inyección de prompt — esos campos JAMÁS llegan al resultado parseado.
// Esto es la aplicación REAL de "el LLM nunca puede devolver un ID
// confiable" (sección 1/5/21), no sólo una instrucción en el prompt.
//
// Arrays acotados (máx. 5) y strings acotados — sección 23: un output
// malicioso o degenerado no puede generar cientos de retrievals.
const HINT_STRING = z.string().trim().min(1).max(80);

export const AGENT_INTENT_VALUES = [
    'commitment_query', 'person_query', 'recall', 'message_search', 'document_search', 'general_context',
] as const;

const RETRIEVAL_SOURCE_VALUES = ['messages', 'commitments', 'commitment_events', 'transcriptions', 'attachments'] as const;
const ATTACHMENT_KIND_VALUES = ['image', 'video', 'audio', 'document'] as const;
const AMBIGUITY_HINT_VALUES = ['unresolved_pronoun', 'time_ambiguous', 'topic_too_broad'] as const;
const TEMPORAL_COMPARISON_VALUES = ['earliest', 'latest'] as const;
const URGENCY_COMPARISON_VALUES = ['most_urgent'] as const;
const FOLLOW_UP_ATTRIBUTE_VALUES = ['time', 'date', 'responsible', 'status', 'details'] as const;

export const agentInterpretationPayloadSchema = z.object({
    intent: z.enum(AGENT_INTENT_VALUES),
    personHints: z.array(HINT_STRING).max(5).default([]),
    topicHints: z.array(HINT_STRING).max(5).default([]),
    textQuery: z.string().trim().max(200).nullable().default(null),
    timeExpression: z.string().trim().max(60).nullable().default(null),
    temporalIntent: TEMPORAL_INTENT_SCHEMA.nullable().default(null),
    priorReferenceIntent: z.enum(['single_entity', 'result_set']).nullable().default(null),
    followUpAttribute: z.enum(FOLLOW_UP_ATTRIBUTE_VALUES).nullable().default(null),
    // Operación semántica, no texto libre. El modelo puede reconocerla en
    // cualquier idioma; Core la combina con su propia normalización y nunca
    // la usa como texto de búsqueda.
    temporalComparison: z.enum(TEMPORAL_COMPARISON_VALUES).nullable().default(null),
    urgencyComparison: z.enum(URGENCY_COMPARISON_VALUES).nullable().default(null),
    requestedSources: z.array(z.enum(RETRIEVAL_SOURCE_VALUES)).max(5).default([]),
    // M-1D.2: certificado contra el modelo real que, cuando no hay filtro de
    // status relevante, a veces devuelve `commitmentFilterHints: null`
    // directamente (en vez de `{status: null}`) — una forma perfectamente
    // razonable de decir "sin filtro" que la primera versión del schema
    // rechazaba por completo (causaba fallback innecesario en ~40% de casos
    // reales). `preprocess` normaliza `null`/ausente a `{}` ANTES de
    // validar el objeto interno, aceptando ambas formas sin ambigüedad de
    // seguridad (sigue siendo un enum acotado, sigue sin aceptar campos
    // extra).
    //
    // M-1D.4: `status` ahora distingue los 3 estados terminales REALES del
    // Commitment Core (`resolved`/`cancelled`/`rejected`, nunca "todos los
    // cerrados son equivalentes") además del genérico `closed` (fallback
    // cuando el usuario dice "cerrado" sin especificar cuál). `statusBasis`
    // es el mecanismo de opt-in explícito (sección 9 del ticket): el modelo
    // debe declarar POR QUÉ está filtrando por estado (`explicit` = palabra
    // de estado literal; `implied` = la frase implica claramente un estado
    // sin nombrarlo, ej. "qué me falta hacer") — si `statusBasis` es null,
    // `status` se descarta enteramente en el mapping (ver
    // agentInputInterpreter.service.ts#mapPayloadToInterpretation), nunca se
    // aplica un filtro que el modelo no pueda justificar. Esto reemplaza el
    // intento fallido de M-1F.1 de detectar esto por keyword-matching
    // determinístico externo (revertido por romper casos de estado
    // implícito legítimos) — la distinción explicit/implied vive DENTRO del
    // mismo juicio del modelo, no en un verificador separado.
    commitmentFilterHints: z.preprocess(
        (value) => value ?? {},
        z.object({
            status: z.enum(['open', 'resolved', 'cancelled', 'rejected', 'closed']).nullable().default(null),
            statusBasis: z.enum(['explicit', 'implied']).nullable().default(null),
        }),
    ).default({ status: null, statusBasis: null }),
    attachmentKindHints: z.array(z.enum(ATTACHMENT_KIND_VALUES)).max(4).default([]),
    ambiguityHints: z.array(z.enum(AMBIGUITY_HINT_VALUES)).max(3).default([]),
    // M-1G.1 — hallazgo real de staging (M-1G-S2): "¿Qué tengo vencido?" no
    // disparaba ningún filtro de status (ni "vencido" ni "overdue" estaban en
    // el vocabulario), y aunque el commitment correcto llegara como
    // evidencia, la síntesis no tenía forma de saber que la pregunta era
    // ESPECÍFICAMENTE sobre vencimiento (vs. "pendientes" en general) para
    // poder garantizar que se mencione. Señal explícita y separada de
    // `commitmentFilterHints` (que ya mapea "vencido" a status "open" — algo
    // vencido siempre es, además, no resuelto): esto sólo indica que el
    // guard determinístico de vencidos (agentResponseSynthesizer) debe
    // activarse.
    wantsOverdueFocus: z.boolean().default(false),
    // M-1H v6 (Gap B del final proposal lifecycle gate) — señal ESTRUCTURADA
    // para el lifecycle de aprobación de una commitment_proposal, nunca
    // textQuery libre (mismo principio que wantsOverdueFocus/status arriba):
    // "waiting_for_others" (el actor ya aprobó, espera a alguien más),
    // "needs_my_response" (al actor le falta responder), o
    // "pending_response_from_person" (pregunta por una persona específica
    // que aún no responde -- debe venir junto con personHints). null cuando
    // la pregunta no es sobre esto.
    proposalFocus: z.enum(['waiting_for_others', 'needs_my_response', 'pending_response_from_person']).nullable().default(null),
    // M-1G.1 — hallazgo real de staging (M-1G-S2, Caso F): "Crea un
    // compromiso para llamar a Alejandra" caía en no_evidence ("no encontré
    // nada relacionado"), técnicamente seguro pero confuso -- el problema
    // real era una petición de escritura, no falta de evidencia. true
    // cuando el texto pide una ACCIÓN (crear/cancelar/enviar/modificar/
    // borrar), nunca cuando sólo pregunta/consulta algo.
    isWriteActionRequest: z.boolean().default(false),
});

export type AgentInterpretationPayload = z.infer<typeof agentInterpretationPayloadSchema>;

// The runtime validator and the provider contract must be generated from the
// same schema.  `json_object` only asks the model for syntactically valid JSON;
// it does not constrain enums, array shapes, or discriminated unions.  That
// gap was the direct cause of certification fallbacks for otherwise usable
// interpretations (`requestedSources` as a scalar, invented `intent` values,
// and malformed temporal variants).
//
// OpenAI's strict JSON-schema response format does not need Zod's local
// defaults and does not accept the dialect marker emitted by Zod, so remove
// only those metadata fields recursively.  Required fields remain required;
// nullable fields express the absence state explicitly.  No semantic values
// are widened here and the Zod parser remains the final Core boundary.
function toProviderJsonSchema(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(toProviderJsonSchema);
    if (!value || typeof value !== 'object') return value;
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
        if (key === '$schema' || key === 'default') continue;
        result[key] = toProviderJsonSchema(child);
    }
    return result;
}

export const agentInterpretationPayloadJsonSchema = toProviderJsonSchema(
    z.toJSONSchema(agentInterpretationPayloadSchema, { target: 'draft-7' }),
) as Record<string, unknown>;
