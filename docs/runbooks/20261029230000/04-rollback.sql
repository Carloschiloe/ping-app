-- Restores the pre-migration state recorded by 01-precheck.sql. Only run if
-- the app breaks after applying. If the precheck showed a privilege as false,
-- remove it from these grants before running.
begin;

grant insert, update, delete on table public.messages to authenticated;

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
    on public.messages for insert
    to authenticated
    with check (
        sender_id = (select auth.uid())
        and (
            conversation_id is null
            or public.is_conversation_participant(conversation_id, (select auth.uid()))
        )
    );

grant update on table public.profiles to authenticated;

commit;
