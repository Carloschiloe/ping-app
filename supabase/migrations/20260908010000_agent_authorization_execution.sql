-- M-4 — AUTHORIZATION + SAFE EXECUTION.
--
-- PERSISTENCE DECISION (sección 11/55/58 del ticket): plans permanecen
-- efímeros (M-3, nunca persistidos) -- el binding real usa Option C
-- ("re-plan + deterministic digest comparison", ver
-- backend/src/services/agentPlanDigest.service.ts): /api/agent/authorize
-- vuelve a ejecutar el MISMO pipeline determinístico de planificación con
-- el mismo actor+input+contexto, y exige que el digest recalculado
-- coincida con el que el cliente ecoa desde /api/agent/plan -- ningún plan
-- JSON crudo se persiste ni se confía de vuelta del cliente. Lo que SÍ
-- requiere persistencia real (justificado, no evitado por comodidad):
--   - la AUTORIZACIÓN ya emitida (debe sobrevivir al request, tener TTL,
--     ser revocable, y su consumo debe ser atómico entre requests
--     concurrentes -- imposible de garantizar con sólo memoria de proceso)
--   - el registro de EJECUCIÓN por paso (idempotencia real ante reintentos/
--     crashes, sección 67 -- un UNIQUE real en Postgres es la única
--     garantía verdadera contra un doble efecto secundario)
--   - la auditoría (sección 31, "necesita ser durable")
-- Ambas tablas usan uuid real (gen_random_uuid()), nunca el "step-XXXXXXXX"
-- no-UUID que agentPlanner.service.ts genera para IDs de paso en memoria --
-- ese texto se preserva tal cual en `frozen_steps`/`step_id` (columna
-- text), nunca forzado a uuid.

create table public.agent_authorizations (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid not null references auth.users(id),
    plan_digest text not null,
    objective_type text not null,
    -- Snapshot congelado (sección 40/41): argumentos, toolId/version,
    -- condición y sideEffectClass de CADA paso autorizado, tal como el
    -- validador de M-3 los produjo -- la ejecución NUNCA vuelve a
    -- re-planificar ni re-preguntar a memoria para rellenar un argumento
    -- material. Es un array de AgentPlanStep (JSON), no el AgentPlan
    -- completo (nunca se persiste objective.sourceUtterance -- minimiza
    -- contenido sensible en reposo, sección 57).
    frozen_steps jsonb not null,
    authorized_step_ids text[] not null,
    confirmation_level text not null check (confirmation_level in ('none', 'implicit', 'explicit', 'strong_explicit')),
    status text not null default 'authorized' check (status in ('pending', 'authorized', 'consumed', 'expired', 'revoked')),
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    revoked_at timestamptz,
    trace_id text,
    created_at timestamptz not null default now()
);

create index agent_authorizations_actor_idx on public.agent_authorizations (actor_user_id, created_at desc);
create index agent_authorizations_status_expiry_idx on public.agent_authorizations (status, expires_at);

alter table public.agent_authorizations enable row level security;

-- RLS es defensa en profundidad (mismo principio que memory_records) -- el
-- backend real escribe vía supabaseAdmin/RPC (security definer), nunca
-- espera que un usuario autenticado inserte/actualice esta tabla
-- directamente, así que sólo existe policy de lectura.
create policy agent_authorizations_owner_select on public.agent_authorizations
    for select using (actor_user_id = auth.uid());

create table public.agent_executions (
    id uuid primary key default gen_random_uuid(),
    authorization_id uuid not null references public.agent_authorizations(id),
    actor_user_id uuid not null references auth.users(id),
    step_id text not null,
    tool_id text not null,
    tool_version integer not null,
    -- uuid real (nunca el "step-XXXXXXXX" no-uuid) -- se pasa tal cual como
    -- client_message_id/idempotency key real a los servicios canónicos que
    -- ya soportan uno (ej. persist_message_with_attachment#p_client_message_id).
    idempotency_key uuid not null default gen_random_uuid(),
    status text not null default 'pending' check (status in (
        'pending', 'running', 'succeeded', 'failed_retryable', 'failed_terminal',
        'skipped_condition', 'blocked', 'cancelled'
    )),
    result_ref jsonb,
    failure_code text,
    retry_count integer not null default 0,
    started_at timestamptz,
    completed_at timestamptz,
    trace_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Un paso de una autorización dada sólo puede tener UNA fila real --
    -- esto es la protección de concurrencia/crash real (sección 20/53/67):
    -- un INSERT concurrente para el mismo (authorization_id, step_id)
    -- colisiona con esta constraint, nunca produce dos intentos de efecto
    -- secundario en paralelo.
    unique (authorization_id, step_id)
);

create index agent_executions_actor_idx on public.agent_executions (actor_user_id, created_at desc);
create index agent_executions_authorization_idx on public.agent_executions (authorization_id);
create index agent_executions_idempotency_idx on public.agent_executions (idempotency_key);

alter table public.agent_executions enable row level security;

create policy agent_executions_owner_select on public.agent_executions
    for select using (actor_user_id = auth.uid());

-- ─── Autorización: consumo atómico (sección 6/33/34/53/66) ─────────────────
-- `for update` bloquea la fila real hasta que la transacción termina --
-- una segunda llamada concurrente para la MISMA autorización espera aquí,
-- y al despertar ve status='consumed' (ya no 'authorized'), así que nunca
-- hay una ventana donde dos requests concurrentes pasen el chequeo de
-- estado a la vez. "consumed" significa "se inició al menos un intento de
-- ejecución real" -- no bloquea reintentos de PASOS fallidos dentro de esa
-- misma autorización (eso lo gobierna agent_executions por paso), sólo
-- impide iniciar una autorización nueva/duplicada desde cero o revocarla
-- retroactivamente (sección 33).
create or replace function public.claim_agent_authorization_for_execution(
    p_authorization_id uuid,
    p_actor_user_id uuid
)
returns public.agent_authorizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_authorizations;
begin
    select * into v_row
      from public.agent_authorizations
     where id = p_authorization_id
     for update;

    if not found then
        raise exception 'Authorization not found' using errcode = 'P0002';
    end if;
    if v_row.actor_user_id <> p_actor_user_id then
        raise exception 'Authorization does not belong to this actor' using errcode = '42501';
    end if;
    if v_row.status = 'revoked' then
        raise exception 'Authorization has been revoked' using errcode = '42501';
    end if;
    -- Expiry se deriva SIEMPRE de expires_at en vivo, nunca de un status
    -- cacheado -- un UPDATE aquí seguido de un raise en la MISMA sentencia
    -- se revertiría a sí mismo (Postgres no ofrece transacciones autónomas
    -- en plpgsql; un raise sin savepoint propio deshace todo lo hecho por
    -- esta misma invocación, incluyendo su propio UPDATE previo). La
    -- higiene de almacenamiento (marcar status='expired' en reposo) es
    -- responsabilidad de un job de limpieza aparte (sección 77), nunca de
    -- este chequeo -- la garantía de seguridad real (nunca ejecutar tras el
    -- TTL) no depende de esa escritura: expires_at < now() es idempotente y
    -- se re-evalúa igual de estricta en cada llamada futura.
    if v_row.status = 'authorized' and v_row.expires_at < now() then
        raise exception 'Authorization has expired' using errcode = 'P0001';
    end if;
    if v_row.status = 'expired' then
        raise exception 'Authorization has expired' using errcode = 'P0001';
    end if;

    if v_row.status = 'authorized' then
        update public.agent_authorizations
           set status = 'consumed', consumed_at = now()
         where id = p_authorization_id
        returning * into v_row;
    end if;

    -- status ya era 'consumed' (replay real, sección 34) -> se devuelve tal
    -- cual, nunca se re-emite un nuevo período de vigencia.
    return v_row;
end;
$$;

-- ─── Revocación (sección 33): sólo antes de consumo real. ──────────────────
create or replace function public.revoke_agent_authorization(
    p_authorization_id uuid,
    p_actor_user_id uuid
)
returns public.agent_authorizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_authorizations;
begin
    select * into v_row
      from public.agent_authorizations
     where id = p_authorization_id
     for update;

    if not found then
        raise exception 'Authorization not found' using errcode = 'P0002';
    end if;
    if v_row.actor_user_id <> p_actor_user_id then
        raise exception 'Authorization does not belong to this actor' using errcode = '42501';
    end if;
    if v_row.status = 'consumed' then
        raise exception 'Authorization was already consumed and cannot be revoked' using errcode = 'P0001';
    end if;

    update public.agent_authorizations
       set status = 'revoked', revoked_at = now()
     where id = p_authorization_id
    returning * into v_row;

    return v_row;
end;
$$;

-- ─── Ejecución de paso: crear-o-reutilizar atómico (sección 20/53/67) ──────
-- INSERT ... ON CONFLICT DO NOTHING sobre la unique real (authorization_id,
-- step_id) para el primer intento; UPDATE condicional para un reintento
-- real de un paso 'failed_retryable'. Ambos casos son atómicos de Postgres
-- (nunca una ventana "verificar si existe" + "crear/actualizar" separada).
--
-- `is_new_attempt=true` es la señal real de "TÚ, el caller, ganaste este
-- intento -- debes invocar al executor ahora". `is_new_attempt=false`
-- cubre TODOS los demás casos (terminal ya resuelto, o 'running' de una
-- request CONCURRENTE distinta que sí ganó la carrera) -- el caller nunca
-- debe re-invocar el executor en ese caso, sólo leer el resultado
-- almacenado o reportar "en curso". Sin esta señal explícita era imposible
-- distinguir desde TypeScript "acabo de crear la fila" de "ya existía y
-- está corriendo por otra request" -- ambos casos devolvían status='running'.
create or replace function public.claim_agent_execution_step(
    p_authorization_id uuid,
    p_actor_user_id uuid,
    p_step_id text,
    p_tool_id text,
    p_tool_version integer,
    p_trace_id text default null
)
returns table (execution jsonb, is_new_attempt boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_executions;
begin
    insert into public.agent_executions (
        authorization_id, actor_user_id, step_id, tool_id, tool_version, status, started_at, trace_id
    ) values (
        p_authorization_id, p_actor_user_id, p_step_id, p_tool_id, p_tool_version, 'running', now(), p_trace_id
    )
    on conflict (authorization_id, step_id) do nothing
    returning * into v_row;

    if found then
        return query select row_to_json(v_row)::jsonb, true;
        return;
    end if;

    -- Ya existía -- si estaba 'failed_retryable', se reclama atómicamente
    -- para un reintento real (transición condicional, nunca una carrera).
    update public.agent_executions
       set status = 'running', started_at = now(), updated_at = now()
     where authorization_id = p_authorization_id
       and step_id = p_step_id
       and status = 'failed_retryable'
    returning * into v_row;

    if found then
        return query select row_to_json(v_row)::jsonb, true;
        return;
    end if;

    -- Terminal ya resuelto, o 'running' real de otra request concurrente --
    -- el caller NUNCA debe re-ejecutar en ninguno de los dos casos.
    select * into v_row
      from public.agent_executions
     where authorization_id = p_authorization_id and step_id = p_step_id;

    return query select row_to_json(v_row)::jsonb, false;
end;
$$;

create or replace function public.complete_agent_execution_step(
    p_execution_id uuid,
    p_status text,
    p_result_ref jsonb default null,
    p_failure_code text default null
)
returns public.agent_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_executions;
begin
    if p_status not in ('succeeded', 'failed_retryable', 'failed_terminal', 'skipped_condition', 'blocked', 'cancelled') then
        raise exception 'Invalid terminal execution status' using errcode = '22023';
    end if;

    update public.agent_executions
       set status = p_status,
           result_ref = coalesce(p_result_ref, result_ref),
           failure_code = p_failure_code,
           completed_at = now(),
           updated_at = now(),
           retry_count = case when p_status = 'failed_retryable' then retry_count + 1 else retry_count end
     where id = p_execution_id
    returning * into v_row;

    if not found then
        raise exception 'Execution record not found' using errcode = 'P0002';
    end if;

    return v_row;
end;
$$;

revoke all on function public.claim_agent_authorization_for_execution(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_agent_authorization(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_agent_execution_step(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.complete_agent_execution_step(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_agent_authorization_for_execution(uuid, uuid) to service_role;
grant execute on function public.revoke_agent_authorization(uuid, uuid) to service_role;
grant execute on function public.claim_agent_execution_step(uuid, uuid, text, text, integer, text) to service_role;
grant execute on function public.complete_agent_execution_step(uuid, text, jsonb, text) to service_role;

-- Rollback manual (nunca ejecutado automáticamente):
-- drop function if exists public.complete_agent_execution_step(uuid, text, jsonb, text);
-- drop function if exists public.claim_agent_execution_step(uuid, uuid, text, text, integer, text);
-- drop function if exists public.revoke_agent_authorization(uuid, uuid);
-- drop function if exists public.claim_agent_authorization_for_execution(uuid, uuid);
-- drop table if exists public.agent_executions;
-- drop table if exists public.agent_authorizations;
