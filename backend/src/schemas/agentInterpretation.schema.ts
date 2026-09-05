import { z } from 'zod';

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

export const agentInterpretationPayloadSchema = z.object({
    intent: z.enum(AGENT_INTENT_VALUES),
    personHints: z.array(HINT_STRING).max(5).default([]),
    topicHints: z.array(HINT_STRING).max(5).default([]),
    textQuery: z.string().trim().max(200).nullable().default(null),
    timeExpression: z.string().trim().max(60).nullable().default(null),
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
});

export type AgentInterpretationPayload = z.infer<typeof agentInterpretationPayloadSchema>;
