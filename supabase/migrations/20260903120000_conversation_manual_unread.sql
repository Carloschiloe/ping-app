-- C-6: Mark as Unread canónico.
--
-- Agrega una preferencia privada por participante para "destacar esta
-- conversación como pendiente" sin tocar message_receipts.read_at, que sigue
-- siendo el registro histórico real e inmutable de lectura (monótono,
-- delivered -> read, nunca hacia atrás — ver message_receipts_time_order_check
-- en 20260830010000_messaging_core_canonical.sql). No se edita ninguna
-- migración histórica: mark_conversation_read se redefine aquí (create or
-- replace, misma firma) para limpiar el nuevo campo de forma atómica al
-- marcar como leído.

alter table public.conversation_participants
    add column if not exists marked_unread_at timestamptz;

-- RPC canónico: marcar conversación como no leída (preferencia manual).
-- Mismo patrón de seguridad que mark_conversation_read: resuelve el actor via
-- messaging_actor() (rechaza suplantación de otro usuario), valida membership
-- via is_conversation_participant(), y sólo toca la fila propia del actor en
-- conversation_participants. No toca message_receipts ni messages.
create or replace function public.mark_conversation_unread(
    p_conversation_id uuid,
    p_actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_now timestamptz := now();
    v_updated integer;
begin
    if not public.is_conversation_participant(p_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;

    update public.conversation_participants
    set marked_unread_at = v_now
    where conversation_id = p_conversation_id
      and user_id = v_actor_user_id;
    get diagnostics v_updated = row_count;

    return v_updated > 0;
end;
$$;

-- mark_conversation_read: redefinida (misma firma que en
-- 20260830010000_messaging_core_canonical.sql) para además limpiar
-- marked_unread_at de forma atómica al marcar como leído — abrir/leer una
-- conversación marcada manualmente como pendiente la resuelve, en la misma
-- transacción que ya actualiza message_receipts y last_read_at.
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
    set last_read_at = v_now,
        marked_unread_at = null
    where conversation_id = p_conversation_id
      and user_id = v_actor_user_id;

    return v_updated;
end;
$$;

revoke execute on function public.mark_conversation_unread(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_unread(uuid, uuid) to authenticated, service_role;
