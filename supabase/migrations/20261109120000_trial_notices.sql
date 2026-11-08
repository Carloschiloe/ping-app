-- =============================================================================
-- End of the free trial: a switch the owner turns on from the admin panel,
-- and a record of which trial notices each person already received so none
-- is sent twice. Read and written only by the backend (service role).
-- =============================================================================

alter table public.app_settings add column if not exists enforce_trial boolean not null default false;

create table if not exists public.trial_notices (
    user_id  uuid not null references public.profiles(id) on delete cascade,
    kind     text not null,
    sent_at  timestamptz not null default now(),
    primary key (user_id, kind),
    constraint trial_notices_kind_chk check (kind ~ '^(days_[0-9]{1,2}|ended)$')
);

create index if not exists trial_notices_sent_idx on public.trial_notices (sent_at desc);

alter table public.trial_notices enable row level security;
revoke all on public.trial_notices from anon, authenticated;
