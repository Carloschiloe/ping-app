import type { TemporalCoreResult } from './temporalCore.service';
import type { AgentTurnDisposition } from '../types/agentTurnDisposition';
import type { NormalizedSemanticTurnV3 } from '../types/agentTurnCommit';
import type { PersonResolutionResult, RetrievalResult, RetrieveContextInput } from '../types/retrieval';

export type V3ReadScope = Pick<RetrieveContextInput, 'conversationId' | 'personId' | 'contactId' | 'query' | 'timeRange' | 'types' | 'statuses' | 'orderByOverdueFirst'>;

export type V3ReadPreparationInput = {
    actorUserId: string;
    dialogueScopeKey: string;
    semanticTurn: NormalizedSemanticTurnV3;
    disposition: AgentTurnDisposition;
    person: PersonResolutionResult | null;
    temporal: TemporalCoreResult;
    scope: V3ReadScope;
    now?: string;
};

export type V3ReadPreparationResult =
    | { status: 'prepared'; request: RetrieveContextInput; result: RetrievalResult }
    | { status: 'insufficient'; reason: 'person_resolution' | 'temporal_context' | 'retrieval_scope' }
    | { status: 'unsupported'; reason: 'disposition' | 'semantic_shape' | 'temporal_shape' }
    | { status: 'not_applicable'; reason: 'not_a_read' };

export type V3ReadRetriever = (request: RetrieveContextInput) => Promise<RetrievalResult>;

function isReadSemantic(turn: NormalizedSemanticTurnV3): boolean {
    return turn.kind === 'read_request' || turn.kind === 'slot_answer';
}

function hasSupportedScope(scope: V3ReadScope): boolean {
    return Boolean(scope.conversationId || scope.personId || scope.contactId || scope.query || scope.timeRange || scope.types?.length || scope.statuses?.length);
}

function temporalAllowsRead(temporal: TemporalCoreResult): boolean {
    return temporal.status === 'not_applicable' || (temporal.status === 'resolved' && temporal.value.kind === 'civil_date');
}

export async function prepareV3Read(input: V3ReadPreparationInput, retrieve: V3ReadRetriever): Promise<V3ReadPreparationResult> {
    if (input.disposition !== 'ordinary_read') return { status: 'not_applicable', reason: 'not_a_read' };
    if (!isReadSemantic(input.semanticTurn)) return { status: 'unsupported', reason: 'semantic_shape' };
    if (!hasSupportedScope(input.scope)) return { status: 'insufficient', reason: 'retrieval_scope' };
    if (!temporalAllowsRead(input.temporal)) {
        return input.temporal.status === 'ambiguous' || input.temporal.status === 'nonexistent_local_time' || input.temporal.status === 'insufficient'
            ? { status: 'insufficient', reason: 'temporal_context' }
            : { status: 'unsupported', reason: 'temporal_shape' };
    }
    if (input.temporal.status === 'resolved' && input.temporal.value.kind === 'civil_date' && !input.scope.timeRange) {
        return { status: 'insufficient', reason: 'temporal_context' };
    }
    if (input.person?.ambiguous || (input.person && !input.person.resolved && input.person.candidates.length > 0)) return { status: 'insufficient', reason: 'person_resolution' };
    if (input.scope.personId && (!input.person?.resolved || input.person.resolved.id !== input.scope.personId)) return { status: 'insufficient', reason: 'person_resolution' };
    if (input.person?.resolved?.kind === 'user' && input.scope.contactId) return { status: 'insufficient', reason: 'person_resolution' };
    if (input.person?.resolved?.kind === 'contact' && input.scope.personId) return { status: 'insufficient', reason: 'person_resolution' };

    const request: RetrieveContextInput = {
        actorUserId: input.actorUserId,
        now: input.now,
        ...input.scope,
        // A resolved person is canonical; no lexical replacement is allowed.
        ...(input.person?.resolved?.kind === 'user' ? { personId: input.person.resolved.id } : {}),
        ...(input.person?.resolved?.kind === 'contact' ? { contactId: input.person.resolved.id } : {}),
    };
    return { status: 'prepared', request, result: await retrieve(request) };
}
