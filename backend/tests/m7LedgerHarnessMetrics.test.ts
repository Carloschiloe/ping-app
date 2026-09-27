import { describe, expect, it } from 'vitest';
import { classifyShadowObservation } from '../certification/m7-ledger-harness-metrics';

describe('M-7 ledger harness observer metrics', () => {
    it('does not classify an early return before the observer as a side effect', () => {
        expect(classifyShadowObservation(undefined)).toEqual({ outcome: 'OBSERVER_NOT_REACHED', actualSideEffect: false });
    });

    it('separates observer failure from concrete side effects', () => {
        expect(classifyShadowObservation({ failure: 'shadow_failure', sideEffects: { toolsExecuted: false, persistenceWrites: 0 } }))
            .toEqual({ outcome: 'OBSERVER_FAILURE', actualSideEffect: false });
    });

    it('detects writer, persistence, tool and external-action evidence', () => {
        expect(classifyShadowObservation({ sideEffects: { toolsExecuted: true } }).actualSideEffect).toBe(true);
        expect(classifyShadowObservation({ sideEffects: { persistenceWrites: 1 } }).actualSideEffect).toBe(true);
        expect(classifyShadowObservation({ sideEffects: { externalMessageSent: true } }).actualSideEffect).toBe(true);
        expect(classifyShadowObservation({ sideEffects: { externalActionExecuted: true } }).actualSideEffect).toBe(true);
    });

    it('keeps a reached observer with zero effects clean', () => {
        expect(classifyShadowObservation({ sideEffects: { toolsExecuted: false, persistenceWrites: 0 } }))
            .toEqual({ outcome: 'OBSERVER_REACHED', actualSideEffect: false });
    });
});
