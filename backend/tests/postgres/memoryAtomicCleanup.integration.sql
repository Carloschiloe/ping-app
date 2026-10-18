\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email)
values
    ('a5300000-0000-4000-8000-000000000101', 'memory-atomic-owner@example.invalid'),
    ('a5300000-0000-4000-8000-000000000102', 'memory-atomic-other@example.invalid');

set local role service_role;

insert into public.memory_records (
    id, owner_user_id, memory_type, predicate, object_value, canonical_text,
    source_type, source_id, evidence_refs, observed_at, status, confidence,
    sensitivity, visibility_scope, extraction_method, content_hash
)
values
    (
        'a5300000-0000-4000-8000-000000000110',
        'a5300000-0000-4000-8000-000000000101',
        'semantic', 'prefers', 'coffee', 'Owner prefers coffee',
        'manual', 'a5300000-0000-4000-8000-000000000120',
        '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000120"},{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000121"}]'::jsonb,
        now(), 'active', 1.0, 'normal', 'private', 'manual',
        'memory-atomic-owner-two-evidence'
    ),
    (
        'a5300000-0000-4000-8000-000000000111',
        'a5300000-0000-4000-8000-000000000101',
        'semantic', 'likes', 'tea', 'Owner likes tea',
        'manual', 'a5300000-0000-4000-8000-000000000120',
        '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000120"}]'::jsonb,
        now(), 'active', 1.0, 'normal', 'private', 'manual',
        'memory-atomic-owner-one-evidence'
    ),
    (
        'a5300000-0000-4000-8000-000000000112',
        'a5300000-0000-4000-8000-000000000102',
        'semantic', 'likes', 'tea', 'Other owner likes tea',
        'manual', 'a5300000-0000-4000-8000-000000000120',
        '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000120"}]'::jsonb,
        now(), 'active', 1.0, 'normal', 'private', 'manual',
        'memory-atomic-other-owner'
    );

insert into public.memory_record_evidence (
    memory_record_id, source_type, source_id, occurred_at
)
values
    ('a5300000-0000-4000-8000-000000000110', 'manual', 'a5300000-0000-4000-8000-000000000120', now()),
    ('a5300000-0000-4000-8000-000000000110', 'manual', 'a5300000-0000-4000-8000-000000000121', now()),
    ('a5300000-0000-4000-8000-000000000111', 'manual', 'a5300000-0000-4000-8000-000000000120', now()),
    ('a5300000-0000-4000-8000-000000000112', 'manual', 'a5300000-0000-4000-8000-000000000120', now());

select 1 / case when count(*) = 2 then 1 else 0 end
from public.revalidate_memory_evidence_for_owner_source(
    'a5300000-0000-4000-8000-000000000101',
    'manual',
    'a5300000-0000-4000-8000-000000000120'
);

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000110'
      and status = 'active'
      and jsonb_array_length(evidence_refs) = 1
      and evidence_refs @> '[{"sourceId":"a5300000-0000-4000-8000-000000000121"}]'::jsonb
) then 1 else 0 end;

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000111'
      and status = 'invalidated'
      and evidence_refs = '[]'::jsonb
) then 1 else 0 end;

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000112'
      and status = 'active'
      and jsonb_array_length(evidence_refs) = 1
) then 1 else 0 end;

select 1 / case when count(*) = 1 then 1 else 0 end
from public.memory_record_evidence
where source_type = 'manual'
  and source_id = 'a5300000-0000-4000-8000-000000000120'
  and memory_record_id = 'a5300000-0000-4000-8000-000000000112';

select 1 / case when count(*) = 1 then 1 else 0 end
from public.invalidate_memory_evidence_for_source(
    'manual',
    'a5300000-0000-4000-8000-000000000120'
);

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000112'
      and status = 'invalidated'
      and evidence_refs = '[]'::jsonb
) then 1 else 0 end;

insert into public.memory_records (
    id, owner_user_id, memory_type, predicate, object_value, canonical_text,
    source_type, source_id, evidence_refs, observed_at, status, confidence,
    sensitivity, visibility_scope, extraction_method, content_hash
)
values (
    'a5300000-0000-4000-8000-000000000113',
    'a5300000-0000-4000-8000-000000000101',
    'episodic', 'mentioned', 'project', 'Owner mentioned project',
    'manual', 'a5300000-0000-4000-8000-000000000130',
    '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000130","conversationId":"a5300000-0000-4000-8000-000000000131"}]'::jsonb,
    now(), 'active', 1.0, 'normal', 'private', 'manual',
    'memory-atomic-conversation-evidence'
);

insert into public.memory_record_evidence (
    memory_record_id, source_type, source_id, conversation_id, occurred_at
)
values (
    'a5300000-0000-4000-8000-000000000113',
    'manual',
    'a5300000-0000-4000-8000-000000000130',
    'a5300000-0000-4000-8000-000000000131',
    now()
);

select 1 / case when count(*) = 1 then 1 else 0 end
from public.invalidate_memory_evidence_for_conversation(
    'a5300000-0000-4000-8000-000000000131'
);

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000113'
      and status = 'invalidated'
      and evidence_refs = '[]'::jsonb
) then 1 else 0 end;

select 1 / case when count(*) = 2 then 1 else 0 end
from public.delete_memory_for_account(
    'a5300000-0000-4000-8000-000000000101'
);

select 1 / case when count(*) = 3 then 1 else 0 end
from public.memory_records
where owner_user_id = 'a5300000-0000-4000-8000-000000000101'
  and status = 'deleted'
  and evidence_refs = '[]'::jsonb;

reset role;

do $$
begin
    if has_function_privilege('anon', 'public.invalidate_memory_evidence_for_source(text,uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.invalidate_memory_evidence_for_source(text,uuid)', 'execute')
       or has_function_privilege('anon', 'public.revalidate_memory_evidence_for_owner_source(uuid,text,uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.revalidate_memory_evidence_for_owner_source(uuid,text,uuid)', 'execute')
       or has_function_privilege('anon', 'public.invalidate_memory_evidence_for_conversation(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.invalidate_memory_evidence_for_conversation(uuid)', 'execute')
       or has_function_privilege('anon', 'public.delete_memory_for_account(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.delete_memory_for_account(uuid)', 'execute') then
        raise exception 'memory cleanup RPCs are exposed to client roles';
    end if;
    if not has_function_privilege('service_role', 'public.invalidate_memory_evidence_for_source(text,uuid)', 'execute')
       or not has_function_privilege('service_role', 'public.revalidate_memory_evidence_for_owner_source(uuid,text,uuid)', 'execute')
       or not has_function_privilege('service_role', 'public.invalidate_memory_evidence_for_conversation(uuid)', 'execute')
       or not has_function_privilege('service_role', 'public.delete_memory_for_account(uuid)', 'execute') then
        raise exception 'service_role cannot execute memory cleanup RPCs';
    end if;
end;
$$;

rollback;

select 'Memory atomic evidence cleanup integration passed' as result;
