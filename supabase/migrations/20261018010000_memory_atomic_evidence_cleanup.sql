-- Ping Memory 3E — atomic evidence cleanup.
--
-- Evidence deletion, evidence_refs projection, and lifecycle invalidation commit
-- as one database transaction. The internal helper is SECURITY INVOKER:
-- the backend calls it through service_role-only wrappers, while client roles
-- cannot execute any of these functions directly.
--
-- memory_record_evidence is the authority. evidence_refs is rebuilt while the
-- source evidence is being removed, so no intermediate active-with-empty-cache
-- state is observable.

create or replace function public._cleanup_memory_evidence(
    p_source_type text,
    p_source_id uuid,
    p_owner_user_id uuid,
    p_conversation_id uuid,
    p_mark_deleted boolean
)
returns table (
    memory_record_id uuid,
    remaining_evidence_count integer,
    invalidated boolean
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
    current_memory_id uuid;
    remaining_count integer;
    remaining_refs jsonb;
    next_status text;
begin
    if (p_source_type is null) <> (p_source_id is null) then
        raise exception 'source_type and source_id must be provided together';
    end if;

    if p_mark_deleted and p_owner_user_id is null then
        raise exception 'owner_user_id is required for account deletion';
    end if;

    for current_memory_id in
        select mr.id
        from public.memory_records mr
        where (p_owner_user_id is null or mr.owner_user_id = p_owner_user_id)
          and (
              (
                  p_source_type is not null
                  and exists (
                      select 1
                      from public.memory_record_evidence mre
                      where mre.memory_record_id = mr.id
                        and mre.source_type = p_source_type
                        and mre.source_id = p_source_id
                  )
              )
              or (
                  p_conversation_id is not null
                  and (
                      mr.conversation_id = p_conversation_id
                      or exists (
                          select 1
                          from public.memory_record_evidence mre
                          where mre.memory_record_id = mr.id
                            and mre.conversation_id = p_conversation_id
                      )
                  )
              )
              or p_mark_deleted
          )
        order by mr.id
        for update
    loop
        delete from public.memory_record_evidence mre
        where mre.memory_record_id = current_memory_id
          and (
              p_mark_deleted
              or (
                  p_source_type is not null
                  and mre.source_type = p_source_type
                  and mre.source_id = p_source_id
              )
              or (
                  p_conversation_id is not null
                  and (
                      mre.conversation_id = p_conversation_id
                      or exists (
                          select 1
                          from public.memory_records mr_direct
                          where mr_direct.id = current_memory_id
                            and mr_direct.conversation_id = p_conversation_id
                      )
                  )
              )
          );

        select
            count(*)::integer,
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'sourceType', mre.source_type,
                        'sourceId', mre.source_id,
                        'messageId', mre.message_id,
                        'conversationId', mre.conversation_id,
                        'timestamp', mre.occurred_at
                    )
                    order by mre.created_at, mre.id
                ),
                '[]'::jsonb
            )
        into remaining_count, remaining_refs
        from public.memory_record_evidence mre
        where mre.memory_record_id = current_memory_id;

        update public.memory_records mr
        set
            evidence_refs = remaining_refs,
            status = case
                when p_mark_deleted then 'deleted'
                when remaining_count = 0 and mr.status <> 'deleted' then 'invalidated'
                else mr.status
            end
        where mr.id = current_memory_id;

        select mr.status
        into next_status
        from public.memory_records mr
        where mr.id = current_memory_id;

        memory_record_id := current_memory_id;
        remaining_evidence_count := remaining_count;
        invalidated := next_status = 'invalidated';
        return next;
    end loop;
end;
$$;

create or replace function public.invalidate_memory_evidence_for_source(
    p_source_type text,
    p_source_id uuid
)
returns table (
    memory_record_id uuid,
    remaining_evidence_count integer,
    invalidated boolean
)
language sql
volatile
security invoker
set search_path = public
as $$
    select *
    from public._cleanup_memory_evidence(
        p_source_type,
        p_source_id,
        null,
        null,
        false
    );
$$;

create or replace function public.revalidate_memory_evidence_for_owner_source(
    p_owner_user_id uuid,
    p_source_type text,
    p_source_id uuid
)
returns table (
    memory_record_id uuid,
    remaining_evidence_count integer,
    invalidated boolean
)
language sql
volatile
security invoker
set search_path = public
as $$
    select *
    from public._cleanup_memory_evidence(
        p_source_type,
        p_source_id,
        p_owner_user_id,
        null,
        false
    );
$$;

create or replace function public.invalidate_memory_evidence_for_conversation(
    p_conversation_id uuid
)
returns table (
    memory_record_id uuid,
    remaining_evidence_count integer,
    invalidated boolean
)
language sql
volatile
security invoker
set search_path = public
as $$
    select *
    from public._cleanup_memory_evidence(
        null,
        null,
        null,
        p_conversation_id,
        false
    );
$$;

create or replace function public.delete_memory_for_account(
    p_owner_user_id uuid
)
returns table (
    memory_record_id uuid,
    remaining_evidence_count integer,
    invalidated boolean
)
language sql
volatile
security invoker
set search_path = public
as $$
    select *
    from public._cleanup_memory_evidence(
        null,
        null,
        p_owner_user_id,
        null,
        true
    );
$$;

revoke all on function public._cleanup_memory_evidence(text, uuid, uuid, uuid, boolean)
    from public, anon, authenticated;
revoke all on function public.invalidate_memory_evidence_for_source(text, uuid)
    from public, anon, authenticated;
revoke all on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid)
    from public, anon, authenticated;
revoke all on function public.invalidate_memory_evidence_for_conversation(uuid)
    from public, anon, authenticated;
revoke all on function public.delete_memory_for_account(uuid)
    from public, anon, authenticated;

grant execute on function public._cleanup_memory_evidence(text, uuid, uuid, uuid, boolean)
    to service_role;
grant execute on function public.invalidate_memory_evidence_for_source(text, uuid)
    to service_role;
grant execute on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid)
    to service_role;
grant execute on function public.invalidate_memory_evidence_for_conversation(uuid)
    to service_role;
grant execute on function public.delete_memory_for_account(uuid)
    to service_role;

comment on function public.invalidate_memory_evidence_for_source(text, uuid) is
    'Atomic Memory evidence cleanup for a deleted source. Backend service_role only.';
comment on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid) is
    'Atomic owner-scoped Memory evidence cleanup after authorization loss. Backend service_role only.';
comment on function public.invalidate_memory_evidence_for_conversation(uuid) is
    'Atomic Memory evidence cleanup after a conversation is deleted. Backend service_role only.';
comment on function public.delete_memory_for_account(uuid) is
    'Atomic soft deletion of an owner memory set and its evidence. Backend service_role only.';
