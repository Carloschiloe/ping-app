-- Mantiene despierto el servidor gratis de Render durante el día.
-- Supabase llama a /health cada 10 minutos entre las 7:00 y las 0:50
-- (hora de Chile en verano; en invierno queda de 6:00 a 23:50).
-- Son unas 540 horas al mes, dentro de las 750 gratis de Render.
-- De noche el servidor se duerme y se despierta solo a la mañana siguiente.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'vorian-keep-awake';

select cron.schedule(
  'vorian-keep-awake',
  '*/10 0-3,10-23 * * *',
  $$ select net.http_get('https://ping-app-con3.onrender.com/health', timeout_milliseconds := 60000) $$
);

-- Para quitarlo más adelante (por ejemplo al pasar al plan pagado):
-- select cron.unschedule(jobid) from cron.job where jobname = 'vorian-keep-awake';
