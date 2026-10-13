begin;

-- Canonical contacts shape over the legacy production table.
-- Legacy contact_user_id is preserved during the compatibility window.

alter table public.contacts
  add column if not exists linked_user_id uuid,
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz;

alter table public.contacts
  alter column metadata set default '{}'::jsonb,
  alter column updated_at set default now();

update public.contacts c
set linked_user_id = c.contact_user_id
where c.linked_user_id is null
  and c.contact_user_id is not null;

update public.contacts c
set display_name = coalesce(
  nullif(p.full_name, ''),
  nullif(p.email, ''),
  nullif(c.email, ''),
  nullif(c.phone, ''),
  'Contacto'
)
from public.profiles p
where c.display_name is null
  and c.contact_user_id = p.id;

update public.contacts
set display_name = coalesce(nullif(display_name, ''), nullif(email, ''), nullif(phone, ''), 'Contacto'),
    metadata = coalesce(metadata, '{}'::jsonb),
    updated_at = coalesce(updated_at, created_at, now())
where display_name is null
   or display_name = ''
   or metadata is null
   or updated_at is null;

alter table public.contacts
  alter column display_name set not null,
  alter column metadata set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contacts'::regclass
      and conname = 'contacts_linked_user_id_fkey'
  ) then
    alter table public.contacts
      add constraint contacts_linked_user_id_fkey
      foreign key (linked_user_id)
      references public.profiles(id)
      on delete set null;
  end if;
end $$;

comment on column public.contacts.linked_user_id is
  'Canonical linked Ping user; legacy contact_user_id remains during compatibility window.';
comment on column public.contacts.display_name is
  'Canonical contact display name.';
comment on column public.contacts.metadata is
  'Canonical extensible contact metadata.';

commit;
