-- Ping: cleanup lifecycle for expired unattached message attachments.
--
-- Expired uploads are first claimed atomically into an inaccessible terminal
-- state, then their Storage object is removed by the backend service. Keeping
-- the row preserves provenance and lets a failed Storage deletion be retried
-- safely on a later sweep.

alter table public.attachments
    drop constraint attachments_lifecycle_check,
    add constraint attachments_lifecycle_check
        check (lifecycle_status in ('pending', 'uploaded', 'attached', 'expired', 'tombstoned'));

alter table public.attachments
    drop constraint attachments_lifecycle_shape_check,
    add constraint attachments_lifecycle_shape_check
        check (
            (lifecycle_status = 'pending'
                and message_id is null
                and uploaded_at is null
                and attached_at is null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'uploaded'
                and message_id is null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'attached'
                and message_id is not null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is not null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'expired'
                and message_id is null
                and attached_at is null
                and tombstoned_at is not null)
            or
            (lifecycle_status = 'tombstoned'
                and message_id is not null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is not null
                and tombstoned_at is not null)
        );

drop index if exists public.attachments_expired_unattached_idx;
create index attachments_expired_unattached_idx
    on public.attachments (expires_at)
    where message_id is null and lifecycle_status in ('pending', 'uploaded', 'expired');

comment on column public.attachments.expires_at is
    'Ventana para identificar uploads pending/uploaded sin mensaje. El backend los reclama como expired y elimina el objeto físico de Storage.';

create or replace function public.list_expired_message_attachments(
    p_limit integer default 100
)
returns setof public.attachments
language sql
security definer
set search_path = public
stable
as $$
    select a.*
    from public.attachments a
    where a.message_id is null
      and a.lifecycle_status in ('pending', 'uploaded', 'expired')
      and a.expires_at <= now()
    order by a.expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

create or replace function public.claim_expired_message_attachment(
    p_attachment_id uuid
)
returns public.attachments
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
    v_attachment public.attachments;
begin
    select *
    into v_attachment
    from public.attachments
    where id = p_attachment_id
      and message_id is null
      and lifecycle_status in ('pending', 'uploaded', 'expired')
      and expires_at <= now()
    for update;

    if not found then
        raise exception 'Expired attachment not found' using errcode = 'P0002';
    end if;

    if v_attachment.lifecycle_status <> 'expired' then
        update public.attachments
        set lifecycle_status = 'expired',
            tombstoned_at = coalesce(tombstoned_at, now())
        where id = v_attachment.id
        returning * into v_attachment;
    end if;

    return v_attachment;
end;
$$;

revoke execute on function public.claim_expired_message_attachment(uuid)
    from public, anon, authenticated;
grant execute on function public.claim_expired_message_attachment(uuid)
    to service_role;

revoke execute on function public.list_expired_message_attachments(integer)
    from public, anon, authenticated;
grant execute on function public.list_expired_message_attachments(integer)
    to service_role;
