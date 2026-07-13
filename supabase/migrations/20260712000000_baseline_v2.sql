-- =============================================================================
-- Ping — Baseline V2
-- =============================================================================
-- Propósito: línea base reconstruible del núcleo de "Ping" (chat + compromisos)
-- para un proyecto Supabase NUEVO ("Ping Staging V2"). No aplicar sobre el
-- proyecto antiguo. Ver supabase/migrations/README.md para el procedimiento
-- completo, la política de backups y la convención de migraciones futuras.
--
-- Alcance de esta migración (núcleo V2):
--   profiles, conversations, conversation_participants, messages,
--   commitments, commitment_events, contacts, message_reactions,
--   ai_messages, calls, user_calendar_accounts.
--
-- Explícitamente FUERA de esta migración (postergado, ver README):
--   Módulo Operación completo (operation_checklists, operation_checklist_items,
--   operation_checklist_runs, operation_checklist_run_items, shift_reports,
--   conversation_operation_focuses, commitment_operation_progress) y las
--   columnas de conversations acopladas a ese módulo (mode, pinned_message_id,
--   active_commitment_id). Ninguna tabla del núcleo depende de ellas.
--
-- Este archivo no contiene datos, secretos, URLs, owners ni grants especiales.
-- No incluye DROP TABLE, TRUNCATE, INSERT INTO, COPY, ni objetos internos de
-- Supabase (auth.*, storage.*, realtime.* se usan por referencia, nunca se
-- redefinen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensiones necesarias
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------
-- Relación 1:1 con auth.users. No almacena credenciales ni datos propios de
-- Supabase Auth (email vive aquí solo como copia de lectura rápida, la fuente
-- de verdad de autenticación sigue siendo auth.users).

create table profiles (
    id                      uuid primary key references auth.users(id) on delete cascade,
    email                   text not null,
    full_name               text,
    avatar_url              text,
    phone                   text,
    expo_push_token         text,
    privacy_read_receipts   boolean not null default true,
    privacy_last_seen       boolean not null default true,
    last_seen               timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

-- Un teléfono, si está presente, identifica a un único usuario (sync de
-- contactos depende de esto). Se permite NULL múltiple (índice parcial).
create unique index profiles_phone_unique_idx on profiles (phone) where phone is not null;

comment on column profiles.full_name is 'Editable por el propio usuario vía backend; no editable por otros.';
comment on column profiles.email is 'Copia de solo lectura de auth.users.email; el backend nunca la actualiza directamente.';

-- -----------------------------------------------------------------------------
-- 2. conversations (sin columnas dependientes de messages todavía — ver más abajo)
-- -----------------------------------------------------------------------------
-- Reemplaza el par (is_group boolean + admin_id como autoridad única) por:
--   - conversation_type: única fuente de verdad sobre el tipo de conversación.
--   - roles por participante (conversation_participants.role) como única
--     fuente de verdad sobre quién administra el grupo.
-- Soporta conversación individual, grupo y self-chat (self-chat = 'direct'
-- con un solo participante: el propio usuario).

create table conversations (
    id              uuid primary key default gen_random_uuid(),
    conversation_type text not null default 'direct',
    name            text,
    avatar_url      text,
    created_by      uuid references profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint conversations_type_check check (conversation_type in ('direct', 'group')),
    -- Los grupos deben tener nombre; las conversaciones directas no lo requieren
    -- (el cliente arma el nombre a partir del otro participante).
    constraint conversations_group_name_check check (conversation_type = 'direct' or name is not null)
);

comment on column conversations.created_by is 'Metadato informativo (quién la creó); NO se usa para autorización — la autorización de administración vive en conversation_participants.role.';

-- -----------------------------------------------------------------------------
-- 3. messages
-- -----------------------------------------------------------------------------
-- Resuelve la duplicidad histórica user_id/sender_id: V2 usa únicamente
-- sender_id. sender_id es NULLABLE para permitir mensajes de sistema/IA sin
-- remitente humano (ej. rutina matutina), pero un mensaje siempre debe tener
-- un origen identificable: humano (sender_id) o de sistema (system_event_type).

create table messages (
    id                  uuid primary key default gen_random_uuid(),
    conversation_id     uuid not null references conversations(id) on delete cascade,
    sender_id           uuid references profiles(id) on delete set null,
    content             text,
    message_type        text not null default 'text',
    media_url           text,
    media_metadata      jsonb not null default '{}'::jsonb,
    reply_to_id         uuid references messages(id) on delete set null,
    system_event_type   text,
    status              text not null default 'sent',
    metadata            jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    deleted_at          timestamptz,
    constraint messages_type_check check (message_type in ('text', 'image', 'video', 'audio', 'document', 'location', 'system')),
    constraint messages_status_check check (status in ('sent', 'delivered', 'read')),
    -- Un mensaje sin remitente humano DEBE estar etiquetado como evento de sistema.
    -- Esto resuelve explícitamente el caso de morningRoutine.service.ts: para
    -- insertar sender_id NULL, el backend debe fijar system_event_type
    -- (ej. 'morning_summary', 'weekly_review', 'commitment_created').
    constraint messages_origin_check check (sender_id is not null or system_event_type is not null)
);

create index messages_conversation_created_idx on messages (conversation_id, created_at desc);
create index messages_sender_created_idx on messages (sender_id, created_at desc);

-- Ahora que messages existe, se agrega la referencia de "último mensaje" a
-- conversations (evita la dependencia circular conversations<->messages en
-- la creación de tablas).
alter table conversations
    add column last_message_id uuid references messages(id) on delete set null,
    add column last_message_at timestamptz,
    add column last_message_text text;

-- -----------------------------------------------------------------------------
-- 4. conversation_participants
-- -----------------------------------------------------------------------------
-- PK compuesta: no existe ningún caso en el código actual donde se referencie
-- una fila de participante por un id propio; siempre se referencia por el par
-- (conversation_id, user_id).
-- Roles: solo 'member' y 'admin' — son los únicos usados hoy (phase35). No se
-- agrega 'owner' por falta de evidencia de esa granularidad en el código.

create table conversation_participants (
    conversation_id uuid not null references conversations(id) on delete cascade,
    user_id         uuid not null references profiles(id) on delete cascade,
    role            text not null default 'member',
    joined_at       timestamptz not null default now(),
    last_read_at    timestamptz,
    archived_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    primary key (conversation_id, user_id),
    constraint conversation_participants_role_check check (role in ('member', 'admin'))
);

create index conversation_participants_user_idx on conversation_participants (user_id, conversation_id);

-- -----------------------------------------------------------------------------
-- 5. contacts
-- -----------------------------------------------------------------------------
-- linked_user_id es NULLABLE a propósito: soporta contactos del dispositivo
-- que todavía no tienen cuenta en Ping (brecha detectada en la auditoría:
-- V1 exigía contact_user_id NOT NULL, impidiendo comprometerse con alguien
-- sin cuenta).
--
-- Se crea ANTES que commitments (a diferencia del orden original de la
-- auditoría) porque commitments.counterparty_contact_id y
-- commitments.waiting_on_contact_id referencian esta tabla por FK — si
-- contacts se creara después, esas columnas fallarían al no existir todavía
-- la tabla referenciada.

create table contacts (
    id              uuid primary key default gen_random_uuid(),
    owner_user_id   uuid not null references profiles(id) on delete cascade,
    linked_user_id  uuid references profiles(id) on delete set null,
    display_name    text not null,
    phone           text,
    email           text,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Cubre tanto la restricción de unicidad como el patrón de consulta real
-- "buscar contacto por owner+teléfono" (siempre se filtra sobre contactos con
-- teléfono presente); un índice adicional no parcial sería redundante.
create unique index contacts_owner_phone_unique_idx on contacts (owner_user_id, phone) where phone is not null;

-- -----------------------------------------------------------------------------
-- 6. commitments (núcleo del producto)
-- -----------------------------------------------------------------------------
-- Decisiones clave de simplificación respecto al esquema histórico:
--   - Una sola referencia de conversación: conversation_id (reemplaza
--     group_conversation_id). Un compromiso "para todo el grupo" se expresa
--     con conversation_id apuntando a una conversación de grupo y
--     assigned_to_user_id = NULL (is_group_task queda eliminado: era
--     derivable y el backend nunca lo leía).
--   - rejection_reason y proposed_due_at son columnas reales de primera
--     clase (ya no viven escondidas en meta.rejection_reason /
--     meta.original_due_at, que es exactamente lo que el código hacía y que
--     causaba que el motivo de rechazo nunca llegara a la UI).
--   - next_action + waiting_on_user_id cubren "próxima acción" y "quién debe
--     actuar ahora" con un solo par de campos, sin un next_action_owner_user_id
--     adicional que duplicaría el mismo concepto que waiting_on_user_id.
--   - action_completed_at y resolved_at son campos independientes: permiten
--     representar "la acción ya se hizo" sin que el asunto esté "realmente
--     resuelto" (requisito explícito de la visión de producto).
--   - counterparty_user_id NO se incluye como campo aparte de assigned_to_user_id:
--     en un compromiso 1:1 con otro usuario de Ping, owner + assigned_to ya
--     identifican ambas partes. Para una contraparte SIN cuenta, ver
--     counterparty_contact_id más abajo (Brecha 3 de la revisión).
--
-- conversation_id y message_id son NULLABLE a propósito: un compromiso puede
-- nacer de una captura manual, de voz, de Ping IA sin chat asociado, de una
-- idea rápida, o de una fuente externa futura — no solo de un mensaje de
-- chat existente. Cuando message_id SÍ está presente, la FK ya garantiza que
-- referencia un mensaje real; el trigger validate_commitment_consistency()
-- (ver sección de funciones) agrega la única regla que una FK no puede
-- expresar por sí sola: si además conversation_id está presente, ambos deben
-- corresponder a la misma conversación.
--
-- due_at es NULLABLE a propósito: Ping debe permitir capturar primero y
-- programar después ("Sin fecha" es una sección válida de la bandeja, no un
-- estado de error). Ningún CHECK de esta tabla exige due_at en ningún status.
-- La única fecha que SÍ es obligatoria bajo una condición puntual es
-- proposed_due_at cuando status = 'counter_proposal' (ver constraint
-- commitments_counter_proposal_due_check): es una invariante de una sola
-- fila, por lo que un CHECK plano es la solución más clara y segura
-- (no requiere trigger ni consulta a otra tabla).
--
-- counterparty_contact_id / waiting_on_contact_id (Brecha 3): permiten
-- representar un compromiso con una persona que todavía no tiene cuenta en
-- Ping (un contacto del dispositivo, vía la tabla contacts) y, si aplica,
-- que Ping esté esperando la respuesta de esa persona externa. Se optó por
-- dos columnas nullable sobre commitments en vez de una tabla genérica
-- commitment_parties: hoy un compromiso siempre tiene como máximo UNA
-- contraparte (owner vs. assigned_to_user_id vs. counterparty_contact_id son
-- mutuamente excluyentes por diseño, nunca N partes simultáneas en el código
-- actual ni en la visión de producto evaluada) — una tabla de "partes" N:M
-- sería complejidad sin un caso de uso real que la justifique para el MVP.

create table commitments (
    id                          uuid primary key default gen_random_uuid(),
    owner_user_id               uuid not null references profiles(id) on delete cascade,
    assigned_to_user_id         uuid references profiles(id) on delete set null,
    counterparty_contact_id     uuid references contacts(id) on delete set null,
    conversation_id             uuid references conversations(id) on delete set null,
    message_id                  uuid references messages(id) on delete set null,

    title                       text not null,
    description                 text,
    type                        text not null default 'task',
    status                      text not null default 'proposed',
    priority                    text,

    due_at                      timestamptz,
    proposed_due_at             timestamptz,

    expected_result             text,
    next_action                 text,
    follow_up_at                timestamptz,
    waiting_on_user_id          uuid references profiles(id) on delete set null,
    waiting_on_contact_id       uuid references contacts(id) on delete set null,

    action_completed_at         timestamptz,
    resolved_at                 timestamptz,
    rejection_reason            text,

    meta                        jsonb not null default '{}'::jsonb,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),

    constraint commitments_type_check check (type in ('task', 'meeting')),
    constraint commitments_status_check check (
        status in ('proposed', 'accepted', 'counter_proposal', 'rejected', 'resolved', 'cancelled')
    ),
    constraint commitments_priority_check check (priority is null or priority in ('low', 'medium', 'high')),
    -- Brecha 2: una contrapropuesta debe traer siempre la fecha propuesta.
    -- Invariante de una sola fila -> CHECK plano, sin trigger.
    constraint commitments_counter_proposal_due_check check (
        status != 'counter_proposal' or proposed_due_at is not null
    ),
    -- Brecha 3, regla 1: la contraparte es o un usuario de Ping o un contacto
    -- externo, nunca ambos a la vez para el mismo compromiso.
    constraint commitments_assignee_xor_contact_check check (
        not (assigned_to_user_id is not null and counterparty_contact_id is not null)
    ),
    -- Brecha 3, regla 2: "quién debe actuar ahora" es o un usuario de Ping o
    -- un contacto externo, nunca ambos simultáneamente.
    constraint commitments_waiting_xor_contact_check check (
        not (waiting_on_user_id is not null and waiting_on_contact_id is not null)
    )
);

comment on column commitments.meta is 'Reservado para integraciones extensibles (ej. sincronización de calendario externo). NO usar para datos centrales del ciclo de vida: esos tienen columna propia.';
comment on column commitments.waiting_on_user_id is 'Quién debe actuar ahora, si es un usuario de Ping. Mutuamente excluyente con waiting_on_contact_id. NULL cuando nadie está bloqueando el avance.';
comment on column commitments.waiting_on_contact_id is 'Quién debe actuar ahora, si es un contacto externo sin cuenta en Ping. Mutuamente excluyente con waiting_on_user_id.';
comment on column commitments.counterparty_contact_id is 'Contraparte del compromiso cuando es una persona sin cuenta en Ping (referencia a contacts). Mutuamente excluyente con assigned_to_user_id: la propiedad del contacto (debe pertenecer al owner) se valida en el trigger validate_commitment_consistency().';
comment on column commitments.action_completed_at is 'La acción se realizó, pero el asunto puede no estar aún confirmado como resuelto (ver resolved_at).';
comment on column commitments.resolved_at is 'El asunto quedó realmente cerrado. Distinto de action_completed_at por diseño explícito del producto.';
comment on column commitments.conversation_id is 'Nullable: un compromiso puede nacer sin chat (captura manual, voz, IA, fuente externa futura).';
comment on column commitments.message_id is 'Nullable: no todo compromiso tiene un mensaje de origen identificado. Si está presente junto con conversation_id, ambos deben corresponder a la misma conversación (validado en validate_commitment_consistency()).';
comment on column commitments.due_at is 'Nullable: Ping permite capturar primero y programar después. "Sin fecha" es una sección válida de la bandeja, no un estado de error.';

create index commitments_owner_status_due_idx on commitments (owner_user_id, status, due_at);
create index commitments_assigned_status_due_idx on commitments (assigned_to_user_id, status, due_at);
create index commitments_waiting_status_idx on commitments (waiting_on_user_id, status);
create index commitments_waiting_contact_status_idx on commitments (waiting_on_contact_id, status) where waiting_on_contact_id is not null;
create index commitments_follow_up_idx on commitments (follow_up_at);
-- Soporta específicamente la sección "Sin fecha" de la bandeja sin escanear
-- toda la tabla (la mayoría de los compromisos sí tendrá due_at).
create index commitments_no_due_date_idx on commitments (owner_user_id) where due_at is null;
create index commitments_conversation_idx on commitments (conversation_id);
create index commitments_message_idx on commitments (message_id);
create index commitments_counterparty_contact_idx on commitments (counterparty_contact_id) where counterparty_contact_id is not null;

-- -----------------------------------------------------------------------------
-- 7. commitment_events (historial append-only)
-- -----------------------------------------------------------------------------
-- Se genera desde el backend (service role), no mediante un trigger genérico:
-- el "por qué" de cada transición (ej. una aceptación tras una contrapropuesta
-- vs. una aceptación directa) es contexto de aplicación, no algo que un
-- trigger de diff de columnas pueda inferir correctamente.
-- La tabla es append-only por ausencia deliberada de políticas de
-- UPDATE/DELETE para el rol authenticated (ver sección RLS).

create table commitment_events (
    id                  uuid primary key default gen_random_uuid(),
    commitment_id       uuid not null references commitments(id) on delete cascade,
    actor_user_id       uuid references profiles(id) on delete set null,
    event_type          text not null,
    previous_status     text,
    new_status          text,
    payload             jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    constraint commitment_events_type_check check (event_type in (
        'created', 'accepted', 'rejected', 'counter_proposed', 'rescheduled',
        'action_completed', 'resolved', 'reopened', 'cancelled',
        'follow_up_scheduled', 'reassigned'
    ))
);

create index commitment_events_commitment_created_idx on commitment_events (commitment_id, created_at);

-- -----------------------------------------------------------------------------
-- 8. message_reactions
-- -----------------------------------------------------------------------------
-- Renombra emoji -> reaction (nombre más genérico); mismo UNIQUE que V1.
-- La política de lectura deja de ser "USING (true)" (abierta a cualquier
-- usuario autenticado) — ver sección RLS.

create table message_reactions (
    id          uuid primary key default gen_random_uuid(),
    message_id  uuid not null references messages(id) on delete cascade,
    user_id     uuid not null references profiles(id) on delete cascade,
    reaction    text not null,
    created_at  timestamptz not null default now(),
    unique (message_id, user_id, reaction)
);

-- -----------------------------------------------------------------------------
-- 9. ai_messages (histórico de "Preguntar a Ping")
-- -----------------------------------------------------------------------------

create table ai_messages (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references profiles(id) on delete cascade,
    text        text not null,
    is_ai       boolean not null default false,
    created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 10. calls
-- -----------------------------------------------------------------------------
-- Misma forma que V1. La política RLS se corrige respecto al historial: V1
-- permitía leer cualquier llamada con solo que la conversación existiera, sin
-- verificar participación real (hueco de seguridad confirmado en auditoría).

create table calls (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid references conversations(id) on delete cascade,
    resource_id     text,
    sid             text,
    status          text not null default 'started',
    recorder_uid    integer,
    summary         text,
    transcript      text,
    meta            jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint calls_status_check check (status in ('started', 'recording', 'stopped', 'processed'))
);

-- -----------------------------------------------------------------------------
-- 11. user_calendar_accounts
-- -----------------------------------------------------------------------------
-- access_token/refresh_token se almacenan cifrados por el backend (AES-256,
-- ver ENCRYPTION_KEY) ANTES de llegar a esta tabla. La base de datos nunca ve
-- ni valida el token en texto plano; solo persiste el blob cifrado.

create table user_calendar_accounts (
    id                      uuid primary key default gen_random_uuid(),
    user_id                 uuid not null references auth.users(id) on delete cascade,
    provider                text not null,
    email                   text not null,
    access_token            text not null,
    refresh_token           text,
    expires_at              timestamptz,
    is_auto_sync_enabled    boolean not null default false,
    meta                    jsonb not null default '{}'::jsonb,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (user_id, provider)
);

comment on column user_calendar_accounts.access_token is 'Cifrado por el backend antes del insert. Nunca almacenar texto plano.';
comment on column user_calendar_accounts.refresh_token is 'Cifrado por el backend antes del insert. Nunca almacenar texto plano.';

-- =============================================================================
-- FUNCIONES Y TRIGGERS
-- =============================================================================

-- Creación automática de profile al registrarse en Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email);
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- updated_at genérico, aplicado a toda tabla mutable del núcleo.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles
    for each row execute procedure public.set_updated_at();
create trigger trg_conversations_updated_at before update on conversations
    for each row execute procedure public.set_updated_at();
create trigger trg_conversation_participants_updated_at before update on conversation_participants
    for each row execute procedure public.set_updated_at();
create trigger trg_messages_updated_at before update on messages
    for each row execute procedure public.set_updated_at();
create trigger trg_commitments_updated_at before update on commitments
    for each row execute procedure public.set_updated_at();
create trigger trg_contacts_updated_at before update on contacts
    for each row execute procedure public.set_updated_at();
create trigger trg_calls_updated_at before update on calls
    for each row execute procedure public.set_updated_at();
create trigger trg_user_calendar_accounts_updated_at before update on user_calendar_accounts
    for each row execute procedure public.set_updated_at();

-- Cache de "último mensaje" en conversations (evita un join costoso en cada
-- listado de conversaciones).
create or replace function public.update_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
    update conversations
    set
        last_message_id = new.id,
        last_message_at = new.created_at,
        last_message_text = case
            when new.content is not null then (
                case when length(new.content) > 100 then left(new.content, 97) || '...' else new.content end
            )
            else '[Archivo]'
        end
    where id = new.conversation_id;
    return new;
end;
$$;

create trigger trg_update_conversation_last_message
    after insert on messages
    for each row execute procedure public.update_conversation_last_message();

-- Validación de cardinalidad: una conversación 'direct' admite como máximo
-- 2 participantes (1 en el caso particular de un self-chat). Guarda de
-- integridad estructural mínima; el resto de las reglas de producto vive en
-- el backend.
--
-- Casos validados estáticamente:
--   - self-chat (1 participante): conteo final = 1, no > 2, inserta sin error.
--   - directa con 2 participantes: conteo final = 2, no > 2, inserta sin error.
--   - intento de agregar un tercero: conteo final = 3, > 2, lanza excepción y
--     bloquea el insert (comportamiento correcto).
--   - conversación de grupo con múltiples participantes: conv_type <> 'direct',
--     el bloque IF se salta por completo, sin límite (correcto).
--   - eliminación y reinserción: el trigger es AFTER INSERT únicamente; borrar
--     un participante nunca puede violar la regla (solo reduce el conteo), y
--     una reinserción posterior vuelve a evaluar el conteo actualizado
--     correctamente.
--   - concurrencia: dos inserciones concurrentes sobre la MISMA conversación
--     podrían, bajo READ COMMITTED, contar cada una solo su propia fila más
--     las ya confirmadas, sin ver la otra inserción todavía no confirmada —
--     dejando pasar ambas y terminando con 3 participantes. Se cierra esta
--     condición de carrera bloqueando la fila de la conversación (SELECT ...
--     FOR UPDATE) antes de contar, serializando inserciones concurrentes
--     sobre la misma conversación sin necesidad de un candado más amplio.
--     Este único bloqueo adicional evita tener que rediseñar el trigger o
--     trasladar la regla al backend.
create or replace function public.check_direct_conversation_participant_limit()
returns trigger
language plpgsql
as $$
declare
    conv_type text;
    participant_count integer;
begin
    -- Serializa inserciones concurrentes sobre la misma conversación para que
    -- el conteo de abajo sea confiable incluso bajo carga concurrente.
    perform 1 from conversations where id = new.conversation_id for update;

    select conversation_type into conv_type from conversations where id = new.conversation_id;

    if conv_type = 'direct' then
        select count(*) into participant_count
        from conversation_participants
        where conversation_id = new.conversation_id;

        if participant_count > 2 then
            raise exception 'Una conversación directa admite máximo 2 participantes (id=%)', new.conversation_id;
        end if;
    end if;

    return new;
end;
$$;

create trigger trg_check_direct_conversation_limit
    after insert on conversation_participants
    for each row execute procedure public.check_direct_conversation_participant_limit();

-- Brechas 1 y 3: validación de consistencia de commitments que una FK por sí
-- sola no puede expresar. Se combinan ambas reglas en un único trigger (en
-- vez de dos triggers separados) para no multiplicar objetos sobre la tabla
-- más sensible del esquema:
--   1) Si message_id y conversation_id están AMBOS presentes, deben
--      corresponder al mismo mensaje/conversación real (la FK de message_id
--      ya garantiza que el mensaje existe; esto agrega que "vive" en la
--      conversación indicada).
--   2) Si counterparty_contact_id está presente, el contacto referenciado
--      debe pertenecer al owner del compromiso (evita que un usuario
--      referencie el contacto privado de otra persona).
-- Se implementa como trigger (no solo en backend) porque ambas son
-- invariantes de integridad estructural de bajo costo (una sola consulta
-- adicional cada una) sobre la tabla núcleo del producto, y deben cumplirse
-- sin importar qué proceso escriba en commitments en el futuro.
create or replace function public.validate_commitment_consistency()
returns trigger
language plpgsql
as $$
declare
    msg_conversation_id uuid;
    contact_owner_id uuid;
begin
    if new.message_id is not null and new.conversation_id is not null then
        select conversation_id into msg_conversation_id from messages where id = new.message_id;

        if msg_conversation_id is distinct from new.conversation_id then
            raise exception 'commitments.message_id (%) no pertenece a commitments.conversation_id (%)',
                new.message_id, new.conversation_id;
        end if;
    end if;

    if new.counterparty_contact_id is not null then
        select owner_user_id into contact_owner_id from contacts where id = new.counterparty_contact_id;

        if contact_owner_id is distinct from new.owner_user_id then
            raise exception 'commitments.counterparty_contact_id (%) no pertenece al owner del compromiso (%)',
                new.counterparty_contact_id, new.owner_user_id;
        end if;
    end if;

    return new;
end;
$$;

create trigger trg_validate_commitment_consistency
    before insert or update on commitments
    for each row execute procedure public.validate_commitment_consistency();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table commitments enable row level security;
alter table commitment_events enable row level security;
alter table contacts enable row level security;
alter table message_reactions enable row level security;
alter table ai_messages enable row level security;
alter table calls enable row level security;
alter table user_calendar_accounts enable row level security;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares SECURITY DEFINER (auditoría de recursión RLS)
-- -----------------------------------------------------------------------------
-- Auditoría: la política original de conversation_participants (SELECT)
-- filtraba conversation_participants consultando conversation_participants
-- dentro de su propia condición USING. Postgres detecta y rechaza esto en
-- tiempo de ejecución con "infinite recursion detected in policy for
-- relation conversation_participants" — no es un riesgo teórico, es un error
-- real y documentado de Supabase/Postgres para políticas auto-referenciadas.
--
-- El resto de las políticas (conversations, messages, commitments,
-- commitment_events, message_reactions, calls) consultan
-- conversation_participants desde OTRA tabla — eso no causa recursión en sí
-- mismo (no hay ciclo: evaluar esa subconsulta solo exige aplicar la política
-- de conversation_participants una vez), pero si esa política no se arregla,
-- CUALQUIER política que dependa de ella hereda el mismo error de recursión.
--
-- Solución: una función SECURITY DEFINER que resuelve la pertenencia sin
-- volver a evaluar RLS sobre conversation_participants (las funciones
-- SECURITY DEFINER se ejecutan con los privilegios del rol propietario, que
-- por defecto no está sujeto a RLS salvo que la tabla use FORCE ROW LEVEL
-- SECURITY, lo cual no se aplica aquí). Se fija search_path explícitamente
-- para evitar secuestro de esquema, se limita a devolver un booleano (no
-- expone ninguna fila), y se usa como único punto de verdad en todas las
-- políticas que necesitan "¿este usuario participa en esta conversación?".
-- No se usa service role como sustituto de RLS: estas funciones siguen
-- operando dentro del contexto normal del rol authenticated que ejecuta la
-- consulta; solo evitan la auto-referencia recursiva de la tabla.
create or replace function public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from conversation_participants
        where conversation_id = p_conversation_id and user_id = p_user_id
    );
$$;

create or replace function public.shares_conversation_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from conversation_participants cp1
        join conversation_participants cp2 on cp1.conversation_id = cp2.conversation_id
        where cp1.user_id = auth.uid() and cp2.user_id = p_user_id
    );
$$;

-- --- profiles ---------------------------------------------------------------
-- Un usuario ve su propio perfil y el de cualquiera con quien comparta al
-- menos una conversación (necesario para mostrar nombre/avatar en chats).
create policy profiles_select on profiles for select
    to authenticated
    using (
        auth.uid() = id
        or public.shares_conversation_with(profiles.id)
    );

create policy profiles_update_own on profiles for update
    to authenticated
    using (auth.uid() = id);

-- --- conversations -----------------------------------------------------------
-- Solo lectura para el cliente; la creación/edición de conversaciones y
-- grupos siempre pasa por el backend (service role), que ya aplica sus
-- propias reglas de autorización (ej. solo un admin puede renombrar un grupo).
create policy conversations_select on conversations for select
    to authenticated
    using (public.is_conversation_participant(conversations.id, auth.uid()));

-- --- conversation_participants ------------------------------------------------
-- Corregida: antes consultaba esta misma tabla dentro de su propia política
-- (recursión). Ahora usa la función SECURITY DEFINER, que consulta la tabla
-- sin volver a pasar por esta política.
create policy conversation_participants_select on conversation_participants for select
    to authenticated
    using (public.is_conversation_participant(conversation_participants.conversation_id, auth.uid()));

-- --- messages -----------------------------------------------------------------
create policy messages_select on messages for select
    to authenticated
    using (public.is_conversation_participant(messages.conversation_id, auth.uid()));

create policy messages_insert_own on messages for insert
    to authenticated
    with check (
        sender_id = auth.uid()
        and public.is_conversation_participant(messages.conversation_id, auth.uid())
    );

-- --- commitments ----------------------------------------------------------------
-- Un compromiso "para todo el grupo" (assigned_to_user_id IS NULL, atado a una
-- conversación) es visible para cualquier participante de esa conversación.
create policy commitments_select on commitments for select
    to authenticated
    using (
        owner_user_id = auth.uid()
        or assigned_to_user_id = auth.uid()
        or (
            assigned_to_user_id is null
            and conversation_id is not null
            and public.is_conversation_participant(commitments.conversation_id, auth.uid())
        )
    );

create policy commitments_insert_own on commitments for insert
    to authenticated
    with check (owner_user_id = auth.uid());

create policy commitments_update_authorized on commitments for update
    to authenticated
    using (owner_user_id = auth.uid() or assigned_to_user_id = auth.uid());

-- --- commitment_events (append-only: sin políticas de insert/update/delete
-- para authenticated; solo el backend con service role escribe aquí) --------
create policy commitment_events_select on commitment_events for select
    to authenticated
    using (
        exists (
            select 1 from commitments c
            where c.id = commitment_events.commitment_id
              and (
                  c.owner_user_id = auth.uid()
                  or c.assigned_to_user_id = auth.uid()
                  or (
                      c.assigned_to_user_id is null
                      and c.conversation_id is not null
                      and public.is_conversation_participant(c.conversation_id, auth.uid())
                  )
              )
        )
    );

-- --- contacts -----------------------------------------------------------------
create policy contacts_all_own on contacts for all
    to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

-- --- message_reactions ----------------------------------------------------------
-- Reemplaza el "USING (true)" de V1: solo participantes de la conversación del
-- mensaje pueden ver sus reacciones.
create policy message_reactions_select on message_reactions for select
    to authenticated
    using (
        exists (
            select 1 from messages m
            where m.id = message_reactions.message_id
              and public.is_conversation_participant(m.conversation_id, auth.uid())
        )
    );

create policy message_reactions_insert_own on message_reactions for insert
    to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from messages m
            where m.id = message_reactions.message_id
              and public.is_conversation_participant(m.conversation_id, auth.uid())
        )
    );

create policy message_reactions_delete_own on message_reactions for delete
    to authenticated
    using (user_id = auth.uid());

-- --- ai_messages -----------------------------------------------------------------
create policy ai_messages_select_own on ai_messages for select
    to authenticated using (user_id = auth.uid());
create policy ai_messages_insert_own on ai_messages for insert
    to authenticated with check (user_id = auth.uid());
create policy ai_messages_delete_own on ai_messages for delete
    to authenticated using (user_id = auth.uid());

-- --- calls -----------------------------------------------------------------------
-- Corrige el hueco de V1: ya no basta con que la conversación exista, se
-- exige participación real.
create policy calls_select on calls for select
    to authenticated
    using (public.is_conversation_participant(calls.conversation_id, auth.uid()));

-- --- user_calendar_accounts --------------------------------------------------------
create policy calendar_accounts_select_own on user_calendar_accounts for select
    to authenticated using (auth.uid() = user_id);
create policy calendar_accounts_delete_own on user_calendar_accounts for delete
    to authenticated using (auth.uid() = user_id);
-- Sin políticas de insert/update para authenticated: el intercambio OAuth y
-- el cifrado de tokens ocurre siempre en el backend (service role).

-- =============================================================================
-- REALTIME
-- =============================================================================
-- Publicación estándar de Supabase; se agregan solo las tablas que la app
-- realmente necesita en tiempo real.

do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
        alter publication supabase_realtime add table messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'commitments') then
        alter publication supabase_realtime add table commitments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'commitment_events') then
        alter publication supabase_realtime add table commitment_events;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reactions') then
        alter publication supabase_realtime add table message_reactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calls') then
        alter publication supabase_realtime add table calls;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ai_messages') then
        alter publication supabase_realtime add table ai_messages;
    end if;
end $$;

-- =============================================================================
-- Fin del baseline V2
-- =============================================================================
