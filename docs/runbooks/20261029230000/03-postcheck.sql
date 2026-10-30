-- Read-only. Run AFTER applying. Every row must say ok = true.
select 'messages INSERT revoked' as check, not has_table_privilege('authenticated', 'public.messages', 'INSERT') as ok
union all select 'messages UPDATE revoked', not has_table_privilege('authenticated', 'public.messages', 'UPDATE')
union all select 'messages DELETE revoked', not has_table_privilege('authenticated', 'public.messages', 'DELETE')
union all select 'messages SELECT kept', has_table_privilege('authenticated', 'public.messages', 'SELECT')
union all select 'messages_insert_own dropped', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert_own')
union all select 'profiles SELECT kept', has_table_privilege('authenticated', 'public.profiles', 'SELECT')
union all select 'profiles email locked', not has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
union all select 'profiles avatar_object_path locked', not has_column_privilege('authenticated', 'public.profiles', 'avatar_object_path', 'UPDATE')
union all select 'profiles ' || column_name || ' writable', has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE')
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('privacy_read_receipts','privacy_last_seen','last_seen','timezone','country_code','language_code');
