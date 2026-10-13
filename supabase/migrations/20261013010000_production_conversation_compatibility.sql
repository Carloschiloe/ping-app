begin;

-- Canonical conversation shape over the legacy production tables.
-- All legacy columns remain in place for rollback/compatibility.

alter table public.conversations
  add column if not exists conversation_type text,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz;

alter table public.conversations
  alter column conversation_type set default 'direct',
  alter column updated_at set default now();

update public.conversations
set conversation_type = case when is_group is true then 'group' else 'direct' end
where conversation_type is null;

update public.conversations
set created_by = admin_id
where created_by is null
  and admin_id is not null
  and exists (
    select 1 from public.profiles p where p.id = public.conversations.admin_id
  );

update public.conversations c
set created_by = cp.user_id
from (
  select distinct on (conversation_id) conversation_id, user_id
  from public.conversation_participants
  where role = 'admin'
  order by conversation_id, joined_at nulls last, user_id
) cp
where c.created_by is null
  and c.id = cp.conversation_id;

update public.conversations
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.conversations
  alter column conversation_type set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_type_check'
  ) then
    alter table public.conversations
      add constraint conversations_type_check
      check (conversation_type in ('direct', 'group'));
  end if;
end $$;

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.conversation_participants
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.conversation_participants
set created_at = coalesce(created_at, joined_at, now()),
    updated_at = coalesce(updated_at, joined_at, now()),
    archived_at = case
      when archived is true then coalesce(archived_at, joined_at, now())
      else archived_at
    end
where created_at is null
   or updated_at is null
   or (archived is true and archived_at is null);

alter table public.conversation_participants
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.messages
  add column if not exists system_event_type text;

comment on column public.conversations.conversation_type is
  'Canonical conversation type; legacy is_group remains during compatibility window.';
comment on column public.conversation_participants.archived_at is
  'Canonical archive timestamp; legacy archived remains during compatibility window.';
comment on column public.messages.system_event_type is
  'Canonical marker for system-origin messages; legacy message columns remain during compatibility window.';

commit;
