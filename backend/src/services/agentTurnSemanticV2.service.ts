import { AppError } from '../utils/AppError';
import type { NormalizedDispositionSemanticTurn } from '../types/agentTurnDisposition';
import { AGENT_TURN_SEMANTIC_MAX_BYTES, type NormalizedSemanticTurnV2 } from '../types/agentTurnCommit';

const domains = new Set(['commitment', 'messaging', 'people', 'historical_read', 'generic', 'unknown']);
const kinds = new Set(['read_request', 'write_request', 'slot_answer', 'lifecycle_command', 'unknown']);

export function normalizeSemanticTurnV2(input: NormalizedSemanticTurnV2): NormalizedSemanticTurnV2 {
    const value = input as Partial<NormalizedSemanticTurnV2>;
    const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    if (bytes > AGENT_TURN_SEMANTIC_MAX_BYTES || value.version !== 2 || !kinds.has(value.kind ?? '') || !domains.has(value.domain ?? '')
        || !Array.isArray(value.entityHints) || !Array.isArray(value.ambiguityFields) || !value.slots
        || !['complete', 'incomplete', 'unknown'].includes(value.objectiveCompleteness ?? '')
        || !['none', 'abandon', 'resume'].includes(value.lifecycleCommand ?? '')
        || !['active', 'suspended', 'unspecified'].includes(value.lifecycleTarget ?? '')
        || !['explicit', 'implicit', 'unknown'].includes(value.lifecycleEvidence ?? '')
        || !['likely', 'not_a_slot_answer', 'unknown'].includes(value.pendingSlotAnswer ?? '')
        || !['yes', 'no', 'unknown'].includes(value.continuationLike ?? '')
        || !['yes', 'no', 'unknown'].includes(value.independentObjective ?? '')) {
        throw new AppError('Unsupported or malformed semantic checkpoint version', 409);
    }
    return JSON.parse(JSON.stringify(input)) as NormalizedSemanticTurnV2;
}

export function mapSemanticTurnV2ToDisposition(input: NormalizedSemanticTurnV2): NormalizedDispositionSemanticTurn {
    const turn = normalizeSemanticTurnV2(input);
    const kind = turn.kind === 'read_request' ? 'read' : turn.kind === 'write_request' ? 'write' : turn.kind === 'slot_answer' ? 'slot_answer' : turn.kind === 'lifecycle_command' ? 'lifecycle' : 'unknown';
    const lifecycleCommand = turn.lifecycleCommand === 'none' ? null : turn.lifecycleCommand;
    const lifecycleTarget = turn.lifecycleTarget === 'unspecified' ? 'ambiguous' : turn.lifecycleTarget;
    const objective = (turn.kind === 'read_request' || turn.kind === 'write_request') && turn.objectiveType
        ? { objectiveType: turn.objectiveType, domain: turn.kind === 'read_request' ? 'read' as const : 'write' as const, complete: turn.objectiveCompleteness === 'complete', slots: turn.slots }
        : null;
    return {
        kind, objective, lifecycleCommand, lifecycleTarget,
        explicitLifecycleCommand: turn.lifecycleCommand !== 'none' && turn.lifecycleEvidence === 'explicit',
        structurallyUnambiguousResume: turn.lifecycleCommand === 'none' && turn.continuationLike === 'yes' && turn.pendingSlotAnswer === 'likely' && turn.independentObjective === 'no' && turn.candidateSlotType !== null,
    };
}

export function readSemanticCheckpoint(version: number, value: unknown): NormalizedSemanticTurnV2 {
    if (version !== 2) throw new AppError('Semantic checkpoint version is unsupported for disposition', 409);
    return normalizeSemanticTurnV2(value as NormalizedSemanticTurnV2);
}
