-- PING PRODUCTION BRIDGE PRECHECK
-- READ-ONLY. Never execute through a migration runner.
-- Expected evidence: 18 public tables, a captured per-table public-row baseline, 4 Auth users,
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
current_public_rows as (
    select 'profiles' as table_name, count(*)::bigint as row_count from public.profiles
    union all select 'messages', count(*) from public.messages
    union all select 'commitments', count(*) from public.commitments
    union all select 'subscriptions', count(*) from public.subscriptions
    union all select 'contacts', count(*) from public.contacts
    union all select 'conversations', count(*) from public.conversations
    union all select 'conversation_participants', count(*) from public.conversation_participants
    union all select 'message_reactions', count(*) from public.message_reactions
    union all select 'user_calendar_accounts', count(*) from public.user_calendar_accounts
    union all select 'ai_messages', count(*) from public.ai_messages
    union all select 'calls', count(*) from public.calls
    union all select 'operation_checklists', count(*) from public.operation_checklists
    union all select 'operation_checklist_items', count(*) from public.operation_checklist_items
    union all select 'operation_checklist_runs', count(*) from public.operation_checklist_runs
    union all select 'operation_checklist_run_items', count(*) from public.operation_checklist_run_items
    union all select 'shift_reports', count(*) from public.shift_reports
    union all select 'conversation_operation_focuses', count(*) from public.conversation_operation_focuses
    union all select 'commitment_operation_progress', count(*) from public.commitment_operation_progress
),
captured_public_rows(table_name, row_count) as (
    values
      ('profiles', (:'expected_public_profiles')::bigint),
      ('messages', (:'expected_public_messages')::bigint),
      ('commitments', (:'expected_public_commitments')::bigint),
      ('subscriptions', (:'expected_public_subscriptions')::bigint),
      ('contacts', (:'expected_public_contacts')::bigint),
      ('conversations', (:'expected_public_conversations')::bigint),
      ('conversation_participants', (:'expected_public_conversation_participants')::bigint),
      ('message_reactions', (:'expected_public_message_reactions')::bigint),
      ('user_calendar_accounts', (:'expected_public_user_calendar_accounts')::bigint),
      ('ai_messages', (:'expected_public_ai_messages')::bigint),
      ('calls', (:'expected_public_calls')::bigint),
      ('operation_checklists', (:'expected_public_operation_checklists')::bigint),
      ('operation_checklist_items', (:'expected_public_operation_checklist_items')::bigint),
      ('operation_checklist_runs', (:'expected_public_operation_checklist_runs')::bigint),
      ('operation_checklist_run_items', (:'expected_public_operation_checklist_run_items')::bigint),
      ('shift_reports', (:'expected_public_shift_reports')::bigint),
      ('conversation_operation_focuses', (:'expected_public_conversation_operation_focuses')::bigint),
      ('commitment_operation_progress', (:'expected_public_commitment_operation_progress')::bigint)
),
captured_public_total(total) as (
    values ((:'expected_public_total')::bigint)
),
row_checks as (
    select 'public_row_baseline' as check_name,
           case when not exists (
             select 1 from current_public_rows current_rows
             join captured_public_rows captured using (table_name)
             where current_rows.row_count <> captured.row_count
           ) and (select coalesce(sum(row_count), 0)::bigint from current_public_rows) = (select total from captured_public_total)
             then 'PASS' else 'FAIL' end as status,
           (select coalesce(string_agg(table_name || '=' || row_count::text, ',' order by table_name), '') from current_public_rows)
             || ' public row counts observed; compared with captured baseline total=' || (select total::text from captured_public_total) as details
),
preservation_checks as (
    select 'auth_preservation_baseline' as check_name,
           case when count(*) = (:'expected_auth_users')::bigint then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' Auth users; expected=' || (:'expected_auth_users')::text as details
    from auth.users
    union all
    select 'storage_bucket_baseline', case when count(*) = (:'expected_storage_buckets')::bigint then 'PASS' else 'FAIL' end, count(*)::text || ' buckets; expected=' || (:'expected_storage_buckets')::text
    from storage.buckets where id in ('chat-media', 'recordings')
    union all
    select 'storage_object_baseline', case when count(*) = (:'expected_storage_objects')::bigint then 'PASS' else 'FAIL' end, count(*)::text || ' objects; expected=' || (:'expected_storage_objects')::text
    from storage.objects where bucket_id in ('chat-media', 'recordings')
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
),
required_rc(table_name) as (
    values
      ('profiles'), ('messages'), ('commitments'), ('commitment_events'),
      ('contacts'), ('conversations'), ('conversation_participants'),
      ('message_reactions'), ('user_calendar_accounts'), ('ai_messages'),
      ('calls'), ('commitment_proposals'), ('commitment_proposal_events'),
      ('commitment_proposal_responses'), ('commitment_audit_records'),
      ('message_receipts'), ('message_events'), ('attachments'),
      ('audio_transcriptions'), ('memory_records'), ('memory_record_evidence'),
      ('agent_authorizations'), ('agent_executions'), ('agent_turn_admissions'),
      ('agent_turn_semantic_checkpoints'), ('agent_dialogue_checkpoints'),
      ('agent_turn_sequence_allocators')
),
legacy_rc_overlap(table_name) as (
    values
      ('profiles'), ('messages'), ('commitments'), ('contacts'),
      ('conversations'), ('conversation_participants'), ('message_reactions'),
      ('user_calendar_accounts'), ('ai_messages'), ('calls')
),
missing_legacy_rc(table_name) as (
    select overlap.table_name
    from legacy_rc_overlap overlap
    where to_regclass('public.' || overlap.table_name) is null
),
unexpected_forward_rc(table_name) as (
    select required.table_name
    from required_rc required
    where not exists (select 1 from legacy_rc_overlap overlap where overlap.table_name = required.table_name)
      and to_regclass('public.' || required.table_name) is not null
),
rc_presence as (
           select 'rc_required_table_inventory' as check_name,
           case when not exists (select 1 from missing_legacy_rc)
                     and not exists (select 1 from unexpected_forward_rc)
                then 'PASS' else 'FAIL' end as status,
           'legacy RC overlap expected=' ||
             (select string_agg(table_name, ',' order by table_name) from legacy_rc_overlap) ||
           '; missing=' || coalesce((select string_agg(table_name, ',' order by table_name) from missing_legacy_rc), 'none') ||
           '; unexpected forward-only=' || coalesce((select string_agg(table_name, ',' order by table_name) from unexpected_forward_rc), 'none') as details
),
legacy_client_access as (
    select 'legacy_client_access_boundary' as check_name,
           case when exists (
               select 1
               from unnest(array[
                   'subscriptions', 'contacts', 'conversations',
                   'conversation_participants', 'operation_checklists',
                   'operation_checklist_items', 'operation_checklist_runs',
                   'operation_checklist_run_items', 'shift_reports',
                   'conversation_operation_focuses', 'commitment_operation_progress'
               ]) as tables(table_name)
               where has_table_privilege('anon', 'public.' || tables.table_name, 'SELECT')
                  or has_table_privilege('authenticated', 'public.' || tables.table_name, 'SELECT')
           ) then 'REVIEW' else 'PASS' end as status,
           'backend uses service_role; bridge will deny direct client table access' as details
),
function_checks as (
    select 'security_definer_search_path' as check_name,
           case when count(*) = 0 then 'PASS' else 'REVIEW' end as status,
           count(*)::text || ' SECURITY DEFINER functions without explicit search_path' as details
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not (coalesce(p.proconfig, array[]::text[]) @> array['search_path=public'])
)
select * from table_checks
union all select * from row_checks
union all select * from preservation_checks
union all select * from security_checks
union all select * from rc_presence
union all select * from legacy_client_access
union all select * from function_checks
order by check_name;
