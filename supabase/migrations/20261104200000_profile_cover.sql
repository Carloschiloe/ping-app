-- =============================================================================
-- Ping — Profile cover photo
-- =============================================================================
-- Additive only: two empty columns on profiles, stored like the avatar
-- (bucket + relative path, never a URL). Nothing is removed or rewritten.

alter table public.profiles
    add column if not exists cover_bucket text,
    add column if not exists cover_object_path text;

alter table public.profiles
    add constraint profiles_private_cover_pair_chk
    check ((cover_bucket is null) = (cover_object_path is null)),
    add constraint profiles_private_cover_bucket_chk
    check (cover_bucket is null or cover_bucket = 'chat-media'),
    add constraint profiles_private_cover_path_chk
    check (
        cover_object_path is null
        or (
            cover_object_path <> ''
            and cover_object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?#])'
        )
    );

comment on column public.profiles.cover_bucket is
    'Bucket of the profile cover photo.';
comment on column public.profiles.cover_object_path is
    'Relative path of the profile cover photo; never a signed URL.';
