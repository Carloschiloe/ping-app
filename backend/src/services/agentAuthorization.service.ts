// Reads durable AgentAuthorization rows. The assistant creates them as
// pending actions and authorizes them only after the user's explicit
// confirmation (see assistant/assistantSupabasePort.ts); execution reads the
// row back here, always scoped to its actor.
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import type { AgentAuthorization, AgentAuthorizationStatus } from '../types/agentExecution';

function rowToAuthorization(row: any): AgentAuthorization {
    return {
        id: row.id,
        actorUserId: row.actor_user_id,
        planDigest: row.plan_digest,
        objectiveType: row.objective_type,
        frozenSteps: row.frozen_steps,
        authorizedStepIds: row.authorized_step_ids,
        confirmationLevel: row.confirmation_level,
        status: row.status as AgentAuthorizationStatus,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        revokedAt: row.revoked_at,
        traceId: row.trace_id,
    };
}

export async function getAuthorizationById(authorizationId: string, actorUserId: string): Promise<AgentAuthorization | null> {
    const { data, error } = await supabaseAdmin
        .from('agent_authorizations')
        .select('*')
        .eq('id', authorizationId)
        .eq('actor_user_id', actorUserId)
        .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) return null;
    return rowToAuthorization(data);
}
