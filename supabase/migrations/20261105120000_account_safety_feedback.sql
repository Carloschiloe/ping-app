-- =============================================================================
-- Ping — Account deletion, blocking, reports and feedback
-- =============================================================================
-- Additive only. Required by Google Play (account deletion, block and report
-- in a chat app, report of AI replies) and by Chile's Ley 21.719 (right to
-- erase). Every new table is reached only through the backend's service role:
-- RLS is on and no policy is granted to app users.

alter table public.profiles
    add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
    'When the person deleted their account. The row stays so shared chats keep '
    'their history, shown as "Cuenta eliminada"; personal data is erased.';

-- -----------------------------------------------------------------------------
-- Blocks: the blocker stops receiving messages and calls from the blocked
-- person in their direct chat.
-- -----------------------------------------------------------------------------
create table if not exists public.user_blocks (
    blocker_id  uuid not null references public.profiles(id) on delete cascade,
    blocked_id  uuid not null references public.profiles(id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    constraint user_blocks_not_self_chk check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- -----------------------------------------------------------------------------
-- Reports of a person, a message or a Ping reply. Kept even if the message
-- or the reporter's account is later deleted, so a review can still happen.
-- -----------------------------------------------------------------------------
create table if not exists public.content_reports (
    id                uuid primary key default gen_random_uuid(),
    reporter_id       uuid references public.profiles(id) on delete set null,
    kind              text not null,
    reported_user_id  uuid references public.profiles(id) on delete set null,
    conversation_id   uuid,
    message_id        uuid,
    reason            text not null,
    details           text,
    excerpt           text,
    status            text not null default 'open',
    created_at        timestamptz not null default now(),
    constraint content_reports_kind_chk check (kind in ('user', 'message', 'assistant')),
    constraint content_reports_reason_chk check (reason in ('spam', 'abuse', 'inappropriate', 'false', 'other')),
    constraint content_reports_status_chk check (status in ('open', 'reviewed', 'dismissed')),
    constraint content_reports_details_len_chk check (details is null or char_length(details) <= 1000),
    constraint content_reports_excerpt_len_chk check (excerpt is null or char_length(excerpt) <= 2000)
);

create index if not exists content_reports_open_idx on public.content_reports (created_at desc) where status = 'open';

-- -----------------------------------------------------------------------------
-- Comments and suggestions sent from Perfil.
-- -----------------------------------------------------------------------------
create table if not exists public.app_feedback (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid references public.profiles(id) on delete set null,
    kind         text not null,
    message      text not null,
    app_version  text,
    platform     text,
    created_at   timestamptz not null default now(),
    constraint app_feedback_kind_chk check (kind in ('idea', 'problem', 'other')),
    constraint app_feedback_message_len_chk check (char_length(message) between 1 and 2000)
);

alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
alter table public.app_feedback enable row level security;

revoke all on public.user_blocks, public.content_reports, public.app_feedback from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Account deletion in one transaction. Erases what is only the person's own
-- (memory, Ping conversations, calendar links, address book, assistant
-- records, blocks) and blanks the profile. Messages and commitments shared
-- with other people stay for them, under "Cuenta eliminada". Photos in
-- Storage and the sign-in itself are removed by the backend afterwards.
-- -----------------------------------------------------------------------------
create or replace function public.delete_user_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_user is null then
        raise exception 'p_user is required';
    end if;

    delete from public.memory_records where owner_user_id = p_user;
    delete from public.ai_messages where user_id = p_user;
    delete from public.user_calendar_accounts where user_id = p_user;
    delete from public.contacts where owner_user_id = p_user;
    delete from public.message_reactions where user_id = p_user;
    delete from public.agent_initiatives where actor_user_id = p_user;
    delete from public.agent_conversation_turns where actor_user_id = p_user;
    delete from public.agent_execution_history_outbox where actor_user_id = p_user;
    delete from public.agent_executions where actor_user_id = p_user;
    delete from public.agent_authorizations where actor_user_id = p_user;
    delete from public.agent_turn_semantic_checkpoints where actor_user_id = p_user;
    delete from public.agent_dialogue_checkpoints where actor_user_id = p_user;
    delete from public.agent_turn_admissions where actor_user_id = p_user;
    delete from public.agent_turn_sequence_allocators where actor_user_id = p_user;
    delete from public.notification_delivery_ledger where owner_user_id = p_user;
    delete from public.user_blocks where blocker_id = p_user or blocked_id = p_user;

    update public.profiles
    set email = 'eliminada+' || p_user::text || '@cuenta.ping',
        full_name = 'Cuenta eliminada',
        phone = null,
        avatar_url = null,
        avatar_bucket = null,
        avatar_object_path = null,
        cover_bucket = null,
        cover_object_path = null,
        expo_push_token = null,
        last_seen = null,
        deleted_at = now()
    where id = p_user;
end;
$$;

revoke all on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;
