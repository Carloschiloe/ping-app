import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import type { DispositionDialogueSnapshot } from '../types/agentTurnDisposition';

type TableClient = { from: (table: string) => any };

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
}

export const agentDialogueCheckpointService = new AgentDialogueCheckpointService();
