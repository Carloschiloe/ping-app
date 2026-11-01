-- M10 I4 — each user decides which notices Ping sends on its own and at what
-- hour the morning summary arrives. Defaults keep today's behaviour. The app
-- writes these toggles directly, like the privacy ones.
-- Additive and idempotent. Rollback: drop the three columns.

alter table public.profiles
    add column if not exists assistant_daily_summary boolean not null default true,
    add column if not exists assistant_summary_hour smallint not null default 8,
    add column if not exists assistant_overdue_notices boolean not null default true;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_assistant_summary_hour_check'
    ) then
        alter table public.profiles
            add constraint profiles_assistant_summary_hour_check
            check (assistant_summary_hour between 5 and 11);
    end if;
end
$$;

grant update (assistant_daily_summary, assistant_summary_hour, assistant_overdue_notices)
    on table public.profiles to authenticated;
