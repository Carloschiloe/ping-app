// Production data port for the assistant. Reads reuse the canonical
// retrieval services (same visibility rules as the rest of Ping). Writes are
// agent_authorizations rows created as 'pending'; only confirmPendingAction
// turns one into 'authorized' and hands it to the existing executor.
import { createHash } from 'crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { AppError } from '../../utils/AppError';
import {
    resolveDirectConversation,
    resolvePerson,
    retrieveCommitmentProposals,
    retrieveCommitments,
    retrieveMessages,
    retrieveVisibleCommitmentById,
} from '../retrieval.service';
import { retrieveMemory } from '../memory.service';
import { executeAuthorization } from '../agentExecution.service';
import type { AgentPlanStep } from '../../types/agentPlan';
import type { RetrievalCommitment } from '../../types/retrieval';
import type {
    AssistantCommitment,
    AssistantDataPort,
    AssistantMessageHit,
    AssistantMemoryHit,
    AssistantPerson,
    CommitmentQuery,
    ConfirmOutcome,
} from './assistantTypes';

const PENDING_TTL_MS = 10 * 60 * 1000;

function toAssistantCommitment(row: RetrievalCommitment): AssistantCommitment {
    return {
        id: row.id,
        entityType: row.entityType,
        title: row.title,
        dueAt: row.entityType === 'commitment_proposal' ? (row.proposedDueAt ?? row.dueAt) : row.dueAt,
        status: row.status,
        ownerUserId: row.ownerUserId,
        assignedToUserId: row.assignedToUserId,
        actorCanRespond: row.actorCanRespond,
    };
}

function confirmationLevel(steps: AgentPlanStep[]): string {
    const order = ['none', 'implicit', 'explicit', 'strong_explicit'];
    return steps.reduce<string>((max, step) => (
        order.indexOf(step.confirmationRequirement) > order.indexOf(max) ? step.confirmationRequirement : max
    ), 'explicit');
}

export class SupabaseAssistantDataPort implements AssistantDataPort {
    public constructor(
        private readonly actorUserId: string,
        private readonly now: () => Date = () => new Date(),
        private readonly traceId?: string,
    ) {}

    async listCommitments(query: CommitmentQuery): Promise<AssistantCommitment[]> {
        const rows = await retrieveCommitments({
            actorUserId: this.actorUserId,
            now: this.now().toISOString(),
            query: query.text,
            personId: query.personId,
            statuses: query.statuses,
            timeRange: query.from || query.to ? { from: query.from, to: query.to } : undefined,
            orderByDueAtFirst: !query.text,
        }, query.limit);
        return rows.map(toAssistantCommitment);
    }

    async getCommitment(id: string): Promise<AssistantCommitment | null> {
        const row = await retrieveVisibleCommitmentById(this.actorUserId, id);
        return row ? toAssistantCommitment(row) : null;
    }

    async listProposals(): Promise<AssistantCommitment[]> {
        const rows = await retrieveCommitmentProposals({ actorUserId: this.actorUserId, now: this.now().toISOString() }, 40);
        return rows.map(toAssistantCommitment);
    }

    async findPeople(name: string): Promise<AssistantPerson[]> {
        const resolution = await resolvePerson(this.actorUserId, { name });
        const candidates = (resolution.resolved ? [resolution.resolved] : resolution.candidates)
            .filter((person) => person.kind === 'user' && person.id !== this.actorUserId)
            .slice(0, 5);
        return Promise.all(candidates.map(async (person) => {
            const direct = await resolveDirectConversation(this.actorUserId, person.id);
            return { id: person.id, name: person.displayName, conversationId: direct.ambiguous ? null : direct.conversationId };
        }));
    }

    async personNames(userIds: string[]): Promise<Record<string, string>> {
        const ids = [...new Set(userIds)].filter(Boolean);
        if (!ids.length) return {};
        const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', ids);
        if (error) throw new AppError(error.message, 500);
        return Object.fromEntries((data ?? []).map((row: any) => [row.id, row.full_name || 'alguien']));
    }

    async searchMessages(query: { text?: string; conversationId?: string; from?: string; to?: string }): Promise<AssistantMessageHit[]> {
        const rows = await retrieveMessages({
            actorUserId: this.actorUserId,
            query: query.text,
            conversationId: query.conversationId,
            timeRange: query.from || query.to ? { from: query.from, to: query.to } : undefined,
        }, 15);
        const names = await this.personNames(rows.map((row) => row.senderId ?? '').filter(Boolean));
        return rows
            .filter((row) => !row.isSystem && row.content)
            .map((row) => ({
                id: row.id,
                conversationId: row.conversationId,
                senderName: row.senderId === this.actorUserId ? 'tú' : names[row.senderId ?? ''] ?? 'alguien',
                content: row.content!,
                createdAt: row.createdAt,
            }));
    }

    async searchMemory(query: string): Promise<AssistantMemoryHit[]> {
        const rows = await retrieveMemory({
            ownerUserId: this.actorUserId,
            subjectPersonId: null,
            subjectContactId: null,
            topicQuery: query,
            timeRange: null,
            memoryTypes: null,
            sourceTypes: null,
            freshness: 'current',
            limit: 10,
        }, this.traceId);
        return rows.map((row) => ({ id: row.id, content: row.canonicalText }));
    }

    async createPendingAction(input: { steps: AgentPlanStep[]; objectiveType: string; summary: string }): Promise<{ id: string; expiresAt: string }> {
        const now = this.now();
        const expiresAt = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
        const digest = createHash('sha256')
            .update(JSON.stringify({ actor: this.actorUserId, objectiveType: input.objectiveType, steps: input.steps }))
            .digest('hex');
        const { data, error } = await supabaseAdmin
            .from('agent_authorizations')
            .insert({
                actor_user_id: this.actorUserId,
                plan_digest: digest,
                objective_type: input.objectiveType,
                frozen_steps: input.steps,
                authorized_step_ids: input.steps.map((step) => step.stepId),
                confirmation_level: confirmationLevel(input.steps),
                status: 'pending',
                issued_at: now.toISOString(),
                expires_at: expiresAt,
                trace_id: this.traceId ?? null,
            })
            .select('id, expires_at')
            .single();
        if (error) throw new AppError(error.message, 500);
        return { id: data.id, expiresAt: data.expires_at };
    }

    async confirmPendingAction(id: string): Promise<ConfirmOutcome> {
        const now = this.now();
        // Compare-and-set: only a live pending row of this actor becomes
        // authorized, so a repeated "sí" cannot execute twice.
        const { data, error } = await supabaseAdmin
            .from('agent_authorizations')
            .update({ status: 'authorized', issued_at: now.toISOString(), expires_at: new Date(now.getTime() + PENDING_TTL_MS).toISOString() })
            .eq('id', id)
            .eq('actor_user_id', this.actorUserId)
            .eq('status', 'pending')
            .gt('expires_at', now.toISOString())
            .select('id')
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!data) {
            const { data: row } = await supabaseAdmin
                .from('agent_authorizations')
                .select('status, expires_at')
                .eq('id', id)
                .eq('actor_user_id', this.actorUserId)
                .maybeSingle();
            if (!row) return { ok: false, reason: 'not_found' };
            return { ok: false, reason: row.status === 'pending' ? 'expired' : 'not_pending' };
        }
        try {
            const result = await executeAuthorization({ authorizationId: id, actorUserId: this.actorUserId, traceId: this.traceId });
            return { ok: true, result };
        } catch (executionError: any) {
            console.warn('[Assistant] Confirmed action failed to execute', { message: executionError?.message ?? String(executionError) });
            return { ok: false, reason: 'failed' };
        }
    }

    async discardPendingAction(id: string): Promise<boolean> {
        const { data, error } = await supabaseAdmin
            .from('agent_authorizations')
            .update({ status: 'revoked', revoked_at: this.now().toISOString() })
            .eq('id', id)
            .eq('actor_user_id', this.actorUserId)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        return Boolean(data);
    }
}
