\set ON_ERROR_STOP on

-- Direct client (authenticated JWT through PostgREST) write surface. Messages
-- are backend-owned; profiles allow only the self-service toggles the mobile
-- app writes (privacy, presence, locale).
do $$
declare
    v_privilege text;
begin
    foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege('authenticated', 'public.messages', v_privilege) then
            raise exception 'authenticated must not have % on public.messages', v_privilege;
        end if;
    end loop;
    if not has_table_privilege('authenticated', 'public.messages', 'SELECT') then
        raise exception 'authenticated must keep SELECT on public.messages (realtime and RLS reads)';
    end if;
    if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_insert_own'
    ) then
        raise exception 'legacy messages_insert_own policy must be dropped';
    end if;

    if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
        raise exception 'authenticated must not have table-wide UPDATE on public.profiles';
    end if;
    foreach v_privilege in array array['email', 'phone', 'avatar_url', 'avatar_bucket', 'avatar_object_path', 'expo_push_token', 'full_name'] loop
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles' and column_name = v_privilege
        ) and has_column_privilege('authenticated', 'public.profiles', v_privilege, 'UPDATE') then
            raise exception 'authenticated must not update profiles.%', v_privilege;
        end if;
    end loop;
    foreach v_privilege in array array['privacy_read_receipts', 'privacy_last_seen', 'last_seen', 'timezone'] loop
        if not has_column_privilege('authenticated', 'public.profiles', v_privilege, 'UPDATE') then
            raise exception 'authenticated must keep UPDATE on profiles.%', v_privilege;
        end if;
    end loop;
end
$$;

select 'client write privileges ok' as result;
