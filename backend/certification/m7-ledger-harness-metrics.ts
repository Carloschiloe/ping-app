export interface ShadowSideEffectEvidence {
    toolsExecuted?: boolean | null;
    persistenceWrites?: number | null;
    dialogueStateMutated?: boolean | null;
    externalMessageSent?: boolean | null;
    externalActionExecuted?: boolean | null;
}

export interface ShadowObservationLike {
    failure?: string | null;
    sideEffects?: ShadowSideEffectEvidence | null;
}

export type ObserverOutcome = 'OBSERVER_REACHED' | 'OBSERVER_NOT_REACHED' | 'OBSERVER_FAILURE';

export interface ShadowObservationMetrics {
    outcome: ObserverOutcome;
    actualSideEffect: boolean;
}

/**
 * Separates observer coverage from prohibited effects. An early return before
 * the observer is not evidence of a writer or other external mutation.
 */
export function classifyShadowObservation(value: ShadowObservationLike | null | undefined): ShadowObservationMetrics {
    if (value == null) return { outcome: 'OBSERVER_NOT_REACHED', actualSideEffect: false };
    const sideEffects = value.sideEffects ?? {};
    const actualSideEffect = sideEffects.toolsExecuted === true
        || (typeof sideEffects.persistenceWrites === 'number' && sideEffects.persistenceWrites > 0)
        || sideEffects.dialogueStateMutated === true
        || sideEffects.externalMessageSent === true
        || sideEffects.externalActionExecuted === true;
    return {
        outcome: value.failure ? 'OBSERVER_FAILURE' : 'OBSERVER_REACHED',
        actualSideEffect,
    };
}
