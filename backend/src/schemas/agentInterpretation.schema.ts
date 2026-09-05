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
    commitmentFilterHints: z.preprocess(
        (value) => value ?? {},
        z.object({ status: z.enum(['open', 'closed']).nullable().default(null) }),
    ).default({ status: null }),
    attachmentKindHints: z.array(z.enum(ATTACHMENT_KIND_VALUES)).max(4).default([]),
    ambiguityHints: z.array(z.enum(AMBIGUITY_HINT_VALUES)).max(3).default([]),
});

export type AgentInterpretationPayload = z.infer<typeof agentInterpretationPayloadSchema>;
