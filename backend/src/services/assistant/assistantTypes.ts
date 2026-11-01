// M9 — Ping as an assistant with tools. These are the only shapes the
// assistant loop and its tools share; the data port hides every canonical
// store so the same loop runs against production or an in-memory world.
import type { AgentPlanStep } from '../../types/agentPlan';
import type { AgentExecutionResult } from '../../types/agentExecution';
import type { CanonicalCommitmentStatus } from '../../utils/commitmentStatus';

export interface AssistantCommitment {
    id: string;
    entityType: 'commitment' | 'commitment_proposal';
    title: string;
    dueAt: string | null;
    status: CanonicalCommitmentStatus;
    ownerUserId: string;
    assignedToUserId: string | null;
    /** Proposals only: whether the actor still has to answer it. */
    actorCanRespond?: boolean;
}

export interface AssistantPerson {
    id: string;
    name: string;
    /** Direct conversation with the actor, when one exists. */
    conversationId: string | null;
}

export interface AssistantMessageHit {
    id: string;
    conversationId: string;
    senderName: string;
    content: string;
    createdAt: string;
}

export interface AssistantMemoryHit {
    id: string;
    content: string;
}

export interface CommitmentQuery {
    from?: string;
    to?: string;
    statuses?: CanonicalCommitmentStatus[];
    text?: string;
    personId?: string;
    limit: number;
}

export type ConfirmOutcome =
    | { ok: true; result: AgentExecutionResult }
    | { ok: false; reason: 'not_found' | 'expired' | 'not_pending' | 'failed' };

/**
 * Canonical capabilities the tools may use. Every read is already scoped to
 * the actor; every write goes through a pending action that only an explicit
 * later confirmation can authorize.
 */
export interface AssistantDataPort {
    listCommitments(query: CommitmentQuery): Promise<AssistantCommitment[]>;
    getCommitment(id: string): Promise<AssistantCommitment | null>;
    listProposals(): Promise<AssistantCommitment[]>;
    findPeople(name: string): Promise<AssistantPerson[]>;
    personNames(userIds: string[]): Promise<Record<string, string>>;
    searchMessages(query: { text?: string; conversationId?: string; from?: string; to?: string }): Promise<AssistantMessageHit[]>;
    searchMemory(query: string): Promise<AssistantMemoryHit[]>;
    createPendingAction(input: { steps: AgentPlanStep[]; objectiveType: string; summary: string }): Promise<{ id: string; expiresAt: string }>;
    confirmPendingAction(id: string): Promise<ConfirmOutcome>;
    discardPendingAction(id: string): Promise<boolean>;
}

export type AssistantRefKind = 'commitment' | 'person' | 'action';

export interface AssistantRefEntry {
    ref: string;
    kind: AssistantRefKind;
    id: string;
    label: string;
}

/** A pending write as the conversation remembers it. */
export interface AssistantActionRecord {
    ref: string;
    summary: string;
    state: 'pending' | 'confirmed' | 'discarded' | 'superseded' | 'failed';
}

/** Chat-completions messages replayed as conversation history. */
export type AssistantChatMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string | null; tool_calls?: AssistantToolCall[] }
    | { role: 'tool'; tool_call_id: string; content: string };

export interface AssistantToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

/** What a turn leaves behind for the next one (persisted with the turn). */
export interface AssistantMemory {
    version: 1;
    refs: AssistantRefEntry[];
    actions: AssistantActionRecord[];
    /** This turn's exchange: user text, tool calls/results and the answer. */
    messages: AssistantChatMessage[];
}

export interface AssistantHistory {
    /** Oldest first; each element is one past turn's exchange. */
    turns: AssistantChatMessage[][];
    refs: AssistantRefEntry[];
    actions: AssistantActionRecord[];
}

export interface AssistantToolTrace {
    name: string;
    arguments: Record<string, unknown>;
    ok: boolean;
    /** Set for propose_* calls that created a pending action. */
    proposedAction?: { ref: string; toolId: string; arguments: Record<string, unknown> };
    confirmed?: boolean;
    discarded?: boolean;
}

export interface AssistantTurnOutput {
    answer: string;
    citations: Array<{ sourceType: 'commitment' | 'commitment_proposal' | 'message' | 'memory'; sourceId: string }>;
    memory: AssistantMemory;
    trace: AssistantToolTrace[];
}

export interface AssistantModelResponse {
    content: string | null;
    toolCalls: AssistantToolCall[];
}

export interface AssistantModel {
    readonly modelName: string;
    complete(messages: AssistantChatMessage[], tools: AssistantToolDefinition[]): Promise<AssistantModelResponse>;
}

export interface AssistantToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        strict: true;
    };
}
