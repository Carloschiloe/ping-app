import { assertConversationParticipant } from '../utils/authz';
import type { AgentReadTargetResolutionInput, ReadTargetResolutionResult } from '../types/agentReadTargetResolution';

export interface ConversationScopeAuthorizer {
    validate(actorUserId: string, conversationId: string): Promise<boolean>;
}

const canonicalConversationScopeAuthorizer: ConversationScopeAuthorizer = {
    async validate(actorUserId, conversationId) {
        try {
            await assertConversationParticipant(actorUserId, conversationId);
            return true;
        } catch (error: any) {
            if (error?.statusCode === 403 || error?.statusCode === 404) return false;
            throw error;
        }
    },
};

function safeCandidates(input: AgentReadTargetResolutionInput): Array<{ id: string; label: string }> {
    return (input.person?.candidates || []).map(candidate => ({ id: candidate.id, label: candidate.displayName }));
}

export class AgentReadTargetResolutionService {
    public constructor(private readonly conversationScopeAuthorizer: ConversationScopeAuthorizer = canonicalConversationScopeAuthorizer) {}

    public async resolve(input: AgentReadTargetResolutionInput): Promise<ReadTargetResolutionResult> {
        const meaning = input.semanticTurn.readMeaning;
        if (!meaning) return { status: 'invalid', targetShape: 'none', reason: 'read_meaning_missing' };

        switch (meaning.targetShape) {
            case 'none':
                return { status: 'not_applicable' };
            case 'person':
                return this.resolvePerson(input);
            case 'commitment':
                return this.resolveCommitmentLike(input, 'commitment', 'commitment');
            case 'proposal':
                return this.resolveCommitmentLike(input, 'proposal', 'commitment_proposal');
            case 'conversation':
                return this.resolveConversation(input);
            case 'message':
            case 'attachment':
            case 'transcription':
                return { status: 'unsupported', targetShape: meaning.targetShape, reason: 'no_public_authorized_read_resolver' };
            case 'topic':
                return { status: 'unsupported', targetShape: 'topic', reason: 'topic_is_query_constraint_not_entity' };
        }
    }

    private resolvePerson(input: AgentReadTargetResolutionInput): ReadTargetResolutionResult {
        const person = input.person;
        if (!person) return { status: 'invalid', targetShape: 'person', reason: 'person_resolution_missing' };
        if (person.ambiguous) return { status: 'ambiguous', targetShape: 'person', candidates: safeCandidates(input) };
        if (!person.resolved) return { status: 'zero_match', targetShape: 'person' };
        return { status: 'resolved', target: { kind: 'person', id: person.resolved.id, personKind: person.resolved.kind } };
    }

    private resolveCommitmentLike(input: AgentReadTargetResolutionInput, targetShape: 'commitment' | 'proposal', entityType: 'commitment' | 'commitment_proposal'): ReadTargetResolutionResult {
        const target = input.targetEntity;
        if (!target) return { status: 'invalid', targetShape, reason: 'canonical_target_missing' };
        if (target.entityType !== entityType) return { status: 'invalid', targetShape, reason: 'canonical_target_type_mismatch' };
        return { status: 'resolved', target: { kind: targetShape, id: target.id } };
    }

    private async resolveConversation(input: AgentReadTargetResolutionInput): Promise<ReadTargetResolutionResult> {
        const conversationId = input.authorizedScope.conversationId;
        if (!conversationId) return { status: 'unsupported', targetShape: 'conversation', reason: 'conversation_discovery_not_available' };
        const authorized = await this.conversationScopeAuthorizer.validate(input.actorUserId, conversationId);
        if (!authorized) return { status: 'zero_match', targetShape: 'conversation' };
        return { status: 'resolved', target: { kind: 'conversation', id: conversationId, lineage: { conversationId } } };
    }
}

export const agentReadTargetResolutionService = new AgentReadTargetResolutionService();
