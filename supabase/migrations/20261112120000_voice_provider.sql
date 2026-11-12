-- Voz del asistente: which service speaks (Google or OpenAI) and which Google
-- voice, chosen from the admin panel. Only the server reads it.

alter table public.app_settings
    add column if not exists voice_provider text not null default 'gemini',
    add column if not exists gemini_voice text not null default 'Aoede';

alter table public.app_settings drop constraint if exists app_settings_voice_provider_chk;
alter table public.app_settings add constraint app_settings_voice_provider_chk
    check (voice_provider in ('gemini', 'openai'));

alter table public.app_settings drop constraint if exists app_settings_gemini_voice_chk;
alter table public.app_settings add constraint app_settings_gemini_voice_chk
    check (gemini_voice in ('Aoede', 'Sulafat', 'Kore', 'Leda', 'Despina', 'Achernar', 'Callirrhoe', 'Puck', 'Charon', 'Orus'));
