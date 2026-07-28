-- Ping beta: idempotencia funcional de mensajes para reintentos offline.
-- Aditiva; no modifica ni elimina mensajes existentes.

alter table public.messages
    add column if not exists client_message_id uuid;

create unique index if not exists messages_sender_client_message_unique_idx
    on public.messages (sender_id, client_message_id)
    where sender_id is not null and client_message_id is not null;

create index if not exists messages_conversation_client_message_idx
    on public.messages (conversation_id, client_message_id)
    where client_message_id is not null;

comment on column public.messages.client_message_id is
    'Identidad estable generada por el cliente. Permite reintentar un envío cuyo resultado era desconocido sin crear otro mensaje.';
