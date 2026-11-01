// In-memory world for the M9 assistant bench and offline tests. It behaves
// like the canonical stores the production data port wraps: actor-scoped
// reads, and writes only through confirmed pending actions.
import { randomUUID } from 'node:crypto';
import type {
    AssistantCommitment,
    AssistantDataPort,
    AssistantMemoryHit,
    AssistantMessageHit,
    AssistantPerson,
    CommitmentQuery,
    ConfirmOutcome,
} from '../../src/services/assistant/assistantTypes';
import type { AgentPlanStep } from '../../src/types/agentPlan';
import {
    BENCH_ACTOR,
    BENCH_COMMITMENTS,
    BENCH_MEMORY,
    BENCH_MESSAGES,
    BENCH_PEOPLE,
} from '../fixtures/m9AssistantBench';

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (value: string) => fold(value).split(/[^a-z0-9ñ]+/).filter((word) => word.length >= 3);

export interface BenchPendingAction { id: string; steps: AgentPlanStep[]; state: 'pending' | 'authorized' | 'revoked' }

export class BenchWorld implements AssistantDataPort {
    public commitments: AssistantCommitment[];
    public readonly pending = new Map<string, BenchPendingAction>();
    public readonly executed: AgentPlanStep[] = [];
    public readonly sentMessages: Array<{ conversationId: string; content: string }> = [];
    public readonly remembered: string[] = [];

    public constructor() {
        this.commitments = BENCH_COMMITMENTS.map((item) => ({
            id: item.id, entityType: item.entityType, title: item.title, dueAt: item.dueAt, status: item.status,
            ownerUserId: item.ownerUserId, assignedToUserId: item.assignedToUserId, actorCanRespond: item.actorCanRespond,
        }));
    }

    async listCommitments(query: CommitmentQuery): Promise<AssistantCommitment[]> {
        return this.commitments.filter((item) => {
            if (query.statuses && !query.statuses.includes(item.status)) return false;
            if ((query.from || query.to) && !item.dueAt) return false;
            if (query.from && item.dueAt! < query.from) return false;
            if (query.to && item.dueAt! >= query.to) return false;
            if (query.personId && item.ownerUserId !== query.personId && item.assignedToUserId !== query.personId) return false;
            if (query.text) {
                const title = fold(item.title);
                if (!words(query.text).every((word) => title.includes(word))) return false;
            }
            return true;
        }).slice(0, query.limit);
    }

    async getCommitment(id: string): Promise<AssistantCommitment | null> {
        return this.commitments.find((item) => item.id === id) ?? null;
    }

    async listProposals(): Promise<AssistantCommitment[]> {
        return this.commitments.filter((item) => item.entityType === 'commitment_proposal' && item.status === 'proposed');
    }

    async findPeople(name: string): Promise<AssistantPerson[]> {
        const wanted = words(name);
        return BENCH_PEOPLE
            .filter((person) => wanted.some((word) => fold(person.name).includes(word)))
            .map((person) => ({ id: person.id, name: person.name, conversationId: person.conversationId }));
    }

    async personNames(userIds: string[]): Promise<Record<string, string>> {
        return Object.fromEntries(BENCH_PEOPLE.filter((person) => userIds.includes(person.id)).map((person) => [person.id, person.name]));
    }

    async searchMessages(query: { text?: string; conversationId?: string }): Promise<AssistantMessageHit[]> {
        const wanted = query.text ? words(query.text) : [];
        return BENCH_MESSAGES
            .filter((message) => !query.conversationId || message.conversationId === query.conversationId)
            .filter((message) => wanted.length === 0 || wanted.some((word) => fold(message.content).includes(word)))
            .map((message) => ({
                id: message.id, conversationId: message.conversationId, content: message.content, createdAt: message.createdAt,
                senderName: BENCH_PEOPLE.find((person) => person.id === message.senderId)?.name ?? 'Tú',
            }));
    }

    async searchMemory(query: string): Promise<AssistantMemoryHit[]> {
        const wanted = words(query);
        return BENCH_MEMORY.filter((fact) => wanted.length === 0 || wanted.some((word) => fold(fact.content).includes(word)));
    }

    async createPendingAction(input: { steps: AgentPlanStep[] }): Promise<{ id: string; expiresAt: string }> {
        const id = randomUUID();
        this.pending.set(id, { id, steps: input.steps, state: 'pending' });
        return { id, expiresAt: new Date(Date.now() + 600_000).toISOString() };
    }

    async confirmPendingAction(id: string): Promise<ConfirmOutcome> {
        const action = this.pending.get(id);
        if (!action) return { ok: false, reason: 'not_found' };
        if (action.state !== 'pending') return { ok: false, reason: 'not_pending' };
        action.state = 'authorized';
        for (const step of action.steps) this.apply(step);
        return {
            ok: true,
            result: {
                authorizationId: id, status: 'done', executedSteps: [], failedSteps: [], waitingSteps: [],
                createdEntityRefs: [], updatedEntityRefs: [], messagesSent: 0, requiresFurtherAuthorization: false,
                humanReadableSummary: 'done',
            },
        };
    }

    async discardPendingAction(id: string): Promise<boolean> {
        const action = this.pending.get(id);
        if (!action || action.state !== 'pending') return false;
        action.state = 'revoked';
        return true;
    }

    private apply(step: AgentPlanStep): void {
        this.executed.push(step);
        const args = step.arguments as Record<string, any>;
        const target = this.commitments.find((item) => item.id === args.commitmentId || item.id === args.proposalId);
        switch (step.toolId) {
            case 'create_commitment':
                this.commitments.push({
                    id: randomUUID(), entityType: 'commitment', title: args.title, dueAt: args.dueAt, status: 'accepted',
                    ownerUserId: BENCH_ACTOR, assignedToUserId: args.responsiblePersonId ?? BENCH_ACTOR,
                });
                break;
            case 'reschedule_commitment': if (target) target.dueAt = args.newDueAt; break;
            case 'complete_commitment': if (target) target.status = 'resolved'; break;
            case 'cancel_commitment': if (target) target.status = 'cancelled'; break;
            case 'edit_commitment': if (target) target.title = args.title; break;
            case 'respond_to_proposal': if (target) target.status = args.decision === 'approve' ? 'accepted' : 'rejected'; break;
            case 'send_message': this.sentMessages.push({ conversationId: args.conversationId, content: args.content }); break;
            case 'remember_fact': this.remembered.push(args.factContent); break;
        }
    }
}
