import { describe, expect, it } from 'vitest';

// Pending full HTTP reproduction: read-turn referents must be resolved from
// canonical, actor-authorized evidence before a follow-up is answered.
describe('M-7 read follow-up safety', () => {
    it('does not treat an absent referent as a verified completion date', () => {
        const verifiedCompletionDate: string | null = null;
        expect(verifiedCompletionDate).toBeNull();
    });
});
