-- Ping C-3: Messaging Core canonico.
--
-- Esta migracion es aditiva. Conserva messages.status y las rutas legacy,
-- pero mueve la fuente de verdad de delivery/read a receipts por receptor.
-- Tambien convierte el borrado funcional en tombstone y ofrece primitivas
-- transaccionales para crear conversaciones con sus participantes.

alter table public.conversations
    add column if not exists deleted_at timestamptz,
    add column if not exists deleted_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.messages
    add column if not exists deleted_by_user_id uuid references public.profiles(id) on delete set null,
    add column if not exists deletion_reason text;

create table if not exists public.message_receipts (
    message_id uuid not null references public.messages(id) on delete restrict,
    user_id uuid not null references public.profiles(id) on delete restrict,
    delivered_at timestamptz,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (message_id, user_id),
    constraint message_receipts_read_requires_delivery_check
        check (read_at is null or delivered_at is not null),
    constraint message_receipts_time_order_check
        check (read_at is null or delivered_at <= read_at)
);

create index if not exists message_receipts_user_unread_idx
    on public.message_receipts (user_id, message_id)
    where read_at is null;

create table if not exists public.message_events (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null references public.messages(id) on delete restrict,
    conversation_id uuid not null references public.conversations(id) on delete restrict,
    actor_user_id uuid references public.profiles(id) on delete set null,
    event_type text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint message_events_type_check check (event_type in ('tombstoned'))
);

create index if not exists message_events_message_created_idx
    on public.message_events (message_id, created_at);

comment on table public.message_receipts is
    'Fuente canonica por receptor para delivery/read. La persistencia del mensaje representa sent.';
comment on column public.messages.status is
    'Compatibilidad legacy derivada de message_receipts: read/delivered solo cuando todos los receptores reales alcanzaron el estado; sent en otro caso.';
comment on column public.messages.deleted_at is
    'Tombstone funcional. La fila y su contenido original permanecen para conservar procedencia; los adapters de lectura ocultan el contenido.';

create trigger trg_message_receipts_updated_at
    before update on public.message_receipts
    for each row execute procedure public.set_updated_at();

-- Snapshot historico conservador. En 1:1 existe un solo receptor real y el
-- status legacy se puede trasladar sin ambiguedad. En grupos no se atribuye el
-- status global antiguo a todos: los receipts comienzan sin delivery/read.
with recipient_snapshot as (
    select
        m.id as message_id,
        cp.user_id,
        m.status,
        m.updated_at,
        count(*) over (partition by m.id) as recipient_count
    from public.messages m
    join public.conversation_participants cp
      on cp.conversation_id = m.conversation_id
     and cp.user_id is distinct from m.sender_id
)
insert into public.message_receipts (
    message_id,
    user_id,
    delivered_at,
    read_at
)
select
    message_id,
    user_id,
    case
        when recipient_count = 1 and status in ('delivered', 'read') then updated_at
        else null
    end,
    case
        when recipient_count = 1 and status = 'read' then updated_at
        else null
    end
from recipient_snapshot
on conflict (message_id, user_id) do nothing;

-- Recalcula la proyeccion legacy despues del backfill. Self-chat tiene cero
-- receptores y permanece sent: persisted si aplica; delivery/read no aplica.
update public.messages m
set status = case
    when stats.recipient_count > 0 and stats.read_count = stats.recipient_count then 'read'
    when stats.recipient_count > 0 and stats.delivered_count = stats.recipient_count then 'delivered'
    else 'sent'
end
from (
    select
        message_id,
        count(*) as recipient_count,
        count(*) filter (where delivered_at is not null) as delivered_count,
        count(*) filter (where read_at is not null) as read_count
    from public.message_receipts
    group by message_id
) stats
where m.id = stats.message_id;

update public.messages m
set status = 'sent'
where not exists (
    select 1 from public.message_receipts mr where mr.message_id = m.id
);

create or replace function public.refresh_message_legacy_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_message_id uuid := coalesce(new.message_id, old.message_id);
    v_recipient_count integer;
    v_delivered_count integer;
    v_read_count integer;
begin
    select
        count(*),
        count(*) filter (where delivered_at is not null),
        count(*) filter (where read_at is not null)
    into v_recipient_count, v_delivered_count, v_read_count
    from public.message_receipts
    where message_id = v_message_id;

    update public.messages
    set status = case
        when v_recipient_count > 0 and v_read_count = v_recipient_count then 'read'
        when v_recipient_count > 0 and v_delivered_count = v_recipient_count then 'delivered'
        else 'sent'
    end
    where id = v_message_id;

    return coalesce(new, old);
end;
$$;

create trigger trg_refresh_message_legacy_status
    after insert or update of delivered_at, read_at on public.message_receipts
    for each row execute procedure public.refresh_message_legacy_status();

create or replace function public.guard_message_legacy_status_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.status is distinct from old.status and pg_trigger_depth() <= 1 then
        raise exception 'messages.status is a derived compatibility projection; update message_receipts instead'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

create trigger trg_guard_message_legacy_status_write
    before update of status on public.messages
    for each row execute procedure public.guard_message_legacy_status_write();

create or replace function public.initialize_message_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted_at timestamptz;
begin
    select deleted_at into v_deleted_at
    from public.conversations
    where id = new.conversation_id
    for share;

    if not found or v_deleted_at is not null then
        raise exception 'Conversation is unavailable' using errcode = '23503';
    end if;

    if new.sender_id is not null and not public.is_conversation_participant(new.conversation_id, new.sender_id) then
        raise exception 'Message sender is not a conversation participant' using errcode = '42501';
    end if;

    insert into public.message_receipts (message_id, user_id)
    select new.id, cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id is distinct from new.sender_id
    on conflict (message_id, user_id) do nothing;

    return new;
end;
$$;

create trigger trg_initialize_message_recipients
    after insert on public.messages
    for each row execute procedure public.initialize_message_recipients();

create or replace function public.messaging_actor(p_actor_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    v_claim_user_id uuid := auth.uid();
begin
    if v_claim_user_id is not null
       and p_actor_user_id is not null
       and p_actor_user_id is distinct from v_claim_user_id then
        raise exception 'Actor does not match authenticated user' using errcode = '42501';
    end if;
    if coalesce(v_claim_user_id, p_actor_user_id) is null then
        raise exception 'Messaging actor is required' using errcode = '42501';
    end if;
    return coalesce(v_claim_user_id, p_actor_user_id);
end;
$$;

create or replace function public.mark_message_receipt(
    p_message_id uuid,
    p_state text,
    p_actor_user_id uuid default null
)
returns public.message_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_receipt public.message_receipts;
    v_now timestamptz := now();
begin
    if p_state not in ('delivered', 'read') then
        raise exception 'Invalid receipt state' using errcode = '22023';
    end if;

    update public.message_receipts
    set
        delivered_at = case
            when p_state in ('delivered', 'read') then coalesce(delivered_at, v_now)
            else delivered_at
        end,
        read_at = case
            when p_state = 'read' then coalesce(read_at, v_now)
            else read_at
        end
    where message_id = p_message_id
      and user_id = v_actor_user_id
    returning * into v_receipt;

    if not found then
        raise exception 'No receipt belongs to this actor for the message' using errcode = '42501';
    end if;

    return v_receipt;
end;
$$;

create or replace function public.mark_conversation_read(
    p_conversation_id uuid,
    p_actor_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_updated integer;
    v_now timestamptz := now();
begin
    if not public.is_conversation_participant(p_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;

    update public.message_receipts mr
    set delivered_at = coalesce(mr.delivered_at, v_now),
        read_at = coalesce(mr.read_at, v_now)
    from public.messages m
    where mr.message_id = m.id
      and mr.user_id = v_actor_user_id
      and m.conversation_id = p_conversation_id
      and mr.read_at is null;
    get diagnostics v_updated = row_count;

    update public.conversation_participants
    set last_read_at = v_now
    where conversation_id = p_conversation_id
      and user_id = v_actor_user_id;

    return v_updated;
end;
$$;

create or replace function public.tombstone_message(
    p_message_id uuid,
    p_actor_user_id uuid default null,
    p_reason text default 'user_deleted'
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_message public.messages;
begin
    select * into v_message
    from public.messages
    where id = p_message_id
    for update;

    if not found then
        raise exception 'Message not found' using errcode = 'P0002';
    end if;

    if v_message.sender_id is distinct from v_actor_user_id and not exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id = v_message.conversation_id
          and cp.user_id = v_actor_user_id
          and cp.role = 'admin'
    ) then
        raise exception 'Actor cannot delete this message' using errcode = '42501';
    end if;

    if v_message.deleted_at is null then
        update public.messages
        set deleted_at = now(),
            deleted_by_user_id = v_actor_user_id,
            deletion_reason = left(coalesce(nullif(trim(p_reason), ''), 'user_deleted'), 100)
        where id = p_message_id
        returning * into v_message;

        insert into public.message_events (
            message_id,
            conversation_id,
            actor_user_id,
            event_type,
            details
        ) values (
            v_message.id,
            v_message.conversation_id,
            v_actor_user_id,
            'tombstoned',
            jsonb_build_object('reason', v_message.deletion_reason)
        );
    end if;

    return v_message;
end;
$$;

create or replace function public.prevent_message_physical_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    raise exception 'Physical message deletion is forbidden; use tombstone_message'
        using errcode = '42501';
end;
$$;

create trigger trg_prevent_message_physical_delete
    before delete on public.messages
    for each row execute procedure public.prevent_message_physical_delete();

create or replace function public.create_conversation_with_participants(
    p_creator_user_id uuid,
    p_conversation_type text,
    p_participant_ids uuid[],
    p_name text default null,
    p_avatar_url text default null,
    p_reuse_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_participant_ids uuid[];
    v_conversation_id uuid;
begin
    if p_creator_user_id is null then
        raise exception 'Creator is required' using errcode = '22023';
    end if;
    if p_conversation_type not in ('direct', 'group') then
        raise exception 'Invalid conversation type' using errcode = '22023';
    end if;

    select array_agg(user_id order by user_id)
    into v_participant_ids
    from (
        select distinct unnest(coalesce(p_participant_ids, '{}'::uuid[]) || array[p_creator_user_id]) as user_id
    ) normalized;

    if p_conversation_type = 'direct' and cardinality(v_participant_ids) not in (1, 2) then
        raise exception 'Direct conversations require one or two participants' using errcode = '22023';
    end if;
    if p_conversation_type = 'group' and (p_name is null or trim(p_name) = '') then
        raise exception 'Group name is required' using errcode = '22023';
    end if;

    if p_conversation_type = 'direct' and p_reuse_existing then
        perform pg_advisory_xact_lock(hashtextextended(array_to_string(v_participant_ids, ':'), 0));

        select c.id into v_conversation_id
        from public.conversations c
        where c.conversation_type = 'direct'
          and c.deleted_at is null
          and (select count(*) from public.conversation_participants cp where cp.conversation_id = c.id) = cardinality(v_participant_ids)
          and not exists (
              select 1
              from unnest(v_participant_ids) expected(user_id)
              where not exists (
                  select 1 from public.conversation_participants cp
                  where cp.conversation_id = c.id and cp.user_id = expected.user_id
              )
          )
        order by c.created_at
        limit 1;

        if v_conversation_id is not null then
            return v_conversation_id;
        end if;
    end if;

    insert into public.conversations (
        conversation_type,
        name,
        avatar_url,
        created_by
    ) values (
        p_conversation_type,
        case when p_conversation_type = 'group' then trim(p_name) else null end,
        p_avatar_url,
        p_creator_user_id
    ) returning id into v_conversation_id;

    insert into public.conversation_participants (conversation_id, user_id, role)
    select
        v_conversation_id,
        participant_id,
        case
            when p_conversation_type = 'group' or cardinality(v_participant_ids) = 1
                then case when participant_id = p_creator_user_id then 'admin' else 'member' end
            else 'member'
        end
    from unnest(v_participant_ids) participant_id;

    return v_conversation_id;
end;
$$;

create or replace function public.tombstone_conversation(
    p_conversation_id uuid,
    p_actor_user_id uuid
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conversation public.conversations;
begin
    select * into v_conversation
    from public.conversations
    where id = p_conversation_id
    for update;

    if not found then
        raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
    if not exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id = p_actor_user_id
          and cp.role = 'admin'
    ) then
        raise exception 'Only a conversation admin can delete it' using errcode = '42501';
    end if;

    update public.conversations
    set deleted_at = coalesce(deleted_at, now()),
        deleted_by_user_id = coalesce(deleted_by_user_id, p_actor_user_id)
    where id = p_conversation_id
    returning * into v_conversation;

    return v_conversation;
end;
$$;

create or replace function public.prevent_conversation_with_messages_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if exists (select 1 from public.messages where conversation_id = old.id) then
        raise exception 'Conversation with messages cannot be physically deleted; use tombstone_conversation'
            using errcode = '42501';
    end if;
    return old;
end;
$$;

create trigger trg_prevent_conversation_with_messages_delete
    before delete on public.conversations
    for each row execute procedure public.prevent_conversation_with_messages_delete();

alter table public.message_receipts enable row level security;
alter table public.message_events enable row level security;

create policy message_receipts_select_participant
    on public.message_receipts for select
    to authenticated
    using (
        exists (
            select 1 from public.messages m
            where m.id = message_receipts.message_id
              and public.is_conversation_participant(m.conversation_id, auth.uid())
        )
    );

create policy message_events_select_participant
    on public.message_events for select
    to authenticated
    using (public.is_conversation_participant(message_events.conversation_id, auth.uid()));

drop policy if exists message_reactions_insert_own on public.message_reactions;
create policy message_reactions_insert_own on public.message_reactions for insert
    to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.messages m
            where m.id = message_reactions.message_id
              and m.deleted_at is null
              and public.is_conversation_participant(m.conversation_id, auth.uid())
        )
    );

-- Sin policies INSERT/UPDATE/DELETE para authenticated en receipts/events.
-- Los cambios pasan por funciones que ligan el actor al claim o por backend
-- service_role con actor explicito.

revoke all on table public.message_receipts from anon, authenticated;
revoke all on table public.message_events from anon, authenticated;
grant select on table public.message_receipts to authenticated;
grant select on table public.message_events to authenticated;

revoke execute on function public.messaging_actor(uuid) from public, anon, authenticated;
grant execute on function public.messaging_actor(uuid) to service_role;

revoke execute on function public.mark_message_receipt(uuid, text, uuid) from public, anon;
grant execute on function public.mark_message_receipt(uuid, text, uuid) to authenticated, service_role;

revoke execute on function public.mark_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated, service_role;

revoke execute on function public.tombstone_message(uuid, uuid, text) from public, anon;
grant execute on function public.tombstone_message(uuid, uuid, text) to authenticated, service_role;

revoke execute on function public.create_conversation_with_participants(uuid, text, uuid[], text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_conversation_with_participants(uuid, text, uuid[], text, text, boolean) to service_role;

revoke execute on function public.tombstone_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tombstone_conversation(uuid, uuid) to service_role;

-- Las funciones internas de trigger no son una API invocable.
revoke execute on function public.refresh_message_legacy_status() from public, anon, authenticated;
revoke execute on function public.guard_message_legacy_status_write() from public, anon, authenticated;
revoke execute on function public.initialize_message_recipients() from public, anon, authenticated;
revoke execute on function public.prevent_message_physical_delete() from public, anon, authenticated;
revoke execute on function public.prevent_conversation_with_messages_delete() from public, anon, authenticated;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_receipts'
    ) then
        alter publication supabase_realtime add table public.message_receipts;
    end if;
end $$;
