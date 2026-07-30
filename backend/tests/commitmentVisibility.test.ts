import { describe, expect, it } from 'vitest';
import { buildCommitmentVisibilityFilter } from '../src/utils/commitmentVisibility';

describe('commitment visibility', () => {
    it('includes owner, assignee and explicitly involved proposal participants', () => {
        const filter = buildCommitmentVisibilityFilter(
            'user-1',
            ['proposal-1'],
            ['conversation-1']
        );

        expect(filter).toContain('owner_user_id.eq.user-1');
        expect(filter).toContain('assigned_to_user_id.eq.user-1');
        expect(filter).toContain('proposal_id.in.(proposal-1)');
        expect(filter).toContain(
            'and(assigned_to_user_id.is.null,conversation_id.in.(conversation-1))'
        );
    });

    it('does not invent proposal or conversation access when none was authorized', () => {
        const filter = buildCommitmentVisibilityFilter('user-1', []);

        expect(filter).toBe(
            'owner_user_id.eq.user-1,assigned_to_user_id.eq.user-1'
        );
    });
});
