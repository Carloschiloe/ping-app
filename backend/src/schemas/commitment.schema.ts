import { z } from 'zod';

const isoDate = () => z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' });

// V2: status es de solo-lectura en la practica para el cliente (la
// transicion real ocurre via los endpoints dedicados /accept, /reject,
// /counter-propose, /resolve, /cancel, /reopen, /action-completed,
// /reassign, que pasan por commitmentTransitions.ts). Se acepta aqui como
// string libre unicamente para no romper al mobile actual, que todavia
// envia `status: 'completed'` en el PATCH generico
// (ver utils/commitmentCompat.ts + commitment.service.ts:updateCommitment,
// que traduce ese valor legacy a la transicion `resolve` real). Nunca se
// escribe a la columna sin pasar por normalizeCommitmentStatus +
// computeCommitmentTransition.
export const createCommitmentSchema = z.object({
    body: z.object({
        title: z.string().min(3).max(255),
        description: z.string().max(2000).optional().nullable(),
        type: z.enum(['task', 'meeting']).optional(),
        due_at: isoDate().optional().nullable(),
        message_id: z.string().uuid().optional().nullable(),
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        counterparty_contact_id: z.string().uuid().optional().nullable(),
        // conversation_id es el campo canonico V2. group_conversation_id /
        // groupConversationId se aceptan como alias legacy de entrada (el
        // mobile actual todavia los envia) — ver commitmentCompat.ts.
        conversation_id: z.string().uuid().optional().nullable(),
        group_conversation_id: z.string().uuid().optional().nullable(),
        is_group_task: z.boolean().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional().nullable(),
        expected_result: z.string().max(2000).optional().nullable(),
        next_action: z.string().max(500).optional().nullable(),
        status: z.string().optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    }).refine(
        (body) => !(body.assigned_to_user_id && body.counterparty_contact_id),
        { message: 'assigned_to_user_id and counterparty_contact_id are mutually exclusive', path: ['counterparty_contact_id'] }
    ),
});

export const updateCommitmentSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        title: z.string().min(3).max(255).optional(),
        description: z.string().max(2000).optional().nullable(),
        type: z.enum(['task', 'meeting']).optional(),
        due_at: isoDate().optional().nullable(),
        status: z.string().optional().nullable(),
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        rejection_reason: z.string().max(2000).optional().nullable(),
        proposed_due_at: isoDate().optional().nullable(),
        priority: z.enum(['low', 'medium', 'high']).optional().nullable(),
        expected_result: z.string().max(2000).optional().nullable(),
        meta: z.record(z.string(), z.any()).optional().nullable(),
    }),
});

export const rejectCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ reason: z.string().max(2000).optional().nullable() }),
});

export const proposalDecisionSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        reason: z.string().min(1).max(2000).optional().nullable(),
    }),
});

export const sharedProposalResponseSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        decision: z.enum(['approve', 'reject', 'counter_propose']),
        reason: z.string().trim().min(1).max(500).optional().nullable(),
        proposedDueAt: isoDate().optional().nullable(),
    }).superRefine((body, ctx) => {
        if (body.decision === 'counter_propose' && !body.proposedDueAt) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'proposedDueAt is required for a counterproposal',
                path: ['proposedDueAt'],
            });
        }
    }),
});

export const resolveCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        result: z.string().trim().min(3).max(2000),
    }),
});

export const cancelCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        reason: z.string().trim().min(3).max(500).optional().nullable(),
    }),
});

export const counterProposeCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ proposedDueAt: isoDate() }),
});

// Alias temporal: mobile (usePostponeCommitment) sigue llamando
// POST /commitments/:id/postpone con { newDate }.
export const postponeCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ newDate: isoDate() }),
});

export const reassignCommitmentSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        counterparty_contact_id: z.string().uuid().optional().nullable(),
    }).refine(
        (body) => !(body.assigned_to_user_id && body.counterparty_contact_id),
        { message: 'assigned_to_user_id and counterparty_contact_id are mutually exclusive', path: ['counterparty_contact_id'] }
    ),
});

export const scheduleFollowUpSchema = z.object({
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        followUpAt: isoDate(),
        nextAction: z.string().max(500).optional().nullable(),
        waitingOnUserId: z.string().uuid().optional().nullable(),
        waitingOnContactId: z.string().uuid().optional().nullable(),
    }),
});
