import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

describe('Phase 3C: Memory provider sensitivity boundary', () => {
    it('adds the normal-only filter before agent-facing memory retrieval', async () => {
        const mock = createSupabaseAdminMock({
            memory_records: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { PostgresMemorySearchProvider } = await import('../src/services/memorySearchProvider');

        await expect(new PostgresMemorySearchProvider().search({
            ownerUserId: 'owner-1',
            subjectPersonId: null,
            subjectContactId: null,
            topicQuery: null,
            timeRange: null,
            memoryTypes: null,
            sourceTypes: null,
            freshness: 'any',
            limit: 10,
        })).resolves.toEqual([]);

        expect(mock.getEqCalls('memory_records')).toContainEqual(['sensitivity', 'normal']);
    });
});
