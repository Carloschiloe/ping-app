-- M10 — Ping takes the initiative. One row per message Ping decides to send
-- on its own (daily summary, overdue notice, ...). The key makes every
-- initiative idempotent across restarts and instances; local_date lets the
-- engine cap how many a user gets per local day.
-- Additive only. Rollback: drop the three functions and the table.

create table if not exists public.agent_initiatives (
    initiative_key text primary key,
    actor_user_id uuid not null references public.profiles(id) on delete cascade,
    kind text not null,
    local_date date not null,
    status text not null default 'sending',
    claimed_at timestamptz not null default now(),
    sent_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    constraint agent_initiatives_status_check check (status in ('sending', 'sent', 'failed'))
);

create index if not exists agent_initiatives_actor_day_idx
    on public.agent_initiatives (actor_user_id, local_date);

alter table public.agent_initiatives enable row level security;
revoke all on table public.agent_initiatives from public, anon, authenticated;
grant select, insert, update on table public.agent_initiatives to service_role;

-- Claims an initiative for sending. A sent row is permanent; a row left in
-- 'sending' or 'failed' by a crashed run can be reclaimed after 10 minutes.
create or replace function public.claim_agent_initiative(
    p_initiative_key text,
    p_actor_user_id uuid,
    p_kind text,
    p_local_date date
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
    claimed_count integer := 0;
begin
    if nullif(trim(p_initiative_key), '') is null
       or p_actor_user_id is null
       or nullif(trim(p_kind), '') is null
       or p_local_date is null then
        raise exception 'agent initiative claim requires complete identity';
    end if;

    insert into public.agent_initiatives (initiative_key, actor_user_id, kind, local_date)
    values (p_initiative_key, p_actor_user_id, p_kind, p_local_date)
    on conflict (initiative_key) do nothing;
    if found then
        return true;
    end if;

    update public.agent_initiatives
       set status = 'sending', claimed_at = now(), last_error = null
     where initiative_key = p_initiative_key
       and status <> 'sent'
       and claimed_at < now() - interval '10 minutes';
    get diagnostics claimed_count = row_count;
    return claimed_count > 0;
end;
$$;

create or replace function public.complete_agent_initiative(p_initiative_key text)
returns boolean
language plpgsql
set search_path = public
as $$
begin
    update public.agent_initiatives
       set status = 'sent', sent_at = now(), last_error = null
     where initiative_key = p_initiative_key
       and status = 'sending';
    return found;
end;
$$;

create or replace function public.fail_agent_initiative(p_initiative_key text, p_error text)
returns boolean
language plpgsql
set search_path = public
as $$
begin
    update public.agent_initiatives
       set status = 'failed',
           last_error = left(coalesce(nullif(trim(p_error), ''), 'agent_initiative_failed'), 500)
     where initiative_key = p_initiative_key
       and status = 'sending';
    return found;
end;
$$;

revoke execute on function public.claim_agent_initiative(text, uuid, text, date) from public, anon, authenticated;
revoke execute on function public.complete_agent_initiative(text) from public, anon, authenticated;
revoke execute on function public.fail_agent_initiative(text, text) from public, anon, authenticated;
grant execute on function public.claim_agent_initiative(text, uuid, text, date) to service_role;
grant execute on function public.complete_agent_initiative(text) to service_role;
grant execute on function public.fail_agent_initiative(text, text) to service_role;
