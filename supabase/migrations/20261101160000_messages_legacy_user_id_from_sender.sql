-- Production keeps legacy NOT NULL public.messages columns that predate
-- versioned migrations: user_id (always equal to sender_id) and text (always
-- equal to content). The canonical write path (persist_message_with_attachment
-- and the other service-role RPCs) only sets sender_id and content, so every
-- new message failed with 23502. Keep the legacy columns mirrored.
--
-- Additive and idempotent; columns that do not exist are left alone.
-- Rollback: drop trigger trg_messages_legacy_user_id on public.messages;
--           drop function public.messages_legacy_user_id_from_sender();

do $$
declare
    v_has_user_id boolean;
    v_has_text boolean;
begin
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'messages' and column_name = 'user_id'),
           exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'messages' and column_name = 'text')
      into v_has_user_id, v_has_text;
    if not v_has_user_id and not v_has_text then
        return;
    end if;

    execute format($fn$
        create or replace function public.messages_legacy_user_id_from_sender()
        returns trigger
        language plpgsql
        set search_path = public
        as $body$
        begin
            %s
            %s
            return new;
        end;
        $body$;
    $fn$,
        case when v_has_user_id then 'new.user_id := coalesce(new.sender_id, new.user_id);' else '' end,
        case when v_has_text then 'new.text := coalesce(new.content, '''');' else '' end);

    execute 'drop trigger if exists trg_messages_legacy_user_id on public.messages';
    execute 'create trigger trg_messages_legacy_user_id before insert or update of content, sender_id on public.messages
             for each row execute function public.messages_legacy_user_id_from_sender()';
end
$$;
