import type { NormalizedSemanticTurnV2, NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { DispositionDialogueSnapshot, PendingSlotResolution } from '../types/agentTurnDisposition';
import type { CanonicalReadScope } from '../types/agentReadQuery';
import type { PersonResolutionResult, RetrievalCommitment, RetrievalMessage } from '../types/retrieval';
import { AgentPersonResolutionService, type PersonResolutionInvoker } from './agentPersonResolution.service';
import { AgentReadTargetResolutionService } from './agentReadTargetResolution.service';
import { AgentReadQueryPlanner } from './agentReadQueryPlanner.service';
import { resolveTemporal } from './temporalCore.service';
import type { V4CoreShadowResolution, V4CoreShadowResolver } from './agentSemanticV4CoreShadow.service';

/**
 * Read-only boundary used by the V4 shadow.  There are deliberately no
 * mutation methods here: a repository which can write cannot satisfy this
 * contract by accident.
 */
export interface HighFidelityReadOnlyRepository {
    authorizeConversation(actorUserId: string, conversationId: string): Promise<boolean>;
    resolvePerson(actorUserId: string, input: { name: string }): Promise<PersonResolutionResult>;
    authorizePerson(input: { actorUserId: string; id: string; kind: 'user' | 'contact' }): Promise<PersonResolutionResult>;
    findCommitments(input: {
        actorUserId: string;
        entityType: 'commitment' | 'commitment_proposal';
        query?: string;
        limit: number;
    }): Promise<RetrievalCommitment[]>;
    authorizeCommitment(input: {
        actorUserId: string;
        id: string;
        entityType: 'commitment' | 'commitment_proposal';
    }): Promise<RetrievalCommitment | null>;
    findMessages(input: {
        actorUserId: string;
        conversationId?: string;
        query?: string;
        limit: number;
    }): Promise<RetrievalMessage[]>;
    authorizeMessage(input: { actorUserId: string; id: string }): Promise<RetrievalMessage | null>;
}

const canonicalRepository: HighFidelityReadOnlyRepository = {
    async authorizeConversation(actorUserId, conversationId) {
        const { assertConversationParticipant } = await import('../utils/authz');
        try {
            await assertConversationParticipant(actorUserId, conversationId);
            return true;
        } catch (error: any) {
            if (error?.statusCode === 403 || error?.statusCode === 404) return false;
            throw error;
        }
    },
    async resolvePerson(actorUserId, input) {
        const { resolvePerson } = await import('./retrieval.service');
        return resolvePerson(actorUserId, input);
    },
    async authorizePerson(input) {
        const { resolvePerson } = await import('./retrieval.service');
        const result = input.kind === 'user'
            ? await resolvePerson(input.actorUserId, { userId: input.id })
            : await resolvePerson(input.actorUserId, { contactId: input.id });
        return result;
    },
    async findCommitments(input) {
        const { retrieveCommitmentProposals, retrieveCommitments } = await import('./retrieval.service');
        const request = { actorUserId: input.actorUserId, query: input.query, types: [input.entityType], limits: { commitments: input.limit } };
        return input.entityType === 'commitment'
            ? retrieveCommitments(request, input.limit)
            : retrieveCommitmentProposals(request, input.limit);
    },
    async authorizeCommitment(input) {
        // Retrieval owns authorization. We intentionally do not query by a
        // client-provided id; we authorize the bounded canonical result set
        // and only then select the exact id.
        const rows = await this.findCommitments({ ...input, limit: 50 });
        return rows.find(row => row.id === input.id) ?? null;
    },
    async findMessages(input) {
        const { retrieveMessages } = await import('./retrieval.service');
        return retrieveMessages({ actorUserId: input.actorUserId, conversationId: input.conversationId, query: input.query }, input.limit);
    },
    async authorizeMessage(input) {
        const { retrieveMessages } = await import('./retrieval.service');
        const rows = await retrieveMessages({ actorUserId: input.actorUserId, messageWindow: { aroundMessageId: input.id, before: 0, after: 0 } }, 1);
        return rows.find(row => row.id === input.id) ?? null;
    },
};

export interface HighFidelityResolverInput {
    actorUserId?: string;
    dialogueScopeKey?: string;
    semanticV4: NormalizedSemanticTurnV4;
    semanticV2: NormalizedSemanticTurnV2;
    dialogue: DispositionDialogueSnapshot | null;
    timezone?: string;
    turnReferenceInstant?: string;
    authorizedScope?: CanonicalReadScope;
    priorReferent?: { kind: 'commitment' | 'proposal' | 'message' | 'person'; id: string } | null;
}

function candidateText(turn: NormalizedSemanticTurnV4): string | undefined {
    const values = [turn.slots.title, turn.slots.topic, turn.slots.person, turn.slots.recipient, ...turn.entityHints];
    const value = values.find(item => typeof item === 'string' && item.trim());
    return typeof value === 'string' ? value.trim() : undefined;
}

function referenceKind(target: { kind: string } | null): V4CoreShadowResolution['summary']['referenceKind'] {
    if (!target) return 'none';
    if (target.kind === 'result_set') return 'result_set';
    if (target.kind === 'commitment' || target.kind === 'proposal' || target.kind === 'message' || target.kind === 'person') return target.kind;
    return 'none';
}

function summary(status: V4CoreShadowResolution['summary']['status'], target: { kind: string } | null, candidateCount: number | null): V4CoreShadowResolution['summary'] {
    return {
        status,
        referenceKind: referenceKind(target),
        candidateCount,
        scopeKind: status === 'zero_match' ? 'empty_scope' : (status === 'result_set' || target || candidateCount !== null ? 'scoped' : 'none'),
    };
}

function cloneScope(scope: CanonicalReadScope | undefined): CanonicalReadScope {
    return scope ? JSON.parse(JSON.stringify(scope)) as CanonicalReadScope : {};
}

function slotResolution(input: HighFidelityResolverInput): PendingSlotResolution | undefined {
    if (!input.dialogue?.activeDialogue || input.semanticV4.kind !== 'slot_answer') return undefined;
    const slot = input.semanticV4.candidateSlotType;
    const value = slot ? input.semanticV4.slots[slot] : undefined;
    if (!slot || value === undefined || value === null || value === '') return { status: 'invalid' };
    return {
        status: 'resolved',
        slot,
        value: value as string | number | boolean,
        updatedDialogue: { ...input.dialogue.activeDialogue, [slot]: value },
    };
}

/**
 * High-fidelity read-only Core resolver. It reuses the canonical person and
 * read planners, while the repository is the only authority allowed to
 * return ids. V4 hints are search constraints, never identities.
 */
export class AgentSemanticV4HighFidelityReadOnlyResolver implements V4CoreShadowResolver {
    private readonly people: AgentPersonResolutionService;
    private readonly targets: AgentReadTargetResolutionService;
    private readonly planner = new AgentReadQueryPlanner();

    public constructor(private readonly repository: HighFidelityReadOnlyRepository = canonicalRepository) {
        const invoker: PersonResolutionInvoker = { resolve: (actorUserId, input) => repository.resolvePerson(actorUserId, input) };
        this.people = new AgentPersonResolutionService(invoker);
        this.targets = new AgentReadTargetResolutionService({
            validate: (actorUserId, conversationId) => repository.authorizeConversation(actorUserId, conversationId),
        });
    }

    public async resolve(input: HighFidelityResolverInput): Promise<V4CoreShadowResolution> {
        if (!input.actorUserId) return { summary: summary('not_attempted', null, null) };
        const actorUserId = input.actorUserId;
        const turn = input.semanticV4;
        const text = candidateText(turn);
        const slot = slotResolution(input);
        if (turn.kind !== 'read_request' && turn.kind !== 'slot_answer') {
            return { summary: summary('not_applicable', null, null), pendingSlotResolution: slot };
        }

        const meaning = turn.readMeaning;
        if (!meaning) return { summary: summary('not_applicable', null, null), pendingSlotResolution: slot };

        let person: PersonResolutionResult | null = null;
        if (meaning.targetShape === 'person') {
            const binding = await this.people.resolveFromSemantic({
                actorUserId,
                dialogueScopeKey: input.dialogueScopeKey ?? 'shadow',
                semanticTurn: input.semanticV2,
                dialogue: input.dialogue,
            });
            person = binding.status === 'resolved'
                ? { resolved: binding.person, ambiguous: false, candidates: [] }
                : binding.status === 'ambiguous'
                    ? { resolved: null, ambiguous: true, candidates: binding.candidates ?? [] }
                    : { resolved: null, ambiguous: false, candidates: [] };
        }

        let targetEntity: RetrievalCommitment | null = null;
        let targetStatus: V4CoreShadowResolution['summary']['status'] = 'not_applicable';
        let candidateCount: number | null = null;
        let internalTarget: { kind: 'commitment' | 'proposal' | 'person' | 'message'; id: string } | null = null;

        if (input.priorReferent && (meaning.targetShape === input.priorReferent.kind || (meaning.targetShape === 'commitment' && input.priorReferent.kind === 'commitment'))) {
            if (input.priorReferent.kind === 'person') {
                const resolved = await this.repository.authorizePerson({ actorUserId, id: input.priorReferent.id, kind: 'user' });
                person = resolved;
                if (resolved.resolved && !resolved.ambiguous) internalTarget = { kind: 'person', id: resolved.resolved.id };
            } else if (input.priorReferent.kind === 'message') {
                const message = await this.repository.authorizeMessage({ actorUserId, id: input.priorReferent.id });
                if (message) internalTarget = { kind: 'message', id: message.id };
            } else {
                targetEntity = await this.repository.authorizeCommitment({ actorUserId, id: input.priorReferent.id, entityType: input.priorReferent.kind === 'proposal' ? 'commitment_proposal' : 'commitment' });
                if (targetEntity) internalTarget = { kind: input.priorReferent.kind, id: targetEntity.id };
            }
            targetStatus = internalTarget ? 'resolved' : 'zero_match';
            candidateCount = internalTarget ? 1 : 0;
        } else if (meaning.targetShape === 'commitment' || meaning.targetShape === 'proposal') {
            const entityType = meaning.targetShape === 'proposal' ? 'commitment_proposal' : 'commitment';
            const rows = await this.repository.findCommitments({ actorUserId, entityType, query: text, limit: 10 });
            candidateCount = rows.length;
            if (meaning.queryShape === 'focused' && rows.length === 1) {
                targetEntity = rows[0];
                internalTarget = { kind: meaning.targetShape, id: rows[0].id };
                targetStatus = 'resolved';
            } else if (rows.length === 0) targetStatus = 'zero_match';
            else if (meaning.queryShape === 'focused') targetStatus = 'ambiguous';
            else targetStatus = 'result_set';
        } else if (meaning.targetShape === 'message') {
            const messages = await this.repository.findMessages({ actorUserId, conversationId: input.authorizedScope?.conversationId, query: text, limit: 10 });
            candidateCount = messages.length;
            if (meaning.queryShape === 'focused' && messages.length === 1) {
                internalTarget = { kind: 'message', id: messages[0].id };
                targetStatus = 'resolved';
            } else if (!messages.length) targetStatus = 'zero_match';
            else if (meaning.queryShape === 'focused') targetStatus = 'ambiguous';
            else targetStatus = 'result_set';
        } else if (meaning.targetShape === 'person') {
            candidateCount = person?.ambiguous ? person.candidates.length : person?.resolved ? 1 : 0;
            targetStatus = person?.ambiguous ? 'ambiguous' : person?.resolved ? 'resolved' : 'zero_match';
            if (person?.resolved && !person.ambiguous) internalTarget = { kind: 'person', id: person.resolved.id };
        } else {
            targetStatus = meaning.queryShape === 'focused' ? 'not_applicable' : 'result_set';
        }

        const targetInput = await this.targets.resolve({
            actorUserId,
            semanticTurn: turn,
            person,
            targetEntity,
            authorizedScope: { conversationId: input.authorizedScope?.conversationId ?? null },
        });
        const temporal = turn.temporalFact
            ? resolveTemporal({ temporalFact: turn.temporalFact, timezone: input.timezone, turnReferenceInstant: input.turnReferenceInstant })
            : { status: 'not_applicable' as const };
        const scope = cloneScope(input.authorizedScope);
        if (meaning.targetShape === 'person' && internalTarget?.kind === 'person') {
            if (person?.resolved?.kind === 'user') scope.personId = person.resolved.id;
            else if (person?.resolved?.kind === 'contact') scope.contactId = person.resolved.id;
        }
        if (meaning.targetShape === 'message' && !scope.conversationId) scope.conversationId = undefined;
        this.planner.plan({ semanticTurn: turn, targetResolution: targetInput, temporal, authorizedScope: scope });

        const summaryTarget = internalTarget ?? (
            meaning.targetShape === 'person' ? { kind: 'person' } :
                meaning.targetShape === 'commitment' ? { kind: 'commitment' } :
                    meaning.targetShape === 'proposal' ? { kind: 'proposal' } :
                        meaning.targetShape === 'message' ? { kind: 'message' } : null
        );
        return {
            summary: summary(targetStatus, summaryTarget, candidateCount),
            pendingSlotResolution: slot,
            details: internalTarget ? { canonicalId: internalTarget.id, targetKind: internalTarget.kind } : undefined,
        } as V4CoreShadowResolution;
    }
}

export const agentSemanticV4HighFidelityReadOnlyResolver = new AgentSemanticV4HighFidelityReadOnlyResolver();

export function createHighFidelityReadOnlyRepositoryForTest(rows: {
    people?: Array<{ actorUserId: string; person: { kind: 'user' | 'contact'; id: string; displayName: string }; aliases?: string[] }>;
    commitments?: Array<RetrievalCommitment & { authorizedActorUserIds: string[] }>;
    messages?: Array<RetrievalMessage & { authorizedActorUserIds: string[] }>;
} = {}): HighFidelityReadOnlyRepository {
    const people = rows.people ?? [];
    const commitments = rows.commitments ?? [];
    const messages = rows.messages ?? [];
    const match = (value: string | undefined, aliases: string[]) => !value || aliases.some(alias => {
        const left = alias.toLocaleLowerCase();
        const right = value.toLocaleLowerCase();
        return left === right || left.includes(right) || right.includes(left);
    });
    return {
        async authorizeConversation(actorUserId, conversationId) {
            return messages.some(row => row.conversationId === conversationId && row.authorizedActorUserIds.includes(actorUserId));
        },
        async resolvePerson(actorUserId, input) {
            const candidates = people.filter(row => row.actorUserId === actorUserId && match(input.name, [row.person.displayName, ...(row.aliases ?? [])])).map(row => row.person);
            return { resolved: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1, candidates };
        },
        async authorizePerson(input) {
            const person = people.find(row => row.actorUserId === input.actorUserId && row.person.id === input.id && row.person.kind === input.kind)?.person ?? null;
            return { resolved: person, ambiguous: false, candidates: person ? [person] : [] };
        },
        async findCommitments(input) {
            return commitments.filter(row => row.entityType === input.entityType && row.authorizedActorUserIds.includes(input.actorUserId) && match(input.query, [row.title]));
        },
        async authorizeCommitment(input) {
            return commitments.find(row => row.id === input.id && row.entityType === input.entityType && row.authorizedActorUserIds.includes(input.actorUserId)) ?? null;
        },
        async findMessages(input) {
            return messages.filter(row => row.authorizedActorUserIds.includes(input.actorUserId) && (!input.conversationId || row.conversationId === input.conversationId) && match(input.query, [row.content ?? '']));
        },
        async authorizeMessage(input) {
            return messages.find(row => row.id === input.id && row.authorizedActorUserIds.includes(input.actorUserId)) ?? null;
        },
    };
}
