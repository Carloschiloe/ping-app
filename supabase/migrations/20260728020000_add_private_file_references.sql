-- =============================================================================
-- Ping — Referencias aditivas para archivos privados
-- ADR-024
-- =============================================================================
-- Esta migración no crea buckets, no elimina columnas y no habilita subidas.
-- File se representa mediante bucket + object_path.
-- La presencia de la referencia en el recurso representa el Attachment.

alter table public.messages
    add column if not exists media_bucket text,
    add column if not exists media_object_path text;

alter table public.profiles
    add column if not exists avatar_bucket text,
    add column if not exists avatar_object_path text;

alter table public.conversations
    add column if not exists avatar_bucket text,
    add column if not exists avatar_object_path text;

alter table public.messages
    add constraint messages_private_media_pair_chk
    check ((media_bucket is null) = (media_object_path is null)),
    add constraint messages_private_media_bucket_chk
    check (media_bucket is null or media_bucket = 'chat-media'),
    add constraint messages_private_media_path_chk
    check (
        media_object_path is null
        or (
            media_object_path <> ''
            and media_object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?#])'
        )
    );

alter table public.profiles
    add constraint profiles_private_avatar_pair_chk
    check ((avatar_bucket is null) = (avatar_object_path is null)),
    add constraint profiles_private_avatar_bucket_chk
    check (avatar_bucket is null or avatar_bucket = 'chat-media'),
    add constraint profiles_private_avatar_path_chk
    check (
        avatar_object_path is null
        or (
            avatar_object_path <> ''
            and avatar_object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?#])'
        )
    );

alter table public.conversations
    add constraint conversations_private_avatar_pair_chk
    check ((avatar_bucket is null) = (avatar_object_path is null)),
    add constraint conversations_private_avatar_bucket_chk
    check (avatar_bucket is null or avatar_bucket = 'chat-media'),
    add constraint conversations_private_avatar_path_chk
    check (
        avatar_object_path is null
        or (
            avatar_object_path <> ''
            and avatar_object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?#])'
        )
    );

comment on column public.messages.media_bucket is
    'ADR-024: bucket persistente del File adjunto al mensaje; nunca una URL.';
comment on column public.messages.media_object_path is
    'ADR-024: ruta relativa persistente; nunca URL pública o firmada.';
comment on column public.profiles.avatar_bucket is
    'ADR-024: bucket persistente del avatar asociado al perfil.';
comment on column public.profiles.avatar_object_path is
    'ADR-024: ruta relativa persistente del avatar; nunca URL firmada.';
comment on column public.conversations.avatar_bucket is
    'ADR-024: bucket persistente del avatar asociado a la conversación.';
comment on column public.conversations.avatar_object_path is
    'ADR-024: ruta relativa persistente del avatar; nunca URL firmada.';

-- Verificación posterior de sólo lectura:
-- select table_name, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name in (
--       'media_bucket', 'media_object_path',
--       'avatar_bucket', 'avatar_object_path'
--   )
-- order by table_name, column_name;
