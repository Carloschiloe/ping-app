-- Gastos: what each OpenAI use costs, and the monthly budget.
-- Only the server (service_role) reads or writes these; nothing here is
-- visible to the app.

create table if not exists public.ai_usage (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid references public.profiles(id) on delete set null,
    feature text not null,
    model text not null,
    input_tokens integer not null default 0,
    cached_input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    audio_input_tokens integer not null default 0,
    audio_output_tokens integer not null default 0,
    audio_seconds numeric(10,2) not null default 0,
    cost_usd numeric(12,6) not null default 0
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

alter table public.app_settings
    add column if not exists monthly_budget_usd numeric(10,2),
    add column if not exists budget_alert_level text,
    add column if not exists render_plan text not null default 'free',
    add column if not exists supabase_plan text not null default 'free';

-- Totals for the Gastos page: by use, by model, by day and the people who
-- cost the most since p_since.
create or replace function public.admin_cost_summary(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'total', coalesce((select sum(cost_usd) from ai_usage where created_at >= p_since), 0),
        'calls', (select count(*) from ai_usage where created_at >= p_since),
        'byFeature', coalesce((
            select jsonb_agg(f order by f.cost desc) from (
                select feature, sum(cost_usd) as cost, count(*) as calls,
                       sum(input_tokens + audio_input_tokens) as input_tokens,
                       sum(output_tokens + audio_output_tokens) as output_tokens
                from ai_usage where created_at >= p_since group by feature
            ) f), '[]'::jsonb),
        'byModel', coalesce((
            select jsonb_agg(m order by m.cost desc) from (
                select model, sum(cost_usd) as cost, count(*) as calls,
                       sum(input_tokens + audio_input_tokens) as input_tokens,
                       sum(output_tokens + audio_output_tokens) as output_tokens
                from ai_usage where created_at >= p_since group by model
            ) m), '[]'::jsonb),
        'byDay', coalesce((
            select jsonb_agg(d order by d.day) from (
                select (created_at at time zone 'America/Santiago')::date as day, sum(cost_usd) as cost
                from ai_usage where created_at >= p_since group by 1
            ) d), '[]'::jsonb),
        'topUsers', coalesce((
            select jsonb_agg(u order by u.cost desc) from (
                select a.user_id, coalesce(p.full_name, p.email, 'Sin nombre') as name, sum(a.cost_usd) as cost, count(*) as calls
                from ai_usage a left join profiles p on p.id = a.user_id
                where a.created_at >= p_since and a.user_id is not null
                group by a.user_id, p.full_name, p.email
                order by sum(a.cost_usd) desc limit 10
            ) u), '[]'::jsonb)
    );
$$;

-- How much space the database and the stored files take.
create or replace function public.admin_storage_usage()
returns jsonb
language sql
stable
security definer
set search_path = public, storage
as $$
    select jsonb_build_object(
        'databaseBytes', pg_database_size(current_database()),
        'storageBytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)
    );
$$;

revoke all on function public.admin_cost_summary(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_storage_usage() from public, anon, authenticated;
grant execute on function public.admin_cost_summary(timestamptz) to service_role;
grant execute on function public.admin_storage_usage() to service_role;
