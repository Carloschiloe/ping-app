-- Ping — per-profile automation timezone
-- Additive and nullable: existing users keep the current Santiago fallback until
-- the mobile profile flow stores an explicit IANA timezone.

alter table public.profiles
    add column if not exists timezone text;

comment on column public.profiles.timezone is
    'Optional IANA timezone used only for user-local background schedules; validated by the application.';
