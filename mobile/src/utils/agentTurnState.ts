import type {
    AgentAuthorizationResult,
    AgentExecutionResult,
    AgentTurnInput,
    AgentTurnPlan,
    AgentTurnResult,
} from '../api/query-modules/agent';

export type AgentTurnUiPhase =
    | 'idle'
    | 'submitting'
    | 'response'
    | 'plan_ready'
    | 'clarification'
    | 'unsupported'
    | 'authorizing'
    | 'executing'
    | 'done'
    | 'partially_done'
    | 'waiting'
    | 'blocked'
    | 'needs_reauthorization'
    | 'failed';

export interface PendingAgentPlan {
    turn: AgentTurnPlan;
    source: AgentTurnInput;
    sourceText: string;
}

export interface AgentTurnUiState {
    phase: AgentTurnUiPhase;
    pendingPlan: PendingAgentPlan | null;
    authorization: AgentAuthorizationResult | null;
    execution: AgentExecutionResult | null;
    errorMessage: string | null;
}

export const initialAgentTurnUiState: AgentTurnUiState = {
    phase: 'idle',
    pendingPlan: null,
    authorization: null,
    execution: null,
    errorMessage: null,
};

export type AgentTurnUiEvent =
    | { type: 'SUBMIT'; source: AgentTurnInput; sourceText: string }
    | { type: 'TURN_RESULT'; result: AgentTurnResult; source: AgentTurnInput; sourceText: string }
    | { type: 'CONFIRM' }
    | { type: 'AUTHORIZED'; authorization: AgentAuthorizationResult }
    | { type: 'EXECUTION_RESULT'; execution: AgentExecutionResult }
    | { type: 'CANCEL_PLAN' }
    | { type: 'SOURCE_EDITED' }
    | { type: 'FAIL'; message: string; failureCode?: string; status?: number | null };

const REAUTHORIZATION_CODES = new Set([
    'authorization_expired',
    'authorization_revoked',
    'authorization_mismatch',
    'plan_changed',
    'entity_changed',
    'invalid_lifecycle',
]);

const BLOCKED_CODES = new Set([
    'not_authorized',
    'policy_blocked',
    'tool_not_executable',
    'authorization_missing',
]);

export function classifyAgentFailure(failureCode?: string, status?: number | null): 'blocked' | 'needs_reauthorization' | 'failed' {
    if (failureCode && REAUTHORIZATION_CODES.has(failureCode)) return 'needs_reauthorization';
    if (failureCode && BLOCKED_CODES.has(failureCode)) return 'blocked';
    if (status === 409 || status === 410) return 'needs_reauthorization';
    if (status === 403 || status === 404 || status === 422) return 'blocked';
    return 'failed';
}

export function reduceAgentTurnUi(state: AgentTurnUiState, event: AgentTurnUiEvent): AgentTurnUiState {
    switch (event.type) {
        case 'SUBMIT':
            return { ...initialAgentTurnUiState, phase: 'submitting' };
        case 'TURN_RESULT': {
            if (event.result.kind === 'plan') {
                return {
                    phase: 'plan_ready',
                    pendingPlan: { turn: event.result, source: event.source, sourceText: event.sourceText },
                    authorization: null,
                    execution: null,
                    errorMessage: null,
                };
            }
            return {
                ...initialAgentTurnUiState,
                phase: event.result.kind,
            };
        }
        case 'CONFIRM':
            if (state.phase !== 'plan_ready' || !state.pendingPlan) return state;
            return { ...state, phase: 'authorizing', errorMessage: null };
        case 'AUTHORIZED':
            if (state.phase !== 'authorizing' || !state.pendingPlan) return state;
            return { ...state, phase: 'executing', authorization: event.authorization };
        case 'EXECUTION_RESULT':
            if (state.phase !== 'executing') return state;
            return { ...state, phase: event.execution.status, execution: event.execution };
        case 'CANCEL_PLAN':
        case 'SOURCE_EDITED':
            if (!state.pendingPlan || !['plan_ready', 'authorizing'].includes(state.phase)) return state;
            if (state.phase === 'authorizing') return state;
            return initialAgentTurnUiState;
        case 'FAIL':
            return {
                ...state,
                phase: classifyAgentFailure(event.failureCode, event.status),
                errorMessage: event.message,
            };
    }
}

export function canConfirmAgentPlan(state: AgentTurnUiState): boolean {
    return state.phase === 'plan_ready'
        && !!state.pendingPlan
        && state.pendingPlan.turn.presentation.requiresExplicitConfirmation
        && Date.parse(state.pendingPlan.turn.presentation.expiresAt) > Date.now();
}

export function isAgentTurnBusy(state: AgentTurnUiState): boolean {
    return state.phase === 'submitting' || state.phase === 'authorizing' || state.phase === 'executing';
}

export async function authorizeThenExecuteAgentPlan(
    pending: PendingAgentPlan,
    dependencies: {
        authorize: (pendingPlan: PendingAgentPlan) => Promise<AgentAuthorizationResult>;
        execute: (authorizationId: string) => Promise<AgentExecutionResult>;
        onAuthorized?: (authorization: AgentAuthorizationResult) => void;
    },
): Promise<{ authorization: AgentAuthorizationResult; execution: AgentExecutionResult }> {
    const authorization = await dependencies.authorize(pending);
    dependencies.onAuthorized?.(authorization);
    const execution = await dependencies.execute(authorization.authorizationId);
    return { authorization, execution };
}
