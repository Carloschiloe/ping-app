import type { RetrievalPerson } from './retrieval';

export interface PersonResolutionRequest {
    actorUserId: string;
    dialogueScopeKey: string;
    candidate: string;
    semanticSlotType: 'person';
    objectiveContext: 'pending_slot' | 'independent_objective';
}

export type PersonResolutionBindingResult =
    | { status: 'not_applicable' }
    | { status: 'resolved'; person: RetrievalPerson }
    | { status: 'zero_match' }
    | { status: 'ambiguous'; candidates: RetrievalPerson[] }
    | { status: 'invalid' };
