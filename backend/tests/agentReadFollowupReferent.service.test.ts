import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearReadFollowupReferentsForTests,
    forgetReadFollowupReferent,
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
    it('reconstructs a narrow follow-up query only from one cited answer', () => {
        expect(resolve()).toBeNull();
        remember();
        expect(resolve()).toEqual({ query: `${followup} Ver Spiderman`, sourceId: COMMITMENT.id });
    });

    it('does not share a referent with another actor or conversation', () => {
        remember();
        expect(resolve({ actorUserId: OTHER })).toBeNull();
        expect(resolve({ conversationId: OTHER_CONVERSATION })).toBeNull();
        expect(resolve()).not.toBeNull();
    });

    it('rejects unsupported, uncited, ambiguous or mismatched evidence', () => {
        remember({ status: 'no_evidence' });
        expect(resolve()).toBeNull();
        remember({ citations: [] });
        expect(resolve()).toBeNull();
        remember({ commitments: [COMMITMENT, { id: 'another', title: 'Other' }] });
        expect(resolve()).toBeNull();
        remember({ citations: [{ sourceType: 'commitment', sourceId: 'different' }] });
        expect(resolve()).toBeNull();
        remember({ citations: [{ sourceType: 'message', sourceId: COMMITMENT.id }] });
        expect(resolve()).toBeNull();
    });

    it('cannot infer the title for an unscoped conversation', () => {
        remember({ conversationId: undefined });
        expect(resolve({ conversationId: undefined })).toBeNull();
    });

    it('expires and clears the referent, and supports explicit invalidation', () => {
        remember();
        expect(resolve({ now: 1000 + 2 * 60 * 1000 })).toBeNull();
        remember();
        forgetReadFollowupReferent(ACTOR, CONVERSATION);
        expect(resolve()).toBeNull();
    });

    it('invalidates on unrelated or write-shaped user requests', () => {
        remember();
        expect(resolve({ utterance: 'Completa Ver Spiderman' })).toBeNull();
        expect(resolve()).toBeNull();
        remember();
        expect(resolve({ utterance: '¿Cuándo los completamos?' })).toBeNull();
        expect(resolve()).toBeNull();
    });
});
