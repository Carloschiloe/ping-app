import type { NormalizedSemanticTurnV4, SemanticReadTargetShapeV4 } from './agentTurnCommit';
import type { PersonResolutionResult, RetrievalCommitment } from './retrieval';

export type CanonicalReadTarget =
    | { kind: 'person'; id: string; personKind: 'user' | 'contact' }
    | { kind: 'commitment'; id: string }
    | { kind: 'proposal'; id: string }
    | { kind: 'conversation'; id: string; lineage: { conversationId: string } };

export type ReadTargetResolutionResult =
    | { status: 'resolved'; target: CanonicalReadTarget }
    | { status: 'not_applicable' }
    | { status: 'zero_match'; targetShape: SemanticReadTargetShapeV4 }
    | { status: 'ambiguous'; targetShape: 'person'; candidates: Array<{ id: string; label: string }> }
    | { status: 'unsupported'; targetShape: SemanticReadTargetShapeV4; reason: string }
    | { status: 'invalid'; targetShape: SemanticReadTargetShapeV4; reason: string };

export interface AgentReadTargetResolutionInput {
    actorUserId: string;
    semanticTurn: NormalizedSemanticTurnV4;
    person: PersonResolutionResult | null;
    targetEntity?: RetrievalCommitment | null;
    authorizedScope: { conversationId?: string | null };
}
