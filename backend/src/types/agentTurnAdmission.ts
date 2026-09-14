export type AgentTurnAdmissionStatus = 'accepted' | 'processing' | 'completed' | 'failed';
export type AgentTurnFailureClass = 'retryable' | 'terminal';

export interface AgentTurnAdmissionRequest {
    actorUserId: string;
    dialogueScopeKey: string;
    clientTurnKey?: string;
    semanticRequest: Record<string, unknown>;
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
}

export type AgentTurnProcessingDisposition =
    | { kind: 'claimed'; admission: AgentTurnAdmission }
    | { kind: 'in_flight'; admission: AgentTurnAdmission }
    | { kind: 'completed_replay'; admission: AgentTurnAdmission }
    | { kind: 'terminal_failure'; admission: AgentTurnAdmission };
