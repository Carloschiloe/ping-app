-- Durable, privacy-minimized audit ledger for Ping Core agent boundaries.
--
-- The console trace helpers remain useful for live diagnostics, but they are
-- not an audit record: process restarts and log retention can lose them.
-- This ledger is append-only and populated by database triggers so the
-- authorization/execution/turn state change and its audit row commit together.
--
-- Deliberately excluded: message bodies, prompts, frozen plan arguments,
-- memory values, access tokens, and raw dialogue/client keys.

create table if not exists public.agent_audit_events (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references auth.users(id) on delete set null,
    trace_id text,
    entity_type text not null check (entity_type in (
        'authorization',
        'execution',
        'turn_admission'
    )),
    entity_id text not null,
    event_type text not null,
    status text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists agent_audit_events_actor_created_idx
    on public.agent_audit_events (actor_user_id, created_at desc);
create index if not exists agent_audit_events_entity_created_idx
    on public.agent_audit_events (entity_type, entity_id, created_at desc);
create index if not exists agent_audit_events_trace_idx
    on public.agent_audit_events (trace_id, created_at desc)
    where trace_id is not null;

alter table public.agent_audit_events enable row level security;

create policy agent_audit_events_owner_select
    on public.agent_audit_events
    for select
    using (actor_user_id = auth.uid());

-- Audit records cannot be altered or removed through any application path.
create or replace function public.prevent_agent_audit_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    raise exception 'Agent audit events are append-only' using errcode = '55000';
end;
$$;

drop trigger if exists agent_audit_events_immutable on public.agent_audit_events;
create trigger agent_audit_events_immutable
before update or delete on public.agent_audit_events
for each row execute function public.prevent_agent_audit_event_mutation();

-- Trigger-owned projection of the three durable boundaries. The projection
-- intentionally uses only identifiers, enums, counts and hashes. It never
-- copies plan JSON, content, or raw dialogue keys into the audit ledger.
create or replace function public.record_agent_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_actor_user_id uuid;
    v_trace_id text;
    v_entity_type text;
    v_entity_id text;
    v_status text;
    v_event_type text;
    v_metadata jsonb := '{}'::jsonb;
    v_old_status text;
begin
    if TG_TABLE_NAME = 'agent_authorizations' then
        v_actor_user_id := new.actor_user_id;
        v_trace_id := new.trace_id;
        v_entity_type := 'authorization';
        v_entity_id := new.id::text;
        v_status := new.status;
        v_old_status := case when TG_OP = 'UPDATE' then old.status else null end;
        v_event_type := case
            when TG_OP = 'INSERT' then 'authorization.created'
            when v_old_status is distinct from v_status then 'authorization.status_changed'
            else 'authorization.updated'
        end;
        v_metadata := jsonb_build_object(
            'objective_type', new.objective_type,
            'confirmation_level', new.confirmation_level,
            'authorized_step_count', coalesce(array_length(new.authorized_step_ids, 1), 0)
        );
    elsif TG_TABLE_NAME = 'agent_executions' then
        v_actor_user_id := new.actor_user_id;
        v_trace_id := new.trace_id;
        v_entity_type := 'execution';
        v_entity_id := new.id::text;
        v_status := new.status;
        v_old_status := case when TG_OP = 'UPDATE' then old.status else null end;
        v_event_type := case
            when TG_OP = 'INSERT' then 'execution.created'
            when v_old_status is distinct from v_status then 'execution.status_changed'
            else 'execution.updated'
        end;
        v_metadata := jsonb_build_object(
            'authorization_id', new.authorization_id::text,
            'step_id', new.step_id,
            'tool_id', new.tool_id,
            'tool_version', new.tool_version,
            'retry_count', new.retry_count,
            'failure_code', new.failure_code
        );
    elsif TG_TABLE_NAME = 'agent_turn_admissions' then
        v_actor_user_id := new.actor_user_id;
        v_entity_type := 'turn_admission';
        v_entity_id := new.turn_id::text;
        v_status := new.status;
        v_old_status := case when TG_OP = 'UPDATE' then old.status else null end;
        v_event_type := case
            when TG_OP = 'INSERT' then 'turn_admission.created'
            when v_old_status is distinct from v_status then 'turn_admission.status_changed'
            else 'turn_admission.updated'
        end;
        v_metadata := jsonb_build_object(
            'dialogue_scope_hash', md5(new.dialogue_scope_key),
            'turn_sequence', new.turn_sequence,
            'failure_class', new.failure_class
        );
    else
        raise exception 'Unsupported agent audit source table %', TG_TABLE_NAME
            using errcode = '0A000';
    end if;

    if v_old_status is not null then
        v_metadata := v_metadata || jsonb_build_object('previous_status', v_old_status);
    end if;

    insert into public.agent_audit_events (
        actor_user_id, trace_id, entity_type, entity_id,
        event_type, status, metadata
    ) values (
        v_actor_user_id, v_trace_id, v_entity_type, v_entity_id,
        v_event_type, v_status, v_metadata
    );

    return new;
end;
$$;

drop trigger if exists agent_authorizations_audit on public.agent_authorizations;
create trigger agent_authorizations_audit
after insert or update on public.agent_authorizations
for each row execute function public.record_agent_audit_event();

drop trigger if exists agent_executions_audit on public.agent_executions;
create trigger agent_executions_audit
after insert or update on public.agent_executions
for each row execute function public.record_agent_audit_event();

drop trigger if exists agent_turn_admissions_audit on public.agent_turn_admissions;
create trigger agent_turn_admissions_audit
after insert or update on public.agent_turn_admissions
for each row execute function public.record_agent_audit_event();

-- Trigger functions are not application RPCs. Keep them unavailable to
-- client roles; PostgreSQL invokes them through the owning trigger.
revoke all on function public.prevent_agent_audit_event_mutation() from public, anon, authenticated;
revoke all on function public.record_agent_audit_event() from public, anon, authenticated;

-- No INSERT/UPDATE/DELETE policy is granted to client roles. The owner-read
-- policy above is the only client-facing surface; backend service-role
-- access remains available for operational audits.
