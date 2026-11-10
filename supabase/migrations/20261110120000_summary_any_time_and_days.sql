-- El resumen de Vorian a cualquier hora y minuto, y solo los días que cada
-- persona elija (0 = domingo … 6 = sábado). Por defecto: todos los días a la
-- misma hora de antes. Se puede repetir sin problema.
-- Para deshacer: borrar las dos columnas nuevas y volver a poner el límite de 5 a 11.

alter table public.profiles
    add column if not exists assistant_summary_minute smallint not null default 0,
    add column if not exists assistant_summary_days smallint[] not null default '{0,1,2,3,4,5,6}';

alter table public.profiles drop constraint if exists profiles_assistant_summary_hour_check;
alter table public.profiles
    add constraint profiles_assistant_summary_hour_check check (assistant_summary_hour between 0 and 23);

alter table public.profiles drop constraint if exists profiles_assistant_summary_minute_check;
alter table public.profiles
    add constraint profiles_assistant_summary_minute_check check (assistant_summary_minute between 0 and 59);

alter table public.profiles drop constraint if exists profiles_assistant_summary_days_check;
alter table public.profiles
    add constraint profiles_assistant_summary_days_check
    check (assistant_summary_days <@ array[0,1,2,3,4,5,6]::smallint[]);

grant update (assistant_summary_minute, assistant_summary_days) on table public.profiles to authenticated;
