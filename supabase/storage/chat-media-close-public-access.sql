-- =============================================================================
-- Ping — Close public access to chat-media (production)
-- =============================================================================
-- Found 2026-11-05: chat-media was public and the app's public key could list
-- and download every file. The app already uploads and reads only through
-- server-signed addresses, and the backend signs old public addresses before
-- answering, so closing the bucket does not hide any photo or audio.
--
-- Apply only after the backend with middleware/legacyMediaUrls.ts is live.
-- It changes no file and deletes nothing.

begin;

update storage.buckets
set public = false,
    updated_at = now()
where id = 'chat-media';

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'ping_chat_media_direct_access_closed'
    ) then
        create policy ping_chat_media_direct_access_closed
        on storage.objects
        as restrictive
        for all
        to anon, authenticated
        using (bucket_id <> 'chat-media')
        with check (bucket_id <> 'chat-media');
    end if;
end
$$;

commit;

-- Check: must show public = false.
select id, public from storage.buckets where id = 'chat-media';
