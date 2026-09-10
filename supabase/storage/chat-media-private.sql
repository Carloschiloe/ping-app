-- =============================================================================
-- Ping — Procedimiento reproducible para chat-media privado
-- ADR-024
-- =============================================================================
-- NO ejecutar sin:
--   1. confirmar project ref de staging;
--   2. generar y verificar el backup previo;
--   3. aprobar expresamente la intervención remota.
--
-- Este archivo no se ejecuta como parte automática del backend.

begin;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'chat-media',
    'chat-media',
    false,
    -- Canonical message-attachment size policy. Single source of truth:
    -- backend/src/services/privateFile.service.ts's
    -- MAX_MESSAGE_ATTACHMENT_BYTES (50 * 1024 * 1024 = 52428800), mirrored
    -- by the DB check constraint/RPC guard in
    -- supabase/migrations/20260910010000_message_attachment_size_policy.sql.
    -- Raised from the original 20971520 (20 MiB) after real physical
    -- evidence showed a normal 2-minute recorded video (~32.8MB) exceeded
    -- it. Keep this literal in sync with that constant and migration
    -- whenever the policy changes — this script is the reproducible record
    -- of the bucket's provisioned state, not merely a one-time setup.
    52428800,
    array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'audio/aac',
        'audio/m4a',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'application/pdf'
    ]::text[]
)
on conflict (id) do update
set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

-- La ausencia de políticas permisivas impide acceso directo. Esta política
-- RESTRICTIVE agrega una barrera explícita: incluso si aparece otra política
-- permisiva amplia, anon/authenticated no pueden operar sobre chat-media.
do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'ping_chat_media_direct_access_closed'
    ) then
        execute $policy$
            create policy ping_chat_media_direct_access_closed
            on storage.objects
            as restrictive
            for all
            to anon, authenticated
            using (bucket_id <> 'chat-media')
            with check (bucket_id <> 'chat-media')
        $policy$;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from storage.buckets
        where id = 'chat-media' and public = false
    ) then
        raise exception 'chat-media must exist and remain private';
    end if;
end
$$;

commit;

-- Verificación posterior de sólo lectura:
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'chat-media';

select policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;
