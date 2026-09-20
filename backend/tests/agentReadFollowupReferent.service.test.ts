import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearReadFollowupReferentsForTests,
    forgetReadFollowupReferent,
    isEligibleReadFollowup,
    rememberVerifiedReadReferent,
    resolveVerifiedReadFollowup,
} from '../src/services/agentReadFollowupReferent.service';

const ACTOR = 'actor-a';
const OTHER = 'actor-b';
const CONVERSATION = 'conversation-a';
const OTHER_CONVERSATION = 'conversation-b';
const COMMITMENT = { id: 'commitment-a', title: 'Ver Spiderman' };
const citation = { sourceType: 'commitment', sourceId: COMMITMENT.id };
const followup = '¿Y cuándo lo completamos?';

function remember(overrides: Partial<Parameters<typeof rememberVerifiedReadReferent>[0]> = {}) {
    rememberVerifiedReadReferent({
        actorUserId: ACTOR, conversationId: CONVERSATION,
        status: 'answered', commitments: [COMMITMENT], citations: [citation],
        now: 1000, ...overrides,
    });
}
function resolve(overrides: Partial<Parameters<typeof resolveVerifiedReadFollowup>[0]> = {}) {
    return resolveVerifiedReadFollowup({
        actorUserId: ACTOR, conversationId: CONVERSATION,
        utterance: followup, now: 1001, ...overrides,
    });
}

beforeEach(clearReadFollowupReferentsForTests);

describe('M-7 verified read-only referents', () => {
    it('reconstructs a narrow follow-up query only from one cited answer', async () => {
        expect(await resolve()).toBeNull();
        remember();
        expect(await resolve()).toEqual({ query: `${followup} Ver Spiderman`, sourceId: COMMITMENT.id });
    });

    it('does not share a referent with another actor or conversation', async () => {
        remember();
        expect(await resolve({ actorUserId: OTHER })).toBeNull();
        expect(await resolve({ conversationId: OTHER_CONVERSATION })).toBeNull();
        expect(await resolve()).not.toBeNull();
    });

    it('rejects unsupported, uncited, ambiguous or mismatched evidence', async () => {
        remember({ status: 'no_evidence' });
        expect(await resolve()).toBeNull();
        remember({ citations: [] });
        expect(await resolve()).toBeNull();
        remember({ commitments: [COMMITMENT, { id: 'another', title: 'Other' }] });
        expect(await resolve()).toBeNull();
        remember({ citations: [{ sourceType: 'commitment', sourceId: 'different' }] });
        expect(await resolve()).toBeNull();
        remember({ citations: [{ sourceType: 'message', sourceId: COMMITMENT.id }] });
        expect(await resolve()).toBeNull();
    });

    it('cannot infer the title for an unscoped conversation', async () => {
        remember({ conversationId: undefined });
        expect(await resolve({ conversationId: undefined })).toBeNull();
    });

    it('expires and clears the referent, and supports explicit invalidation', async () => {
        remember();
        expect(await resolve({ now: 1000 + 2 * 60 * 1000 })).toBeNull();
        remember();
        forgetReadFollowupReferent(ACTOR, CONVERSATION);
        expect(await resolve()).toBeNull();
    });

    it('invalidates on a write-shaped follow-up even while a referent is stored', async () => {
        remember();
        expect(await resolve({ utterance: 'Completa Ver Spiderman' })).toBeNull();
        expect(await resolve()).toBeNull();
    });

    // GENERALIZATION PROOF: these did not exist before -- they demonstrate
    // the structural detector covers verbs/phrasings the old fixed regex
    // (only "cuándo lo completamos") could never have matched, with zero
    // code change to the detector itself.
    describe('isEligibleReadFollowup generalizes beyond the original single verb/phrasing', () => {
        it('recognizes every closed-status lifecycle verb, not only "completamos"', async () => {
            for (const phrase of [
                '¿Cuándo lo completamos?',
                '¿Cuándo lo cancelamos?',
                '¿Cuándo lo resolvimos?',
                '¿Cuándo lo rechazamos?',
                '¿Y cuándo lo reabrimos?',
                'pero cuándo lo aceptamos?',
            ]) {
                expect(await isEligibleReadFollowup(phrase), phrase).toBe(true);
            }
        });

        it('also recognizes the plural elliptical object ("los"/"las"), unlike the old fixed regex', async () => {
            expect(await isEligibleReadFollowup('¿Cuándo los completamos?')).toBe(true);
            expect(await isEligibleReadFollowup('¿Cuándo las cancelamos?')).toBe(true);
        });

        it('does NOT treat an already-named entity as an elliptical follow-up (the ordinary pipeline resolves that on its own)', async () => {
            expect(await isEligibleReadFollowup('¿Cuándo completamos Ver Spiderman?')).toBe(false);
        });

        it('does NOT treat a write-shaped utterance as a read follow-up even if it echoes lifecycle wording', async () => {
            expect(await isEligibleReadFollowup('Completa Ver Spiderman')).toBe(false);
        });

        it('does NOT treat an unrelated question as a follow-up', async () => {
            expect(await isEligibleReadFollowup('¿Qué tengo hoy?')).toBe(false);
            expect(await isEligibleReadFollowup('')).toBe(false);
        });

        it('does NOT treat an explicit list request as an elliptical single-entity follow-up', async () => {
            expect(await isEligibleReadFollowup('¿Cuándo completamos todas?')).toBe(false);
        });
    });
});
