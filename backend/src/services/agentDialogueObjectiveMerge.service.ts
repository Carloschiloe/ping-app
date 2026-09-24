import type { AgentObjective } from '../types/agentPlan';

/**
 * Merge a semantic change into an open plan without treating the model's
 * candidate fields as canonical identity. Empty target fields inherit the
 * open objective; any non-empty target is resolved again by the planner.
 */
export function reconcilePendingPlanModification(
    priorObjective: AgentObjective,
    proposedObjective: AgentObjective,
): AgentObjective {
    const hasProposedTarget = proposedObjective.targetEntities.entityHints.length > 0
        || proposedObjective.targetEntities.personHints.length > 0;
    const proposedSource = proposedObjective.sourceUtterance.trim();
    const priorTime = priorObjective.timeConstraints.rawHint?.trim();
    // Planning still owns date parsing from sourceUtterance.  A semantic
    // modification often contains only the replacement detail/object and
    // intentionally omits the already-authorized date.  Keep that canonical
    // slot available without copying an old target or trusting free text as
    // identity.
    const sourceUtterance = proposedSource
        ? (proposedObjective.timeConstraints.rawHint || !priorTime
            ? proposedSource
            : `${proposedSource} ${priorTime}`.trim())
        : priorObjective.sourceUtterance;
    return {
        ...priorObjective,
        objectiveType: proposedObjective.objectiveType === 'unsupported'
            ? priorObjective.objectiveType
            : proposedObjective.objectiveType,
        targetEntities: {
            entityHints: hasProposedTarget && proposedObjective.targetEntities.entityHints.length > 0
                ? proposedObjective.targetEntities.entityHints
                : priorObjective.targetEntities.entityHints,
            personHints: hasProposedTarget && proposedObjective.targetEntities.personHints.length > 0
                ? proposedObjective.targetEntities.personHints
                : priorObjective.targetEntities.personHints,
        },
        constraints: {
            ...priorObjective.constraints,
            ...proposedObjective.constraints,
        },
        desiredOutcome: proposedObjective.desiredOutcome.trim() || priorObjective.desiredOutcome,
        timeConstraints: {
            rawHint: proposedObjective.timeConstraints.rawHint ?? priorObjective.timeConstraints.rawHint,
        },
        sourceUtterance,
        ambiguities: [],
        confidence: Math.max(priorObjective.confidence, proposedObjective.confidence),
        source: proposedObjective.source,
        fallbackReason: proposedObjective.fallbackReason,
        modelUsed: proposedObjective.modelUsed,
        communicateContentCandidate: proposedObjective.communicateContentCandidate ?? priorObjective.communicateContentCandidate,
    };
}
