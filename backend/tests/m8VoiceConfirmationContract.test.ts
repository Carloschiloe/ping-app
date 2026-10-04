import { describe, expect, it } from 'vitest';
import {
    resolveM8VoiceConfirmationState,
    shouldAuthorizeM8VoicePlan,
} from '../src/services/m8VoiceConfirmationContract.service';

describe('M8 Voice confirmation contract', () => {
    it('keeps a plan requiring consent pending and side-effect free', () => {
        const plan = {
            kind: 'plan',
            confirmationState: 'required',
            confirmationRequested: true,
        };

        expect(resolveM8VoiceConfirmationState(plan)).toBe('required');
        expect(shouldAuthorizeM8VoicePlan(plan)).toBe(false);
    });

    it('authorizes only an explicit Core confirmation decision', () => {
        expect(shouldAuthorizeM8VoicePlan({
            kind: 'plan',
            confirmationState: 'received',
        })).toBe(true);
        expect(resolveM8VoiceConfirmationState({
            kind: 'plan',
            confirmationRequested: true,
        })).toBe('required');
    });

    it('does not authorize corrections, rejection, clarification, or malformed results', () => {
        for (const value of [
            { kind: 'plan', confirmationState: 'required' },
            { kind: 'clarification', confirmationState: 'received' },
            { kind: 'response', confirmationState: 'received' },
            { kind: 'plan' },
            null,
        ]) {
            expect(shouldAuthorizeM8VoicePlan(value)).toBe(false);
        }
    });
});
