export type AgentTurnAdmissionStatus = 'accepted' | 'processing' | 'completed' | 'failed';
export type AgentTurnFailureClass = 'retryable' | 'terminal';
export type AgentTurnRoutingMode = 'legacy' | 'read_v4_exact_count';

export interface AgentTurnAdmissionRequest {
    actorUserId: string;
    dialogueScopeKey: string;
    clientTurnKey?: string;
    semanticRequest: Record<string, unknown>;
    /** Selected by the server-side boundary; omitted only for historical/legacy callers. */
    routingMode?: AgentTurnRoutingMode;
    traceId?: string;
}

export interface AgentTurnAdmission {
    turnId: string;
    actorUserId: string;
    dialogueScopeKey: string;
    clientTurnKey: string | null;
    requestFingerprint: string;
    turnSequence: number;
    status: AgentTurnAdmissionStatus;
    failureClass: AgentTurnFailureClass | null;
    resultRef: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    expiresAt: string;
    idempotentReplay: boolean;
    /** NULL means a historical admission created before routing modes existed. */
    routingMode: AgentTurnRoutingMode | null;
    /** DB-created admission time; immutable reference for relative semantics. */
    turnReferenceInstant?: string;
}

export type AgentTurnProcessingDisposition =
    | { kind: 'claimed'; admission: AgentTurnAdmission }
    | { kind: 'in_flight'; admission: AgentTurnAdmission }
    | { kind: 'completed_replay'; admission: AgentTurnAdmission }
    | { kind: 'terminal_failure'; admission: AgentTurnAdmission };
