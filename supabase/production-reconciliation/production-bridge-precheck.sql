-- PING PRODUCTION BRIDGE PRECHECK
-- READ-ONLY. Never execute through a migration runner.
-- Expected evidence: 18 public tables, 0 public rows, 4 Auth users,
-- 2 Storage buckets, 48 Storage objects, historical project ref verified by
-- the external orchestrator.

with expected(table_name) as (
    values
      ('profiles'), ('messages'), ('commitments'), ('subscriptions'),
      ('contacts'), ('conversations'), ('conversation_participants'),
      ('message_reactions'), ('user_calendar_accounts'), ('ai_messages'),
      ('calls'), ('operation_checklists'), ('operation_checklist_items'),
      ('operation_checklist_runs'), ('operation_checklist_run_items'),
      ('shift_reports'), ('conversation_operation_focuses'),
      ('commitment_operation_progress')
),
table_checks as (
    select 'legacy_table_inventory' as check_name,
           case when count(*) = 18 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' public tables observed' as details
    from expected
    where to_regclass('public.' || expected.table_name) is not null
),
row_checks as (
    select 'public_row_baseline' as check_name,
           case when coalesce(sum(row_count), 0) = 0 then 'PASS' else 'FAIL' end as status,
           coalesce(sum(row_count), 0)::text || ' public rows observed' as details
    from (
      select (select count(*) from public.profiles) row_count
      union all select (select count(*) from public.messages)
      union all select (select count(*) from public.commitments)
      union all select (select count(*) from public.subscriptions)
      union all select (select count(*) from public.contacts)
      union all select (select count(*) from public.conversations)
      union all select (select count(*) from public.conversation_participants)
      union all select (select count(*) from public.message_reactions)
      union all select (select count(*) from public.user_calendar_accounts)
      union all select (select count(*) from public.ai_messages)
      union all select (select count(*) from public.calls)
      union all select (select count(*) from public.operation_checklists)
      union all select (select count(*) from public.operation_checklist_items)
      union all select (select count(*) from public.operation_checklist_runs)
      union all select (select count(*) from public.operation_checklist_run_items)
      union all select (select count(*) from public.shift_reports)
      union all select (select count(*) from public.conversation_operation_focuses)
      union all select (select count(*) from public.commitment_operation_progress)
    ) counts
),
preservation_checks as (
    select 'auth_preservation_baseline' as check_name,
           case when count(*) = 4 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' Auth users' as details
    from auth.users
    union all
    select 'storage_bucket_baseline', case when count(*) = 2 then 'PASS' else 'FAIL' end, count(*)::text || ' buckets'
    from storage.buckets
    union all
    select 'storage_object_baseline', case when count(*) = 48 then 'PASS' else 'FAIL' end, count(*)::text || ' objects'
    from storage.objects
),
security_checks as (
    select c.relname as check_name,
           case when c.relrowsecurity then 'PASS' else 'REVIEW' end as status,
           'RLS enabled=' || c.relrowsecurity::text || ', policies=' ||
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text as details
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('subscriptions','contacts','conversations','conversation_participants',
                        'operation_checklists','operation_checklist_items','operation_checklist_runs',
                        'operation_checklist_run_items','shift_reports','conversation_operation_focuses',
                        'commitment_operation_progress')
)
select * from table_checks
union all select * from row_checks
union all select * from preservation_checks
union all select * from security_checks
order by check_name;
