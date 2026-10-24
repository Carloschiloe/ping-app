-- Ping — durable notification delivery ledger
-- Additive only. The automation gate remains disabled until this contract,
-- timezone policy, and production validation are explicitly complete.

create table if not exists public.notification_delivery_ledger (
    delivery_key text primary key,
    owner_user_id uuid not null references public.profiles(id) on delete cascade,
    commitment_id uuid not null references public.commitments(id) on delete cascade,
    notification_kind text not null,
    window_label text not null,
    due_at timestamptz not null,
    status text not null default 'sending',
    claimed_at timestamptz not null default now(),
    sent_at timestamptz,
    provider text,
    provider_message_id text,
    last_error text,
    created_at timestamptz not null default now(),
    constraint notification_delivery_ledger_status_check
        check (status in ('sending', 'sent', 'failed'))
);

create index if not exists notification_delivery_ledger_commitment_idx
    on public.notification_delivery_ledger (commitment_id, due_at);

create index if not exists notification_delivery_ledger_retry_idx
    on public.notification_delivery_ledger (status, claimed_at)
    where status <> 'sent';

alter table public.notification_delivery_ledger enable row level security;
revoke all on table public.notification_delivery_ledger from public, anon, authenticated;
grant select, insert, update on table public.notification_delivery_ledger to service_role;

create or replace function public.claim_notification_delivery(
    p_delivery_key text,
    p_owner_user_id uuid,
    p_commitment_id uuid,
    p_notification_kind text,
    p_window_label text,
    p_due_at timestamptz
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
    claimed_count integer := 0;
begin
    if nullif(trim(p_delivery_key), '') is null
       or p_owner_user_id is null
       or p_commitment_id is null
       or nullif(trim(p_notification_kind), '') is null
       or nullif(trim(p_window_label), '') is null
       or p_due_at is null then
        raise exception 'notification delivery claim requires complete identity';
    end if;

    insert into public.notification_delivery_ledger (
        delivery_key,
        owner_user_id,
        commitment_id,
        notification_kind,
        window_label,
        due_at,
        status,
        claimed_at
    ) values (
        p_delivery_key,
        p_owner_user_id,
        p_commitment_id,
        p_notification_kind,
        p_window_label,
        p_due_at,
        'sending',
        now()
    ) on conflict (delivery_key) do nothing;

    if found then
        return true;
    end if;

    -- A crashed sender may leave a lease behind. Only a stale non-sent row
    -- can be reclaimed; a sent row is permanently idempotent.
    update public.notification_delivery_ledger
       set status = 'sending', claimed_at = now(), last_error = null
     where delivery_key = p_delivery_key
       and status <> 'sent'
       and claimed_at < now() - interval '10 minutes';

    get diagnostics claimed_count = row_count;
    return claimed_count > 0;
end;
$$;

create or replace function public.complete_notification_delivery(
    p_delivery_key text,
    p_provider text,
    p_provider_message_id text default null
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
    completed_count integer := 0;
begin
    update public.notification_delivery_ledger
       set status = 'sent',
           sent_at = now(),
           provider = nullif(trim(p_provider), ''),
           provider_message_id = nullif(trim(p_provider_message_id), ''),
           last_error = null
     where delivery_key = p_delivery_key
       and status = 'sending';
    get diagnostics completed_count = row_count;
    return completed_count > 0;
end;
$$;

create or replace function public.fail_notification_delivery(
    p_delivery_key text,
    p_error text
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
    failed_count integer := 0;
begin
    update public.notification_delivery_ledger
       set status = 'failed',
           claimed_at = now(),
           last_error = left(coalesce(nullif(trim(p_error), ''), 'notification_delivery_failed'), 500)
     where delivery_key = p_delivery_key
       and status = 'sending';
    get diagnostics failed_count = row_count;
    return failed_count > 0;
end;
$$;

revoke execute on function public.claim_notification_delivery(text, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.complete_notification_delivery(text, text, text) from public, anon, authenticated;
revoke execute on function public.fail_notification_delivery(text, text) from public, anon, authenticated;
grant execute on function public.claim_notification_delivery(text, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.complete_notification_delivery(text, text, text) to service_role;
grant execute on function public.fail_notification_delivery(text, text) to service_role;
