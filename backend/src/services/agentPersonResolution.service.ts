import { resolvePerson } from './retrieval.service';
import type { NormalizedSemanticTurnV2 } from '../types/agentTurnCommit';
import type { DispositionDialogueSnapshot } from '../types/agentTurnDisposition';
import type { PersonResolutionBindingResult, PersonResolutionRequest } from '../types/agentPersonResolution';

export interface PersonResolutionInvoker {
    resolve(actorUserId: string, input: { name: string }): Promise<Awaited<ReturnType<typeof resolvePerson>>>;
}

const canonicalInvoker: PersonResolutionInvoker = { resolve: resolvePerson };

function candidateFromSemantic(turn: NormalizedSemanticTurnV2): string | null {
    if (turn.candidateSlotType !== 'person') return null;
    const slot = turn.slots.person ?? turn.slots.recipient;
    if (typeof slot === 'string' && slot.trim()) return slot.trim();
    const hint = turn.entityHints.find(value => value.trim().length > 0);
    return hint?.trim() ?? null;
}

export class AgentPersonResolutionService {
    public constructor(private readonly invoker: PersonResolutionInvoker = canonicalInvoker) {}

    public async resolveFromSemantic(input: { actorUserId: string; dialogueScopeKey: string; semanticTurn: NormalizedSemanticTurnV2; dialogue: DispositionDialogueSnapshot | null }): Promise<PersonResolutionBindingResult> {
        const candidate = candidateFromSemantic(input.semanticTurn);
        if (!candidate) return { status: 'not_applicable' };
        const pending = input.semanticTurn.kind === 'slot_answer' && input.dialogue?.activeDialogue !== null && input.dialogue?.activeDialogue !== undefined;
        const request: PersonResolutionRequest = { actorUserId: input.actorUserId, dialogueScopeKey: input.dialogueScopeKey, candidate, semanticSlotType: 'person', objectiveContext: pending ? 'pending_slot' : 'independent_objective' };
        if (!request.candidate) return { status: 'invalid' };
        const resolved = await this.invoker.resolve(request.actorUserId, { name: request.candidate });
        if (resolved.ambiguous) return { status: 'ambiguous', candidates: resolved.candidates };
        if (!resolved.resolved) return { status: 'zero_match' };
        return { status: 'resolved', person: resolved.resolved };
    }
}

export const agentPersonResolutionService = new AgentPersonResolutionService();
