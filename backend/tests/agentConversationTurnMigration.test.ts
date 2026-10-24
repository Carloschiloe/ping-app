import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261023030000_fix_agent_conversation_turn_persistence.sql',
);
const ATOMIC_HISTORY_MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261024162334_agent_history_atomic_projection.sql',
);
const EXECUTION_OUTBOX_MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261024164210_agent_execution_history_outbox.sql',
);

describe('durable Agent conversation migration', () => {
    it('qualifies INSERT RETURNING columns so the output created_at is not ambiguous', () => {
        const sql = readFileSync(MIGRATION_PATH, 'utf8');

        expect(sql).toMatch(/insert into public\.agent_conversation_turns as inserted/);
        expect(sql).toMatch(/returning inserted\.id, inserted\.created_at into v_new_id, v_new_created_at/);
        expect(sql).not.toMatch(/returning id, created_at into v_new_id, v_new_created_at/);
    });

    it('keeps checkpoint/admission completion and history projection in one RPC transaction', () => {
        const sql = readFileSync(ATOMIC_HISTORY_MIGRATION_PATH, 'utf8');

        expect(sql).toMatch(/create or replace function public\.apply_agent_turn_atomically_with_history/);
        expect(sql).toMatch(/from public\.apply_agent_turn_atomically\(/);
        expect(sql).toMatch(/perform public\.persist_agent_conversation_turn\(/);
        expect(sql).toMatch(/create or replace function public\.complete_agent_turn_with_history/);
        expect(sql).toMatch(/from public\.complete_agent_turn_admission\(/);
        expect(sql).toMatch(/grant execute on function public\.apply_agent_turn_atomically_with_history/);
        expect(sql).toMatch(/grant execute on function public\.complete_agent_turn_with_history/);
    });

    it('creates the execution-history outbox before effects and exposes only service-role RPCs', () => {
        const sql = readFileSync(EXECUTION_OUTBOX_MIGRATION_PATH, 'utf8');

        expect(sql).toMatch(/create table if not exists public\.agent_execution_history_outbox/);
        expect(sql).toMatch(/create or replace function public\.claim_agent_authorization_for_execution_with_history/);
        expect(sql).toMatch(/insert into public\.agent_execution_history_outbox/);
        expect(sql).toMatch(/create or replace function public\.stage_agent_execution_history/);
        expect(sql).toMatch(/create or replace function public\.complete_agent_execution_history/);
        expect(sql).toMatch(/revoke all on function public\.claim_agent_authorization_for_execution_with_history/);
        expect(sql).toMatch(/grant execute on function public\.stage_agent_execution_history/);
    });
});
