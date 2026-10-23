-- Ping Agent: reversible per-conversation history clearing.
-- Durable Agent events remain for audit/recovery; this cutoff controls the
-- user-facing projection and never deletes commitments or human messages.

alter table public.conversations
    add column if not exists agent_history_cleared_at timestamptz;

comment on column public.conversations.agent_history_cleared_at is
    'Exclusive visibility cutoff for the user-facing Ping Agent history; does not delete messages, commitments, or durable events.';
