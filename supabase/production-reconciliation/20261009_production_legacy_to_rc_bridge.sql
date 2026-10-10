-- PING PRODUCTION BRIDGE
-- DO NOT AUTO-APPLY
-- REQUIRES BACKUP
-- REQUIRES EXPLICIT AUTHORIZATION
--
-- This file is intentionally outside supabase/migrations/. It is a candidate
-- for the historical project only. It is not part of staging or deploy CI.
-- It contains no destructive table/column operation and never touches storage.
-- The 11 legacy tables without RLS use a gated deny-by-default transition:
-- the operator must confirm that the RC backend is their only access path;
-- the bridge then enables RLS with no guessed client predicates and revokes
-- direct anon/authenticated privileges.

begin;

do $$
declare
    expected_auth_users bigint := nullif(current_setting('ping.expected_auth_users', true), '')::bigint;
    expected_storage_buckets bigint := nullif(current_setting('ping.expected_storage_buckets', true), '')::bigint;
    expected_storage_objects bigint := nullif(current_setting('ping.expected_storage_objects', true), '')::bigint;
begin
    if current_setting('ping.backup_created', true) <> 'YES'
        or current_setting('ping.backup_verified', true) <> 'YES'
        or current_setting('ping.auth_preservation_verified', true) <> 'YES'
        or current_setting('ping.storage_preservation_verified', true) <> 'YES'
        or current_setting('ping.legacy_client_access_reviewed', true) <> 'YES' then
        raise exception 'ABORT: backup, preservation, and legacy client-access review gates are required';
    end if;

    if expected_auth_users is null or expected_storage_buckets is null or expected_storage_objects is null then
        raise exception 'ABORT: runtime preservation baseline settings are required';
    end if;

    if to_regclass('public.profiles') is null
        or to_regclass('auth.users') is null
        or to_regclass('storage.buckets') is null
        or to_regclass('storage.objects') is null then
        raise exception 'ABORT: expected Auth, Storage, or profiles objects are missing';
    end if;

    if (select count(*) from auth.users) <> expected_auth_users
        or (select count(*) from storage.buckets where id in ('chat-media', 'recordings')) <> expected_storage_buckets
        or (select count(*) from storage.objects where bucket_id in ('chat-media', 'recordings')) <> expected_storage_objects then
        raise exception 'ABORT: preservation baseline changed';
    end if;

    if exists (select 1 from auth.users where email is null) then
        raise exception 'ABORT: an Auth identity has no email compatible with profiles.email';
    end if;

    if exists (
        select 1
        from (values
            ('profiles'), ('messages'), ('commitments'), ('subscriptions'),
            ('contacts'), ('conversations'), ('conversation_participants'),
            ('message_reactions'), ('user_calendar_accounts'), ('ai_messages'),
            ('calls'), ('operation_checklists'), ('operation_checklist_items'),
            ('operation_checklist_runs'), ('operation_checklist_run_items'),
            ('shift_reports'), ('conversation_operation_focuses'),
            ('commitment_operation_progress')
        ) as expected(table_name)
        join lateral (select to_regclass('public.' || expected.table_name) as relation) r on true
        where r.relation is null
    ) then
        raise exception 'ABORT: the confirmed legacy table inventory changed';
    end if;
end;
$$;

-- Known-safe Auth/profile reconciliation from the canonical RC migration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgrelid = 'auth.users'::regclass
          and tgname = 'on_auth_user_created'
          and not tgisinternal
    ) then
        create trigger on_auth_user_created
            after insert on auth.users
            for each row execute procedure public.handle_new_user();
    end if;
end;
$$;

insert into public.profiles (id, email)
select users.id, users.email
from auth.users as users
where not exists (
    select 1 from public.profiles as profiles where profiles.id = users.id
);

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- The historical project exposed three SECURITY DEFINER helpers with the
-- PostgreSQL default PUBLIC EXECUTE grant. Revoke only when the exact legacy
-- signature exists; service_role is intentionally not revoked.
do $$
declare
    fn regprocedure;
begin
    foreach fn in array array[
        to_regprocedure('public.is_conversation_participant(uuid, uuid)'),
        to_regprocedure('public.shares_conversation_with(uuid)'),
        to_regprocedure('public.handle_new_user()')
    ] loop
        if fn is not null then
            execute format('revoke execute on function %s from public, anon, authenticated', fn);
        end if;
    end loop;
end;
$$;

-- The RC backend uses supabaseAdmin for these legacy domain tables. Once the
-- operator has reviewed that boundary, deny direct client access and enable
-- RLS without inventing predicates. service_role remains available to the
-- backend and existing rows are untouched.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'subscriptions', 'contacts', 'conversations',
        'conversation_participants', 'operation_checklists',
        'operation_checklist_items', 'operation_checklist_runs',
        'operation_checklist_run_items', 'shift_reports',
        'conversation_operation_focuses', 'commitment_operation_progress'
    ] loop
        execute format('alter table public.%I enable row level security', table_name);
        execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    end loop;
end;
$$;

do $$
begin
    if to_regprocedure('public.update_conversation_last_message()') is not null then
        alter function public.update_conversation_last_message() set search_path = public;
    end if;
end;
$$;

-- Fix search_path only for the exact no-argument legacy helper when present.
-- Do not replace its body without a schema snapshot and function review.
do $$
begin
    if to_regprocedure('public.update_updated_at_column()') is not null then
        alter function public.update_updated_at_column() set search_path = public;
    end if;
end;
$$;

commit;

-- Remaining RLS/grant/function work is intentionally a separate reviewed step.
