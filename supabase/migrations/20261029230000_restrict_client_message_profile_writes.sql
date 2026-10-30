-- Restrict direct client (PostgREST, anon key + user JWT) writes that bypass
-- the backend's canonical paths.
--
-- 1) messages: every message is created/edited/tombstoned by the backend with
--    the service role (messagingApplication / attachmentApplication). The
--    mobile client never writes public.messages directly. The legacy
--    messages_insert_own policy plus the broad grant let any participant insert
--    arbitrary rows (system events, metadata, media references) and skip
--    validation, idempotency, memory and push.
-- 2) profiles: the client only updates its own privacy toggles and
--    presence/locale fields. Identity and file-reference columns (email,
--    phone, avatar_*, expo_push_token, ...) must only change through the
--    backend, which validates and signs them.
--
-- Additive and idempotent. Rollback: re-grant the previous privileges
-- (grant insert, update, delete on public.messages to authenticated; grant
-- update on public.profiles to authenticated) and recreate the policy from
-- 20261012235001_production_legacy_compatibility_and_api_hardening.sql.

drop policy if exists messages_insert_own on public.messages;
revoke insert, update, delete on table public.messages from authenticated;

revoke update on table public.profiles from authenticated;

do $$
declare
    v_column text;
begin
    -- Some of these columns predate versioned migrations in production; grant
    -- only those that exist so the migration applies on every environment.
    foreach v_column in array array[
        'privacy_read_receipts',
        'privacy_last_seen',
        'last_seen',
        'timezone',
        'country_code',
        'language_code'
    ] loop
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'profiles'
              and column_name = v_column
        ) then
            execute format('grant update (%I) on table public.profiles to authenticated', v_column);
        end if;
    end loop;
end
$$;
