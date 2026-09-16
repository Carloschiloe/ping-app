import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import type {
    AgentTurnAdmission, AgentTurnAdmissionRequest, AgentTurnFailureClass,
    AgentTurnProcessingDisposition,
} from '../types/agentTurnAdmission';

type RpcClient = {
    // Supabase's RPC builder is thenable rather than typed as a native
    // Promise; keeping this narrow adapter boundary structural also permits
    // deterministic unit-test doubles.
    rpc: (name: string, args: Record<string, unknown>) => any;
};

function normalizeForFingerprint(value: unknown): unknown {
    if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n?/g, '\n');
    if (Array.isArray(value)) return value.map(normalizeForFingerprint);
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
            const child = (value as Record<string, unknown>)[key];
            if (child !== undefined) result[key] = normalizeForFingerprint(child);
            return result;
        }, {});
    }
    return value;
}

export function canonicalAgentTurnFingerprint(semanticRequest: Record<string, unknown>): string {
    const canonical = JSON.stringify(normalizeForFingerprint(semanticRequest));
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function mapRow(row: Record<string, any>): AgentTurnAdmission {
    return {
        turnId: row.turn_id, actorUserId: row.actor_user_id, dialogueScopeKey: row.dialogue_scope_key,
        clientTurnKey: row.client_turn_key ?? null, requestFingerprint: row.request_fingerprint,
        turnSequence: Number(row.turn_sequence), status: row.status, failureClass: row.failure_class ?? null,
        resultRef: row.result_ref ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
        completedAt: row.completed_at ?? null, expiresAt: row.expires_at,
        idempotentReplay: Boolean(row.idempotent_replay), routingMode: row.routing_mode ?? null, turnReferenceInstant: row.created_at,
    };
}

function rpcError(error: { message: string; code?: string } | null): never {
    if (error?.code === 'P0003') throw new AppError('Agent turn idempotency conflict', 409);
    if (error?.code === 'P0002') throw new AppError('Agent turn admission not found', 404);
    if (error?.code === '42501') throw new AppError('Agent turn admission scope mismatch', 403);
    throw new AppError(error?.message ?? 'Agent turn admission failed', 500);
}

export class AgentTurnAdmissionService {
    public constructor(private readonly client: RpcClient = supabaseAdmin) {}

    public async admit(request: AgentTurnAdmissionRequest): Promise<AgentTurnAdmission> {
        const fingerprint = canonicalAgentTurnFingerprint(request.semanticRequest);
        const rpcName = request.routingMode ? 'admit_agent_turn_with_routing_mode' : 'admit_agent_turn';
        const args: Record<string, unknown> = {
            p_actor_user_id: request.actorUserId,
            p_dialogue_scope_key: request.dialogueScopeKey,
            p_client_turn_key: request.clientTurnKey ?? null,
            p_request_fingerprint: fingerprint,
        };
        if (request.routingMode) args.p_routing_mode = request.routingMode;
        const { data, error } = await this.client.rpc(rpcName, args);
        if (error) rpcError(error);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new AppError('Agent turn admission returned no record', 500);
        return mapRow(row as Record<string, any>);
    }

    public async claimForProcessing(admission: AgentTurnAdmission): Promise<AgentTurnProcessingDisposition> {
        const { data, error } = await this.client.rpc('claim_agent_turn_admission', {
            p_turn_id: admission.turnId, p_actor_user_id: admission.actorUserId,
            p_dialogue_scope_key: admission.dialogueScopeKey,
        });
        if (error) rpcError(error);
        const row = mapRow(data as Record<string, any>);
        if (row.status === 'processing') return { kind: admission.status === 'accepted' || admission.status === 'failed' ? 'claimed' : 'in_flight', admission: row };
        if (row.status === 'completed') return { kind: 'completed_replay', admission: row };
        return { kind: 'terminal_failure', admission: row };
    }

    public async complete(admission: AgentTurnAdmission, resultRef: Record<string, unknown>): Promise<AgentTurnAdmission> {
        const { data, error } = await this.client.rpc('complete_agent_turn_admission', {
            p_turn_id: admission.turnId, p_actor_user_id: admission.actorUserId,
            p_dialogue_scope_key: admission.dialogueScopeKey, p_result_ref: resultRef,
        });
        if (error) rpcError(error);
        return mapRow(data as Record<string, any>);
    }

    public async fail(admission: AgentTurnAdmission, failureClass: AgentTurnFailureClass, resultRef?: Record<string, unknown>): Promise<AgentTurnAdmission> {
        const { data, error } = await this.client.rpc('fail_agent_turn_admission', {
            p_turn_id: admission.turnId, p_actor_user_id: admission.actorUserId,
            p_dialogue_scope_key: admission.dialogueScopeKey, p_failure_class: failureClass,
            p_result_ref: resultRef ?? null,
        });
        if (error) rpcError(error);
        return mapRow(data as Record<string, any>);
    }
}

export const agentTurnAdmissionService = new AgentTurnAdmissionService();
