-- Agent durable state is backend-only. The mobile client reaches it through
-- Ping's authenticated API and must never query or mutate these tables through
-- PostgREST/GraphQL with an end-user role.
revoke all on table
    public.agent_conversation_turns,
    public.agent_turn_admissions,
    public.agent_turn_sequence_allocators,
    public.agent_dialogue_checkpoints,
    public.agent_turn_semantic_checkpoints
from anon, authenticated;

-- Keep the deny-by-default intent explicit for the two internal relations that
-- do not need an actor-facing read policy. service_role bypasses RLS.
drop policy if exists agent_conversation_turns_no_client_access on public.agent_conversation_turns;
create policy agent_conversation_turns_no_client_access
    on public.agent_conversation_turns
    for all to anon, authenticated
    using (false)
    with check (false);

drop policy if exists agent_turn_sequence_allocators_no_client_access on public.agent_turn_sequence_allocators;
create policy agent_turn_sequence_allocators_no_client_access
    on public.agent_turn_sequence_allocators
    for all to anon, authenticated
    using (false)
    with check (false);
