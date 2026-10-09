-- PING PRODUCTION BRIDGE POSTCHECK
-- READ-ONLY. Run only after an explicitly authorized bridge execution.

with required_rc(table_name) as (
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
table_checks as (
    select 'rc_required_tables' as check_name,
           case when count(*) = 27 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' of 27 required RC tables present' as details
    from required_rc
    where to_regclass('public.' || required_rc.table_name) is not null
),
preservation_checks as (
    select 'auth_users_preserved', case when count(*) = 4 then 'PASS' else 'FAIL' end, count(*)::text || ' Auth users'
    from auth.users
    union all select 'storage_buckets_preserved', case when count(*) = 2 then 'PASS' else 'FAIL' end, count(*)::text || ' buckets' from storage.buckets
    union all select 'storage_objects_preserved', case when count(*) = 48 then 'PASS' else 'FAIL' end, count(*)::text || ' objects' from storage.objects
),
function_checks as (
    select 'handle_new_user_security_definer' as check_name,
           case when p.prosecdef and pg_get_function_result(p.oid) = 'trigger' then 'PASS' else 'FAIL' end as status,
           'search_path=' || coalesce(array_to_string(p.proconfig, ','), 'unset') as details
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
    limit 1
),
rls_checks as (
    select c.relname as check_name,
           case when c.relrowsecurity then 'PASS' else 'FAIL' end as status,
           'RLS enabled=' || c.relrowsecurity::text as details
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles','messages','commitments','commitment_events','contacts',
                        'conversations','conversation_participants','message_reactions',
                        'user_calendar_accounts','ai_messages','calls','attachments',
                        'audio_transcriptions','memory_records','memory_record_evidence',
                        'agent_authorizations','agent_executions','agent_turn_admissions',
                        'agent_turn_semantic_checkpoints','agent_dialogue_checkpoints',
                        'agent_turn_sequence_allocators')
),
required_functions(function_name) as (
    values
      ('handle_new_user'), ('update_updated_at_column'),
      ('update_conversation_last_message'), ('confirm_commitment_proposal'),
      ('create_commitment_proposal_with_evidence'),
      ('apply_commitment_transition_with_evidence'),
      ('create_conversation_with_participants'), ('mark_message_receipt'),
      ('mark_conversation_read'), ('tombstone_message'),
      ('tombstone_conversation'), ('persist_message_with_attachment'),
      ('create_message_attachment_intent'), ('complete_message_attachment'),
      ('claim_audio_transcription_job'), ('complete_audio_transcription_job'),
      ('claim_agent_authorization_for_execution'),
      ('claim_agent_execution_step'), ('complete_agent_execution_step'),
      ('admit_agent_turn'), ('claim_agent_turn_admission'),
      ('complete_agent_turn_admission'), ('apply_agent_turn_atomically'),
      ('reconcile_agent_turn_application'), ('admit_agent_turn_with_routing_mode')
),
function_inventory as (
    select 'required_function_inventory' as check_name,
           case when count(distinct p.proname) = (select count(*) from required_functions)
                then 'PASS' else 'FAIL' end as status,
           count(distinct p.proname)::text || ' of ' || (select count(*) from required_functions)::text || ' required function names present' as details
    from required_functions f
    left join pg_proc p on p.proname = f.function_name
    left join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' or p.oid is null
),
column_inventory as (
    select 'required_column_inventory' as check_name,
           case when count(*) = 12 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' critical RC columns present' as details
    from information_schema.columns c
    where c.table_schema = 'public'
      and (c.table_name, c.column_name) in (
        ('profiles','id'), ('profiles','email'), ('messages','sender_id'),
        ('messages','conversation_id'), ('commitments','owner_user_id'),
        ('commitments','due_at'), ('commitment_events','commitment_id'),
        ('attachments','message_id'), ('audio_transcriptions','attachment_id'),
        ('agent_authorizations','authorization_id'), ('agent_executions','authorization_id'),
        ('agent_turn_admissions','turn_id')
      )
),
legacy_client_boundary as (
    select 'legacy_client_access_revoked' as check_name,
           case when not exists (
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
           ) then 'PASS' else 'FAIL' end as status,
           'no direct client SELECT on legacy tables; service_role is backend boundary' as details
),
security_definer_boundary as (
    select 'security_definer_boundary' as check_name,
           case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' public SECURITY DEFINER functions without explicit search_path' as details
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not (coalesce(p.proconfig, array[]::text[]) @> array['search_path=public'])
),
auth_profile_boundary as (
    select 'auth_profiles_reconciled' as check_name,
           case when (select count(*) from auth.users) = (select count(*) from public.profiles)
                  and not exists (select 1 from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))
                then 'PASS' else 'FAIL' end as status,
           (select count(*) from public.profiles)::text || ' profiles for ' || (select count(*) from auth.users)::text || ' Auth users' as details
),
critical_trigger_boundary as (
    select 'critical_triggers_present' as check_name,
           case when count(*) >= 2 then 'PASS' else 'FAIL' end as status,
           count(*)::text || ' critical triggers present' as details
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and t.tgname in ('on_auth_user_created','trg_update_conversation_last_message',
                       'trg_validate_commitment_consistency','commitments_require_resolution_result')
)
select * from table_checks
union all select * from preservation_checks
union all select * from function_checks
union all select * from rls_checks
union all select * from function_inventory
union all select * from column_inventory
union all select * from legacy_client_boundary
union all select * from security_definer_boundary
union all select * from auth_profile_boundary
union all select * from critical_trigger_boundary
order by check_name;
