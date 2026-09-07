import { z } from 'zod';

// M-4 — POST /agent/execute request body. Input is ONLY an authorization
// reference (sección 38) — never arbitrary tool args, never a toolId, never
// a target entity. Core loads the already-authorized, already-frozen plan
// snapshot by this id and executes exactly that — no direct model access
// during execution (sección 39).
export const agentExecuteRequestSchema = z.object({
    body: z.object({
        authorizationId: z.string().uuid(),
    }),
});
