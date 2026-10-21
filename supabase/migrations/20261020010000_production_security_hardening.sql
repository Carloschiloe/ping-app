-- Production security hardening for the canonical Ping schema.
-- This is intentionally idempotent and does not alter user data.

alter function public.handle_new_user() set search_path = public;

do $$
begin
    if to_regclass('public.message_reactions') is not null then
        drop policy if exists message_reactions_delete_own on public.message_reactions;

        create policy message_reactions_delete_own
            on public.message_reactions for delete
            to authenticated
            using (
                user_id = (select auth.uid())
                and exists (
                    select 1
                    from public.messages m
                    where m.id = message_reactions.message_id
                      and public.is_conversation_participant(m.conversation_id, (select auth.uid()))
                )
            );
    end if;
end $$;
