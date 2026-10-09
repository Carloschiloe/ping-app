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
)
select * from table_checks
union all select * from preservation_checks
union all select * from function_checks
union all select * from rls_checks
order by check_name;
