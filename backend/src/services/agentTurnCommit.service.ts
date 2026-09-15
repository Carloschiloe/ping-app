import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import {
    AGENT_TURN_REPLAY_MAX_BYTES, AGENT_TURN_REPLAY_VERSION,
    type AgentTurnAtomicApplication, type AgentTurnDialogueCheckpoint,
    type AgentTurnReplayV1, type NormalizedSemanticTurn, type NormalizedSemanticTurnV2,
} from '../types/agentTurnCommit';
import type { AgentTurnResult } from '../types/agentTurn';
import { normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';
import type { SemanticCheckpointLoadResult } from '../types/agentTurnOrchestration';

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => any };
type TableClient = { from: (table: string) => any };

function jsonBytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function toAgentTurnReplayV1(result: AgentTurnResult): AgentTurnReplayV1 {
    const { debug: _debug, ...publicResult } = result as AgentTurnResult & { debug?: unknown };
    const replay = publicResult as AgentTurnReplayV1;
    const bytes = jsonBytes(replay);
    if (bytes > AGENT_TURN_REPLAY_MAX_BYTES) {
        throw new AppError(`Agent turn replay exceeds ${AGENT_TURN_REPLAY_MAX_BYTES} bytes`, 500);
    }
    return replay;
}

export function semanticCheckpointFingerprint(turn: NormalizedSemanticTurn): string {
    return createHash('sha256').update(JSON.stringify(turn), 'utf8').digest('hex');
}

export function semanticCheckpointFingerprintV2(turn: NormalizedSemanticTurnV2): string {
    return createHash('sha256').update(JSON.stringify(turn), 'utf8').digest('hex');
}

function mapCheckpoint(row: Record<string, any>): AgentTurnDialogueCheckpoint {
    return {
        actorUserId: row.actor_user_id, dialogueScopeKey: row.dialogue_scope_key,
        lifecycle: row.lifecycle, activeDialogue: row.active_dialogue ?? null,
        suspendedDialogue: row.suspended_dialogue ?? null, version: Number(row.version),
        lastAppliedTurnId: row.last_applied_turn_id ?? null,
        lastAppliedTurnSequence: Number(row.last_applied_turn_sequence ?? 0), expiresAt: row.expires_at,
    };
}

function errorFromRpc(error: { message: string; code?: string } | null): never {
    if (error?.code === 'P0002') throw new AppError('Agent turn admission not found', 404);
    if (error?.code === 'P0003') throw new AppError('Agent turn checkpoint conflict', 409);
    if (error?.code === 'P0004') throw new AppError('Agent turn dialogue CAS conflict', 409);
    if (error?.code === 'P0005') throw new AppError('Agent turn sequence is stale', 409);
    throw new AppError(error?.message ?? 'Agent turn commit failed', 500);
}

export class AgentTurnCommitService {
    public constructor(private readonly client: RpcClient = supabaseAdmin, private readonly tableClient: TableClient = supabaseAdmin) {}

    public async loadSemanticCheckpoint(input: { turnId: string; actorUserId: string; dialogueScopeKey: string; turnSequence?: number }): Promise<SemanticCheckpointLoadResult> {
        const { data, error } = await this.tableClient.from('agent_turn_semantic_checkpoints').select('turn_id, actor_user_id, dialogue_scope_key, turn_sequence, semantic_version, semantic_fingerprint, semantic_turn').eq('turn_id', input.turnId).maybeSingle();
        if (error) throw new AppError(error.message ?? 'Semantic checkpoint load failed', 500);
        if (!data) return { status: 'not_found' };
        if (data.actor_user_id !== input.actorUserId || data.dialogue_scope_key !== input.dialogueScopeKey || (input.turnSequence !== undefined && Number(data.turn_sequence) !== input.turnSequence)) return { status: 'identity_mismatch' };
        if (Number(data.semantic_version) !== 2) return { status: 'unsupported_version', version: Number(data.semantic_version) };
        try {
            const semanticTurn = normalizeSemanticTurnV2(data.semantic_turn);
            return { status: 'found', semanticTurn, turnSequence: Number(data.turn_sequence), fingerprint: data.semantic_fingerprint, version: 2 };
        } catch {
            return { status: 'invalid' };
        }
    }

    public async saveSemanticCheckpoint(input: {
        turnId: string; actorUserId: string; dialogueScopeKey: string;
        turnSequence: number; semanticTurn: NormalizedSemanticTurn;
    }): Promise<NormalizedSemanticTurn> {
        const semanticJson = input.semanticTurn;
        if (jsonBytes(semanticJson) > 32 * 1024) throw new AppError('Semantic checkpoint is too large', 500);
        const { data, error } = await this.client.rpc('save_agent_turn_semantic_checkpoint', {
            p_turn_id: input.turnId, p_actor_user_id: input.actorUserId,
            p_dialogue_scope_key: input.dialogueScopeKey, p_turn_sequence: input.turnSequence,
            p_semantic_version: 1, p_semantic_fingerprint: semanticCheckpointFingerprint(input.semanticTurn),
            p_semantic_turn: semanticJson,
        });
        if (error) errorFromRpc(error);
        const row = Array.isArray(data) ? data[0] : data;
        return row.semantic_turn as NormalizedSemanticTurn;
    }

    public async saveSemanticCheckpointV2(input: {
        turnId: string; actorUserId: string; dialogueScopeKey: string;
        turnSequence: number; semanticTurn: NormalizedSemanticTurnV2;
    }): Promise<NormalizedSemanticTurnV2> {
        const semanticTurn = normalizeSemanticTurnV2(input.semanticTurn);
        const { data, error } = await this.client.rpc('save_agent_turn_semantic_checkpoint', {
            p_turn_id: input.turnId, p_actor_user_id: input.actorUserId,
            p_dialogue_scope_key: input.dialogueScopeKey, p_turn_sequence: input.turnSequence,
            p_semantic_version: 2, p_semantic_fingerprint: semanticCheckpointFingerprintV2(semanticTurn),
            p_semantic_turn: semanticTurn,
        });
        if (error) errorFromRpc(error);
        const row = Array.isArray(data) ? data[0] : data;
        return row.semantic_turn as NormalizedSemanticTurnV2;
    }

    public async applyTurn(input: {
        turnId: string; actorUserId: string; dialogueScopeKey: string;
        turnSequence: number; expectedDialogueVersion: number;
        lifecycle: string; activeDialogue: Record<string, unknown> | null;
        suspendedDialogue: Record<string, unknown> | null; expiresAt: string;
        result: AgentTurnResult;
    }): Promise<AgentTurnAtomicApplication> {
        const replay = toAgentTurnReplayV1(input.result);
        const { data, error } = await this.client.rpc('apply_agent_turn_atomically', {
            p_turn_id: input.turnId, p_actor_user_id: input.actorUserId,
            p_dialogue_scope_key: input.dialogueScopeKey, p_turn_sequence: input.turnSequence,
            p_expected_dialogue_version: input.expectedDialogueVersion,
            p_lifecycle: input.lifecycle, p_active_dialogue: input.activeDialogue,
            p_suspended_dialogue: input.suspendedDialogue, p_expires_at: input.expiresAt,
            p_replay_version: AGENT_TURN_REPLAY_VERSION, p_replay: replay,
        });
        if (error) errorFromRpc(error);
        const row = Array.isArray(data) ? data[0] : data;
        return {
            checkpoint: mapCheckpoint(row), replay: row.replay as AgentTurnReplayV1,
            replayed: Boolean(row.replayed),
        };
    }
}

export const agentTurnCommitService = new AgentTurnCommitService();
