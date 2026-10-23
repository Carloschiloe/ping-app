import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import type { DispositionDialogueSnapshot } from '../types/agentTurnDisposition';

type TableClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

export type DialogueCheckpointLoadResult = { status: 'found'; snapshot: DispositionDialogueSnapshot; expiresAt: string } | { status: 'not_found' };

export class AgentDialogueCheckpointService {
    public constructor(private readonly client: TableClient = supabaseAdmin) {}

    public async loadDialogueCheckpoint(input: { actorUserId: string; dialogueScopeKey: string }): Promise<DialogueCheckpointLoadResult> {
        const { data, error } = await this.client.from('agent_dialogue_checkpoints').select('actor_user_id, dialogue_scope_key, lifecycle, active_dialogue, suspended_dialogue, version, last_applied_turn_id, last_applied_turn_sequence, expires_at').eq('actor_user_id', input.actorUserId).eq('dialogue_scope_key', input.dialogueScopeKey).maybeSingle();
        if (error) throw new AppError(error.message ?? 'Dialogue checkpoint load failed', 500);
        if (!data) return { status: 'not_found' };
        return {
            status: 'found', expiresAt: data.expires_at,
            snapshot: { lifecycle: data.lifecycle, activeDialogue: data.active_dialogue ?? null, suspendedDialogue: data.suspended_dialogue ?? null, version: Number(data.version), lastAppliedTurnId: data.last_applied_turn_id ?? null, lastAppliedTurnSequence: Number(data.last_applied_turn_sequence ?? 0) },
        };
    }

    /**
     * Clears only the active dialogue projection for a user scope. The
     * checkpoint row, turn sequence and admission history remain intact so a
     * clear cannot create stale-write or idempotency holes.
     */
    public async resetDialogueCheckpoint(input: { actorUserId: string; dialogueScopeKey: string }): Promise<boolean> {
        if (!this.client.rpc) throw new AppError('Dialogue checkpoint reset is unavailable', 500);
        const { data, error } = await this.client.rpc('reset_agent_dialogue_checkpoint', {
            p_actor_user_id: input.actorUserId,
            p_dialogue_scope_key: input.dialogueScopeKey,
        });
        if (error) throw new AppError(error.message ?? 'Dialogue checkpoint reset failed', 500);
        return data === true;
    }
}

export const agentDialogueCheckpointService = new AgentDialogueCheckpointService();
