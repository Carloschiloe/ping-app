import { z } from 'zod';

// M-1E — Schema estricto para la salida del LLM de síntesis. Nota
// arquitectónica clave (ver docs/M-1E-AGENT-RESPONSE-SYNTHESIS.md, "Answer
// assembly"): el modelo NUNCA produce el `answer` final directamente —
// sólo produce `claims` (hecho + referencias). El backend ENSAMBLA el
// `answer` a partir de los claims que sobreviven la validación contra
// `context.provenance`. Esto evita el problema difícil de "¿esta frase del
// answer corresponde a qué claim?" — si un claim no tiene soporte, se
// descarta completo, y el texto de ese claim nunca llega al usuario porque
// nunca fue parte de una prosa separada e independiente.
//
// `status` NUNCA es parte de este schema — se calcula determinísticamente
// en el backend ANTES de invocar al modelo (sección 6) y sólo se le informa
// al modelo como hecho ya decidido.
const SOURCE_TYPE_VALUES = ['commitment', 'commitment_event', 'message', 'transcription', 'attachment', 'person'] as const;

const citationSchema = z.object({
    sourceType: z.enum(SOURCE_TYPE_VALUES),
    sourceId: z.string().trim().min(1).max(100),
});

const claimSchema = z.object({
    text: z.string().trim().min(1).max(500),
    sourceRefs: z.array(citationSchema).min(1).max(10),
});

export const agentSynthesisPayloadSchema = z.object({
    claims: z.array(claimSchema).max(10).default([]),
});

export type AgentSynthesisPayload = z.infer<typeof agentSynthesisPayloadSchema>;
