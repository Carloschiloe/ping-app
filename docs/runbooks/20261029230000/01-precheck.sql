-- Read-only. Run BEFORE applying 20261029230000 and save the output:
-- it is the exact state the rollback must restore.
select 'messages' as tbl, p.privilege_type, has_table_privilege('authenticated', 'public.messages', p.privilege_type) as granted
from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p(privilege_type)
union all
select 'profiles', p.privilege_type, has_table_privilege('authenticated', 'public.profiles', p.privilege_type)
from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as p(privilege_type)
order by 1, 2;

-- Columns the migration keeps writable; a missing one is skipped, not an error.
select w.column_name,
       c.column_name is not null as exists_in_profiles
from unnest(array['privacy_read_receipts','privacy_last_seen','last_seen','timezone','country_code','language_code']) as w(column_name)
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = w.column_name;

-- Policies on messages (messages_insert_own is dropped by the migration).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'messages'
order by policyname;

-- Was the migration already applied?
select version from supabase_migrations.schema_migrations where version = '20261029230000';
