import type { AgentTurnResult } from './agentTurn';

export const AGENT_TURN_REPLAY_VERSION = 1 as const;
export const AGENT_TURN_REPLAY_MAX_BYTES = 128 * 1024;

// Normalized, bounded Core input. Provider responses, prompts and raw source
// utterances are deliberately absent; this is a checkpoint, not memory.
export interface NormalizedSemanticTurn {
    intentType: string;
    objectiveType: string | null;
    entityHints: string[];
    slots: Record<string, string | number | boolean | null>;
    ambiguityFields: string[];
    confidence: number;
    source: 'deterministic' | 'llm' | 'fallback';
}

export interface AgentTurnReplayV1 {
    kind: AgentTurnResult['kind'];
    response?: Extract<AgentTurnResult, { kind: 'response' }>['response'];
    questions?: Extract<AgentTurnResult, { kind: 'clarification' }>['questions'];
    partialResponse?: Extract<AgentTurnResult, { kind: 'clarification' }>['partialResponse'];
    plan?: Extract<AgentTurnResult, { kind: 'plan' }>['plan'];
    presentation?: Extract<AgentTurnResult, { kind: 'plan' }>['presentation'];
    reason?: Extract<AgentTurnResult, { kind: 'unsupported' }>['reason'];
    supportedExamples?: Extract<AgentTurnResult, { kind: 'unsupported' }>['supportedExamples'];
}

export interface AgentTurnDialogueCheckpoint {
    actorUserId: string;
    dialogueScopeKey: string;
    lifecycle: string;
    activeDialogue: Record<string, unknown> | null;
    suspendedDialogue: Record<string, unknown> | null;
    version: number;
    lastAppliedTurnId: string | null;
    lastAppliedTurnSequence: number;
    expiresAt: string;
}

export interface AgentTurnAtomicApplication {
    checkpoint: AgentTurnDialogueCheckpoint;
    replay: AgentTurnReplayV1;
    replayed: boolean;
}
