import { z } from 'zod';

// M-3 — Schema estricto para la salida estructurada del LLM Objective
// Interpreter. Mismo principio que agentInterpretation.schema.ts (sección
// 11/48 del ticket M-3): `z.object()` en modo "strip" descarta
// silenciosamente cualquier campo no declarado — el modelo NUNCA puede
// devolver un toolId, un personId/commitmentId/proposalId, ni una decisión
// de riesgo/autorización. Sólo puede sugerir HINTS de texto; Core (el
// planner + el validator) es quien resuelve identidad/entidad/tiempo y
// decide todo lo demás.
const HINT_STRING = z.string().trim().min(1).max(80);

export const AGENT_OBJECTIVE_TYPE_VALUES = [
    'communicate_message',
    'communicate_and_wait',
    'create_commitment_or_proposal',
    'create_personal_commitment',
    'reschedule_existing_commitment',
    'complete_existing_commitment',
    'respond_to_existing_proposal',
    'unsupported',
] as const;

export const agentObjectiveInterpretationPayloadSchema = z.object({
    objectiveType: z.enum(AGENT_OBJECTIVE_TYPE_VALUES),
    personHints: z.array(HINT_STRING).max(5).default([]),
    entityHints: z.array(HINT_STRING).max(5).default([]),
    timeHint: z.string().trim().max(60).nullable().default(null),
    decisionHint: z.enum(['approve', 'reject', 'counter_propose']).nullable().default(null),
    draftOnly: z.boolean().default(false),
    responsibleHint: z.string().trim().max(80).nullable().default(null),
    // Segundo objetivo condicional (sección 17/18: "pregúntale a X si Y, y
    // si acepta, agéndalo") — el modelo puede sugerir que hay un paso de
    // seguimiento, nunca más de uno (acotado, sección 47: los planes son
    // grafos pequeños). Nunca un array libre de "pasos" arbitrarios.
    followUpObjectiveType: z.enum(AGENT_OBJECTIVE_TYPE_VALUES).nullable().default(null),
    // Segunda persona independiente (sección 20: "avísale a Alejandra y
    // Pedro" -> pasos paralelos) — acotado a un solo hint adicional, nunca
    // una lista libre.
    additionalPersonHint: z.string().trim().max(80).nullable().default(null),
    desiredOutcomeHint: z.string().trim().max(200).nullable().default(null),
});

export type AgentObjectiveInterpretationPayload = z.infer<typeof agentObjectiveInterpretationPayloadSchema>;
