-- Ping: reconcile the legacy production shape with the canonical RC contract.
--
-- This migration is deliberately additive and idempotent. It is safe for a
-- fresh canonical database and for the preserved production database that was
-- bridged from the legacy schema. It does not delete data or rewrite source
-- messages; it only fills canonical projections when a legacy column exists.

-- -----------------------------------------------------------------------------
-- 1. Commitment compatibility
-- -----------------------------------------------------------------------------
alter table public.commitments
    add column if not exists conversation_id uuid,
    add column if not exists counterparty_contact_id uuid,
    add column if not exists description text,
    add column if not exists priority text,
    add column if not exists expected_result text,
    add column if not exists next_action text,
    add column if not exists follow_up_at timestamptz,
    add column if not exists waiting_on_user_id uuid,
    add column if not exists waiting_on_contact_id uuid,
    add column if not exists action_completed_at timestamptz,
    add column if not exists resolved_at timestamptz,
    add column if not exists updated_at timestamptz;

alter table public.commitments
    alter column updated_at set default now();

update public.commitments
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.commitments
    alter column updated_at set not null;

-- Legacy production called the conversation relationship group_conversation_id.
-- The guarded dynamic statement keeps this migration valid on the canonical
-- baseline, where that legacy column does not exist.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'commitments'
          and column_name = 'group_conversation_id'
    ) then
        execute $sql$
            update public.commitments
               set conversation_id = group_conversation_id
             where conversation_id is null
               and group_conversation_id is not null
        $sql$;
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.conrelid = 'public.commitments'::regclass
          and c.contype = 'f'
          and a.attname = 'conversation_id'
          and c.confrelid = 'public.conversations'::regclass
    ) then
        alter table public.commitments
            add constraint commitments_conversation_id_fkey
            foreign key (conversation_id) references public.conversations(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.conrelid = 'public.commitments'::regclass
          and c.contype = 'f'
          and a.attname = 'counterparty_contact_id'
          and c.confrelid = 'public.contacts'::regclass
    ) then
        alter table public.commitments
            add constraint commitments_counterparty_contact_id_fkey
            foreign key (counterparty_contact_id) references public.contacts(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.conrelid = 'public.commitments'::regclass
          and c.contype = 'f'
          and a.attname = 'waiting_on_user_id'
          and c.confrelid = 'public.profiles'::regclass
    ) then
        alter table public.commitments
            add constraint commitments_waiting_on_user_id_fkey
            foreign key (waiting_on_user_id) references public.profiles(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.conrelid = 'public.commitments'::regclass
          and c.contype = 'f'
          and a.attname = 'waiting_on_contact_id'
          and c.confrelid = 'public.contacts'::regclass
    ) then
        alter table public.commitments
            add constraint commitments_waiting_on_contact_id_fkey
            foreign key (waiting_on_contact_id) references public.contacts(id)
            on delete set null;
    end if;
end
$$;

create index if not exists commitments_conversation_idx
    on public.commitments (conversation_id);

-- -----------------------------------------------------------------------------
-- 2. Commitment events and shared helper functions
-- -----------------------------------------------------------------------------
create table if not exists public.commitment_events (
    id uuid primary key default gen_random_uuid(),
    commitment_id uuid not null references public.commitments(id) on delete cascade,
    actor_user_id uuid references public.profiles(id) on delete set null,
    event_type text not null,
    previous_status text,
    new_status text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.commitment_events
    add column if not exists actor_user_id uuid,
    add column if not exists previous_status text,
    add column if not exists new_status text,
    add column if not exists payload jsonb,
    add column if not exists created_at timestamptz;

alter table public.commitment_events
    alter column payload set default '{}'::jsonb,
    alter column created_at set default now();

update public.commitment_events
set payload = coalesce(payload, '{}'::jsonb),
    created_at = coalesce(created_at, now())
where payload is null or created_at is null;

alter table public.commitment_events
    alter column payload set not null,
    alter column created_at set not null;

alter table public.commitment_events
    drop constraint if exists commitment_events_type_check;

alter table public.commitment_events
    add constraint commitment_events_type_check
    check (event_type in (
        'created', 'edited', 'archived', 'accepted', 'rejected', 'counter_proposed',
        'rescheduled', 'action_completed', 'resolved', 'reopened', 'cancelled',
        'follow_up_scheduled', 'reassigned'
    ));

create index if not exists commitment_events_commitment_created_idx
    on public.commitment_events (commitment_id, created_at);

create or replace function public.is_conversation_participant(
    p_conversation_id uuid,
    p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
    select exists (
        select 1
        from public.conversation_participants
        where conversation_id = p_conversation_id
          and user_id = p_user_id
    );
$$;

create or replace function public.shares_conversation_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
    select exists (
        select 1
        from public.conversation_participants cp1
        join public.conversation_participants cp2
          on cp1.conversation_id = cp2.conversation_id
        where cp1.user_id = (select auth.uid())
          and cp2.user_id = p_user_id
    );
$$;

revoke execute on function public.is_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
revoke execute on function public.shares_conversation_with(uuid) from public, anon;
grant execute on function public.shares_conversation_with(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Trigger execution must remain available to authenticated writes on tables
-- that still expose a compatible direct-write path. The function is still
-- safe: it has a fixed search_path and only assigns updated_at.
revoke execute on function public.set_updated_at() from public, anon;
grant execute on function public.set_updated_at() to authenticated, service_role;

alter table public.commitment_events enable row level security;
drop policy if exists commitment_events_select on public.commitment_events;
create policy commitment_events_select
    on public.commitment_events for select
    to authenticated
    using (
        exists (
            select 1
            from public.commitments c
            where c.id = commitment_events.commitment_id
              and (
                  c.owner_user_id = (select auth.uid())
                  or c.assigned_to_user_id = (select auth.uid())
                  or (
                      c.assigned_to_user_id is null
                      and c.conversation_id is not null
                      and public.is_conversation_participant(c.conversation_id, (select auth.uid()))
                  )
              )
        )
    );

revoke all on table public.commitment_events from anon;
grant select on table public.commitment_events to authenticated;
grant all on table public.commitment_events to service_role;

-- -----------------------------------------------------------------------------
-- 3. Message compatibility projection
-- -----------------------------------------------------------------------------
alter table public.messages
    add column if not exists content text,
    add column if not exists message_type text,
    add column if not exists user_id uuid,
    add column if not exists media_url text,
    add column if not exists media_metadata jsonb,
    add column if not exists system_event_type text,
    add column if not exists metadata jsonb,
    add column if not exists updated_at timestamptz,
    add column if not exists deleted_at timestamptz;

alter table public.messages
    alter column message_type set default 'text',
    alter column media_metadata set default '{}'::jsonb,
    alter column metadata set default '{}'::jsonb,
    alter column updated_at set default now();

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'text'
    ) then
        execute $sql$
            update public.messages
               set content = text
             where content is null and text is not null
        $sql$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'meta'
    ) then
        execute $sql$
            update public.messages
               set metadata = meta
             where metadata is null and meta is not null
        $sql$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'type'
    ) then
        execute $sql$
            update public.messages
               set message_type = type
             where message_type is null
               and type in ('text', 'image', 'video', 'audio', 'document', 'location', 'system')
        $sql$;
    end if;
end
$$;

update public.messages
set message_type = case
        when message_type in ('text', 'image', 'video', 'audio', 'document', 'location', 'system') then message_type
        else 'text'
    end,
    media_metadata = coalesce(media_metadata, '{}'::jsonb),
    metadata = coalesce(metadata, '{}'::jsonb),
    updated_at = coalesce(updated_at, created_at, now())
where message_type is null
   or message_type not in ('text', 'image', 'video', 'audio', 'document', 'location', 'system')
   or media_metadata is null
   or metadata is null
   or updated_at is null;

alter table public.messages
    alter column message_type set not null,
    alter column media_metadata set not null,
    alter column metadata set not null,
    alter column updated_at set not null;

alter table public.messages
    drop constraint if exists messages_type_check;

alter table public.messages
    add constraint messages_type_check
    check (message_type in ('text', 'image', 'video', 'audio', 'document', 'location', 'system'));

-- -----------------------------------------------------------------------------
-- 4. API hardening: authenticated-only client surface
-- -----------------------------------------------------------------------------
do $$
declare
    policy_row record;
begin
    for policy_row in
        select tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and roles @> array['public']::name[]
          and tablename = any (array[
              'agent_authorizations', 'agent_dialogue_checkpoints', 'agent_executions',
              'agent_turn_admissions', 'agent_turn_semantic_checkpoints',
              'commitment_events', 'memory_record_evidence', 'memory_records',
              'message_reactions', 'messages', 'profiles', 'user_calendar_accounts'
          ]::name[])
    loop
        execute format(
            'alter policy %I on public.%I to authenticated',
            policy_row.policyname,
            policy_row.tablename
        );
    end loop;
end
$$;

-- Remove legacy policies that either expose rows to every role or permit the
-- old direct-write path. Canonical policies below preserve signed-in access.
drop policy if exists "Users can see all reactions" on public.message_reactions;
drop policy if exists "Users can insert their own reactions" on public.message_reactions;
drop policy if exists "Users can delete their own reactions" on public.message_reactions;
drop policy if exists message_reactions_select on public.message_reactions;
drop policy if exists message_reactions_insert_own on public.message_reactions;
drop policy if exists message_reactions_delete_own on public.message_reactions;

create policy message_reactions_select
    on public.message_reactions for select
    to authenticated
    using (
        exists (
            select 1 from public.messages m
            where m.id = message_reactions.message_id
              and public.is_conversation_participant(m.conversation_id, (select auth.uid()))
        )
    );

create policy message_reactions_insert_own
    on public.message_reactions for insert
    to authenticated
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.messages m
            where m.id = message_reactions.message_id
              and m.deleted_at is null
              and public.is_conversation_participant(m.conversation_id, (select auth.uid()))
        )
    );

create policy message_reactions_delete_own
    on public.message_reactions for delete
    to authenticated
    using (user_id = (select auth.uid()));

drop policy if exists "Users can view their own messages" on public.messages;
drop policy if exists "Users see conversation messages" on public.messages;
drop policy if exists "Users can insert their own messages" on public.messages;
drop policy if exists "Usuarios pueden eliminar sus mensajes" on public.messages;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert_own on public.messages;

create policy messages_select
    on public.messages for select
    to authenticated
    using (
        sender_id = (select auth.uid())
        or user_id = (select auth.uid())
        or public.is_conversation_participant(conversation_id, (select auth.uid()))
    );

create policy messages_insert_own
    on public.messages for insert
    to authenticated
    with check (
        sender_id = (select auth.uid())
        and (
            conversation_id is null
            or public.is_conversation_participant(conversation_id, (select auth.uid()))
        )
    );

-- No anonymous client needs direct access to application tables. Backend
-- service_role access is intentionally preserved; authenticated access remains
-- governed by RLS and the policies above.
revoke all on table public.agent_authorizations,
    public.agent_dialogue_checkpoints,
    public.agent_executions,
    public.agent_turn_admissions,
    public.agent_turn_semantic_checkpoints,
    public.commitment_events,
    public.memory_record_evidence,
    public.memory_records,
    public.message_reactions,
    public.messages,
    public.profiles,
    public.user_calendar_accounts
from anon;

revoke all on table public.agent_turn_sequence_allocators from anon, authenticated;

grant select on table public.agent_authorizations,
    public.agent_dialogue_checkpoints,
    public.agent_executions,
    public.agent_turn_admissions,
    public.agent_turn_semantic_checkpoints,
    public.memory_record_evidence,
    public.memory_records,
    public.profiles,
    public.user_calendar_accounts
to authenticated;

grant select, insert, delete on table public.message_reactions to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;



