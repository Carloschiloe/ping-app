import { z } from 'zod';

// M-1F — POST /agent/respond request body.
//
// `actorUserId`/`userId`/`tenantId` deliberadamente NUNCA declarados aquí
// (sección 4/7): incluso si un cliente los manda, el modo "strip" de
// zod (default) los descarta silenciosamente antes de que el controller
// pueda leerlos — la única identidad real viene de `req.user.id`
// (requireAuth), nunca del body.
//
// Límite de `input` (sección 8, decisión documentada — ver
// docs/M-1F-AGENT-ORCHESTRATOR.md, "Input limit"): 2000 caracteres es un
// techo de sanidad a nivel de transporte (evita payloads abusivos/enormes,
// HTTP 400 si se excede) — DISTINTO del truncamiento a 500 caracteres que
// ya hace `LlmInputInterpreter` (M-1D.1) antes de llamar al modelo. Un solo
// punto de rechazo explícito (aquí) y un solo punto de truncamiento ya
// documentado (el interpreter) — nunca dos truncamientos silenciosos en
// capas distintas.
export const agentRequestSchema = z.object({
    body: z.object({
        input: z.string().trim().min(1).max(2000),
        conversationId: z.string().uuid().optional(),
        channel: z.string().trim().max(40).optional(),
        locale: z.string().trim().max(20).optional(),
        timezone: z.string().trim().max(60).optional(),
    }),
});
