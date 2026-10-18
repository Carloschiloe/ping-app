-- Ping Memory 3E — atomic evidence cleanup.
--
-- Evidence deletion, evidence_refs projection, and lifecycle invalidation must
-- commit as one database transaction. These functions are SECURITY INVOKER:
-- the backend calls them with service_role, while public/anon/authenticated
-- cannot execute them directly.
--
-- The normalized memory_record_evidence table remains the authority. The
-- jsonb evidence_refs column is rebuilt from it in the same statement that
-- removes source evidence, so no intermediate active-with-empty-cache state is
-- observable.

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
    with affected as (
        select distinct mre.memory_record_id
        from public.memory_record_evidence mre
        where mre.source_type = p_source_type
          and mre.source_id = p_source_id
    ),
    removed as (
        delete from public.memory_record_evidence mre
        using affected a
        where mre.memory_record_id = a.memory_record_id
          and mre.source_type = p_source_type
          and mre.source_id = p_source_id
        returning mre.memory_record_id
    ),
    remaining as (
        select
            mr.id as memory_record_id,
            count(mre.id)::integer as remaining_evidence_count,
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
                ) filter (where mre.id is not null),
                '[]'::jsonb
            ) as evidence_refs
        from public.memory_records mr
        join (select distinct memory_record_id from removed) r
          on r.memory_record_id = mr.id
        left join public.memory_record_evidence mre
          on mre.memory_record_id = mr.id
        group by mr.id
    ),
    updated as (
        update public.memory_records mr
        set
            evidence_refs = r.evidence_refs,
            status = case
                when r.remaining_evidence_count = 0 and mr.status <> 'deleted'
                    then 'invalidated'
                else mr.status
            end
        from remaining r
        where mr.id = r.memory_record_id
        returning
            mr.id as memory_record_id,
            r.remaining_evidence_count,
            (mr.status = 'invalidated') as invalidated
    )
    select memory_record_id, remaining_evidence_count, invalidated
    from updated
    order by memory_record_id;
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
    with affected as (
        select distinct mre.memory_record_id
        from public.memory_record_evidence mre
        join public.memory_records mr on mr.id = mre.memory_record_id
        where mr.owner_user_id = p_owner_user_id
          and mre.source_type = p_source_type
          and mre.source_id = p_source_id
    ),
    removed as (
        delete from public.memory_record_evidence mre
        using affected a
        where mre.memory_record_id = a.memory_record_id
          and mre.source_type = p_source_type
          and mre.source_id = p_source_id
        returning mre.memory_record_id
    ),
    remaining as (
        select
            mr.id as memory_record_id,
            count(mre.id)::integer as remaining_evidence_count,
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
                ) filter (where mre.id is not null),
                '[]'::jsonb
            ) as evidence_refs
        from public.memory_records mr
        join (select distinct memory_record_id from removed) r
          on r.memory_record_id = mr.id
        left join public.memory_record_evidence mre
          on mre.memory_record_id = mr.id
        group by mr.id
    ),
    updated as (
        update public.memory_records mr
        set
            evidence_refs = r.evidence_refs,
            status = case
                when r.remaining_evidence_count = 0 and mr.status <> 'deleted'
                    then 'invalidated'
                else mr.status
            end
        from remaining r
        where mr.id = r.memory_record_id
        returning
            mr.id as memory_record_id,
            r.remaining_evidence_count,
            (mr.status = 'invalidated') as invalidated
    )
    select memory_record_id, remaining_evidence_count, invalidated
    from updated
    order by memory_record_id;
$$;

revoke execute on function public.invalidate_memory_evidence_for_source(text, uuid)
    from public, anon, authenticated;
revoke execute on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid)
    from public, anon, authenticated;

grant execute on function public.invalidate_memory_evidence_for_source(text, uuid)
    to service_role;
grant execute on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid)
    to service_role;

comment on function public.invalidate_memory_evidence_for_source(text, uuid) is
    'Atomic Memory evidence cleanup for a deleted source. Backend service_role only.';
comment on function public.revalidate_memory_evidence_for_owner_source(uuid, text, uuid) is
    'Atomic owner-scoped Memory evidence cleanup after authorization loss. Backend service_role only.';
