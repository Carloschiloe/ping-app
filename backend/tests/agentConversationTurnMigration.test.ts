import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261023030000_fix_agent_conversation_turn_persistence.sql',
);

describe('durable Agent conversation migration', () => {
    it('qualifies INSERT RETURNING columns so the output created_at is not ambiguous', () => {
        const sql = readFileSync(MIGRATION_PATH, 'utf8');

        expect(sql).toMatch(/insert into public\.agent_conversation_turns as inserted/);
        expect(sql).toMatch(/returning inserted\.id, inserted\.created_at into v_new_id, v_new_created_at/);
        expect(sql).not.toMatch(/returning id, created_at into v_new_id, v_new_created_at/);
    });
});
