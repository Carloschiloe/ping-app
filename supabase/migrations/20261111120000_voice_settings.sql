-- Voz del asistente: which OpenAI voice speaks and how fast, chosen from the
-- admin panel. Only the server reads it.

alter table public.app_settings
    add column if not exists voice_name text not null default 'cedar',
    add column if not exists voice_speed numeric(3,2) not null default 1.00;

alter table public.app_settings drop constraint if exists app_settings_voice_name_chk;
alter table public.app_settings add constraint app_settings_voice_name_chk
    check (voice_name in ('cedar', 'marin', 'ash', 'ballad', 'coral', 'sage', 'verse', 'alloy', 'echo', 'shimmer'));

alter table public.app_settings drop constraint if exists app_settings_voice_speed_chk;
alter table public.app_settings add constraint app_settings_voice_speed_chk
    check (voice_speed between 0.80 and 1.20);
