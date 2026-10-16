import type {
    AgentTurnDispositionDecision, AgentTurnDispositionInput, DispositionDialogueSnapshot,
    ProposedDialogueTransition,
} from '../types/agentTurnDisposition';

function noTransition(dialogue: DispositionDialogueSnapshot | null): ProposedDialogueTransition {
    return {
        kind: 'none', activeDialogue: dialogue?.activeDialogue ?? null,
        suspendedDialogue: dialogue?.suspendedDialogue ?? null,
    };
}

function decision(disposition: AgentTurnDispositionDecision['disposition'], reason: string, transition: ProposedDialogueTransition): AgentTurnDispositionDecision {
    return { disposition, reason, transition, requiresAuthorization: false, requiresExecution: false };
}

export class AgentTurnDispositionService {
    public decide(input: AgentTurnDispositionInput): AgentTurnDispositionDecision {
        const { semanticTurn: turn, dialogue, pendingSlotResolution: slot, suspendedResumeCandidate } = input;
        const unchanged = noTransition(dialogue);

        // 1. Validated lifecycle commands always win. Validation is supplied
        // by Core normalization; this service never parses raw language.
        if (turn.lifecycleCommand === 'abandon') {
            if (turn.lifecycleTarget === 'ambiguous' || !dialogue
                || (turn.lifecycleTarget === 'active' && !dialogue.activeDialogue)
                || (turn.lifecycleTarget === 'suspended' && !dialogue.suspendedDialogue)) {
                return decision('reclarify', 'abandon_target_is_not_unambiguous', { ...unchanged, kind: 'reclarify' });
            }
            if (turn.lifecycleTarget === 'suspended') {
                return decision('abandon_pending', 'validated_suspended_dialogue_abandonment', {
                    kind: 'abandon_active', activeDialogue: dialogue.activeDialogue, suspendedDialogue: null,
                });
            }
            return decision('abandon_pending', 'validated_active_dialogue_abandonment', {
                kind: 'abandon_active', activeDialogue: null, suspendedDialogue: dialogue.suspendedDialogue,
            });
        }
        if (turn.lifecycleCommand === 'resume') {
            if (!dialogue?.suspendedDialogue || turn.lifecycleTarget === 'ambiguous') {
                return decision('reclarify', 'resume_target_is_not_unambiguous', { ...unchanged, kind: 'reclarify' });
            }
            return decision('resume_pending', 'validated_suspended_dialogue_resume', {
                kind: 'resume_suspended', activeDialogue: dialogue.suspendedDialogue,
                suspendedDialogue: dialogue.activeDialogue,
            });
        }

        // 2. A complete independent objective beats a possible slot answer.
        const objective = turn.objective;
        if (objective?.complete) {
            if (dialogue?.activeDialogue && dialogue.suspendedDialogue) {
                return decision('reclarify', 'dialogue_capacity_exhausted', { ...unchanged, kind: 'reclarify' });
            }
            if (dialogue?.activeDialogue) {
                return decision('new_objective', 'complete_independent_objective', {
                    kind: 'suspend_active', activeDialogue: { objective, source: 'normalized_semantic_turn' },
                    suspendedDialogue: dialogue.activeDialogue,
                });
            }
            return decision(objective.domain === 'read' ? 'ordinary_read' : 'ordinary_write', 'complete_objective_without_pending_dialogue', unchanged);
        }

        // 3. Pending-slot resolution is separate and resolver-owned.
        if (dialogue?.activeDialogue && slot) {
            if (slot.status === 'resolved') {
                return decision('answer_pending', 'pending_slot_resolved_by_core', {
                    kind: 'update_active', activeDialogue: slot.updatedDialogue,
                    suspendedDialogue: dialogue.suspendedDialogue,
                });
            }
            return decision('reclarify', `pending_slot_${slot.status}`, { ...unchanged, kind: 'reclarify' });
        }

        // 4. Structurally unambiguous implicit resume is allowed only when
        // Core has already established the candidate and no complete objective exists.
        if (dialogue?.suspendedDialogue && turn.structurallyUnambiguousResume
            && suspendedResumeCandidate?.structurallyValid) {
            return decision('resume_pending', 'structurally_unambiguous_resume', {
                kind: 'resume_suspended', activeDialogue: dialogue.suspendedDialogue,
                suspendedDialogue: dialogue.activeDialogue,
            });
        }

        if (turn.kind === 'read') {
            return dialogue?.activeDialogue
                ? decision('suspend_pending', 'stateless_read_interruption', unchanged)
                : decision('ordinary_read', 'ordinary_read_without_dialogue', unchanged);
        }
        if (turn.kind === 'write') {
            return dialogue?.activeDialogue
                ? decision('reclarify', 'incomplete_independent_objective', { ...unchanged, kind: 'reclarify' })
                : decision('ordinary_write', 'ordinary_write_without_dialogue', unchanged);
        }
        return decision('reclarify', 'semantic_uncertainty_requires_clarification', { ...unchanged, kind: 'reclarify' });
    }
}

export const agentTurnDispositionService = new AgentTurnDispositionService();
