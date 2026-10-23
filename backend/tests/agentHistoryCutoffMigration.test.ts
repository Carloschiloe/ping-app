import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261023050000_agent_history_cutoff.sql',
);
const RESET_MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261023051000_agent_dialogue_checkpoint_reset.sql',
);

describe('reversible Agent history cutoff migration', () => {
    it('adds only the per-conversation visibility marker and never deletes history', () => {
        const sql = readFileSync(MIGRATION_PATH, 'utf8');
        expect(sql).toMatch(/add column if not exists agent_history_cleared_at timestamptz/i);
        expect(sql).not.toMatch(/delete\s+from/i);
        expect(sql).not.toMatch(/drop\s+table/i);
    });
});

describe('safe Agent dialogue checkpoint reset migration', () => {
    it('resets only the active projection and preserves turn sequencing', () => {
        const sql = readFileSync(RESET_MIGRATION_PATH, 'utf8');
        expect(sql).toMatch(/reset_agent_dialogue_checkpoint/i);
        expect(sql).toMatch(/clear_agent_conversation_history/i);
        expect(sql).toMatch(/conversation_participants/);
        expect(sql).toMatch(/active_dialogue\s*=\s*null/i);
        expect(sql).toMatch(/suspended_dialogue\s*=\s*null/i);
        expect(sql).toMatch(/version\s*=\s*version\s*\+\s*1/i);
        expect(sql).toMatch(/last_applied_turn_sequence/);
        expect(sql).not.toMatch(/delete\s+from/i);
        expect(sql).not.toMatch(/drop\s+table/i);
    });
});
