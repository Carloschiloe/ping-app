-- =============================================================================
-- Owner's admin panel: who may enter, each person's plan and trial, the
-- phones the app is installed on, days of use, and errors from the app and
-- the server. Everything here is read and written only by the backend
-- (service role); people never reach these tables from the app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who may open the admin panel.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
    user_id     uuid primary key references auth.users(id) on delete cascade,
    created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Trial and plan rules the owner edits from the panel. One row only.
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
    id                boolean primary key default true,
    trial_days        integer not null default 30,
    notice_days       integer[] not null default '{7,3,1}',
    monthly_price_clp integer,
    annual_price_clp  integer,
    updated_at        timestamptz not null default now(),
    constraint app_settings_single_row_chk check (id),
    constraint app_settings_trial_days_chk check (trial_days between 1 and 365),
    constraint app_settings_monthly_chk check (monthly_price_clp is null or monthly_price_clp between 0 and 10000000),
    constraint app_settings_annual_chk check (annual_price_clp is null or annual_price_clp between 0 and 10000000)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Each person's plan. Everyone starts on a trial counted from sign-up.
-- People already registered get a full trial from today.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists access_plan text not null default 'trial';
alter table public.profiles add column if not exists suspended_at timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'profiles_access_plan_chk') then
        alter table public.profiles
            add constraint profiles_access_plan_chk check (access_plan in ('trial', 'paid', 'free_access'));
    end if;
end $$;

update public.profiles
set trial_ends_at = now() + make_interval(days => (select trial_days from public.app_settings))
where trial_ends_at is null;

create or replace function public.set_trial_end_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.trial_ends_at is null then
        new.trial_ends_at := coalesce(new.created_at, now())
            + make_interval(days => coalesce((select trial_days from public.app_settings where id), 30));
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_set_trial_end on public.profiles;
create trigger profiles_set_trial_end
    before insert on public.profiles
    for each row execute function public.set_trial_end_on_signup();

-- -----------------------------------------------------------------------------
-- Phones the app is installed on. The app sends a random id it keeps on the
-- phone, never a hardware id.
-- -----------------------------------------------------------------------------
create table if not exists public.app_installs (
    install_id   text primary key,
    user_id      uuid references public.profiles(id) on delete set null,
    platform     text not null,
    app_version  text,
    os_version   text,
    first_seen   timestamptz not null default now(),
    last_seen    timestamptz not null default now(),
    constraint app_installs_id_chk check (install_id ~ '^[A-Za-z0-9_-]{8,64}$'),
    constraint app_installs_platform_chk check (platform in ('android', 'ios', 'web', 'other')),
    constraint app_installs_version_chk check (app_version is null or char_length(app_version) <= 40),
    constraint app_installs_os_chk check (os_version is null or char_length(os_version) <= 40)
);

create index if not exists app_installs_user_idx on public.app_installs (user_id, last_seen desc);

-- -----------------------------------------------------------------------------
-- Days each person opened the app (Chile time), from the presence the app
-- already reports. Only the date is kept.
-- -----------------------------------------------------------------------------
create table if not exists public.user_activity_days (
    user_id  uuid not null references public.profiles(id) on delete cascade,
    day      date not null,
    primary key (user_id, day)
);

create index if not exists user_activity_days_day_idx on public.user_activity_days (day);

create or replace function public.record_activity_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.last_seen is not null and new.last_seen is distinct from old.last_seen then
        insert into public.user_activity_days (user_id, day)
        values (new.id, (new.last_seen at time zone 'America/Santiago')::date)
        on conflict do nothing;
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_record_activity_day on public.profiles;
create trigger profiles_record_activity_day
    after update of last_seen on public.profiles
    for each row execute function public.record_activity_day();

-- -----------------------------------------------------------------------------
-- Errors from the server and the app. Only what failed and where: never the
-- text of messages, commitments or anything the person wrote.
-- -----------------------------------------------------------------------------
create table if not exists public.app_errors (
    id           uuid primary key default gen_random_uuid(),
    source       text not null,
    fingerprint  text not null,
    title        text not null,
    detail       text,
    location     text,
    app_version  text,
    platform     text,
    user_id      uuid references public.profiles(id) on delete set null,
    created_at   timestamptz not null default now(),
    constraint app_errors_source_chk check (source in ('server', 'app')),
    constraint app_errors_title_len_chk check (char_length(title) between 1 and 200),
    constraint app_errors_detail_len_chk check (detail is null or char_length(detail) <= 2000),
    constraint app_errors_location_len_chk check (location is null or char_length(location) <= 200)
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);

create table if not exists public.app_error_resolutions (
    fingerprint  text primary key,
    resolved_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- What the owner did from the panel, for the person's history.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit (
    id              uuid primary key default gen_random_uuid(),
    admin_id        uuid references auth.users(id) on delete set null,
    target_user_id  uuid references public.profiles(id) on delete cascade,
    action          text not null,
    detail          jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists admin_audit_target_idx on public.admin_audit (target_user_id, created_at desc);

alter table public.admin_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_installs enable row level security;
alter table public.user_activity_days enable row level security;
alter table public.app_errors enable row level security;
alter table public.app_error_resolutions enable row level security;
alter table public.admin_audit enable row level security;

revoke all on public.admin_users, public.app_settings, public.app_installs, public.user_activity_days,
    public.app_errors, public.app_error_resolutions, public.admin_audit from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Totals the panel needs, computed in the database.
-- -----------------------------------------------------------------------------
create or replace function public.admin_daily_series(p_days integer)
returns table (day date, active bigint, signups bigint)
language sql
stable
security definer
set search_path = public
as $$
    with days as (
        select generate_series(
            (now() at time zone 'America/Santiago')::date - (greatest(1, least(p_days, 365)) - 1),
            (now() at time zone 'America/Santiago')::date,
            interval '1 day'
        )::date as day
    )
    select
        d.day,
        (select count(*) from public.user_activity_days a where a.day = d.day),
        (select count(*) from public.profiles p
          where (p.created_at at time zone 'America/Santiago')::date = d.day and p.deleted_at is null)
    from days d
    order by d.day;
$$;

create or replace function public.admin_error_groups(p_since timestamptz)
returns table (
    fingerprint text, source text, title text, location text, app_version text, platform text,
    occurrences bigint, people bigint, first_at timestamptz, last_at timestamptz, resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select
        e.fingerprint,
        (array_agg(e.source order by e.created_at desc))[1],
        (array_agg(e.title order by e.created_at desc))[1],
        (array_agg(e.location order by e.created_at desc))[1],
        (array_agg(e.app_version order by e.created_at desc))[1],
        (array_agg(e.platform order by e.created_at desc))[1],
        count(*),
        count(distinct e.user_id),
        min(e.created_at),
        max(e.created_at),
        r.resolved_at
    from public.app_errors e
    left join public.app_error_resolutions r on r.fingerprint = e.fingerprint
    where e.created_at >= p_since
    group by e.fingerprint, r.resolved_at
    order by max(e.created_at) desc
    limit 200;
$$;

create or replace function public.admin_assistant_top(p_since timestamptz)
returns table (user_id uuid, turns bigint, voice_turns bigint)
language sql
stable
security definer
set search_path = public
as $$
    select actor_user_id, count(*), count(*) filter (where input_mode <> 'text')
    from public.agent_conversation_turns
    where created_at >= p_since
    group by actor_user_id
    order by count(*) desc
    limit 10;
$$;

revoke all on function public.admin_daily_series(integer) from public, anon, authenticated;
revoke all on function public.admin_error_groups(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_assistant_top(timestamptz) from public, anon, authenticated;
revoke all on function public.set_trial_end_on_signup() from public, anon, authenticated;
revoke all on function public.record_activity_day() from public, anon, authenticated;
grant execute on function public.admin_daily_series(integer) to service_role;
grant execute on function public.admin_error_groups(timestamptz) to service_role;
grant execute on function public.admin_assistant_top(timestamptz) to service_role;
