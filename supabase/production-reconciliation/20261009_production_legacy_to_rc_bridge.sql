-- PING PRODUCTION BRIDGE
-- DO NOT AUTO-APPLY
-- REQUIRES BACKUP
-- REQUIRES EXPLICIT AUTHORIZATION
--
-- This file is intentionally outside supabase/migrations/. It is a candidate
-- for the historical project only. It is not part of staging or deploy CI.
-- It contains no destructive table/column operation and never touches storage.
-- The 11 public tables without RLS are deliberately NOT changed here because
-- their correct policies must be reviewed against the real schema first.

begin;

do $$
begin
    if current_setting('ping.backup_created', true) <> 'YES'
        or current_setting('ping.backup_verified', true) <> 'YES'
        or current_setting('ping.auth_preservation_verified', true) <> 'YES'
        or current_setting('ping.storage_preservation_verified', true) <> 'YES' then
        raise exception 'ABORT: backup and preservation gates are required';
    end if;

    if to_regclass('public.profiles') is null
        or to_regclass('auth.users') is null
        or to_regclass('storage.buckets') is null
        or to_regclass('storage.objects') is null then
        raise exception 'ABORT: expected Auth, Storage, or profiles objects are missing';
    end if;

    if (select count(*) from auth.users) <> 4
        or (select count(*) from storage.buckets) <> 2
        or (select count(*) from storage.objects) <> 48 then
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
