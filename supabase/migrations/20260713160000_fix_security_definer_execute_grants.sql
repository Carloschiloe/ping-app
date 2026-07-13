-- =============================================================================
-- Ping — Corrección: privilegios EXECUTE excesivos en funciones SECURITY DEFINER
-- =============================================================================
-- Causa: al crear una función con CREATE FUNCTION, PostgreSQL concede EXECUTE
-- a PUBLIC por defecto salvo que se revoque explícitamente. El baseline
-- (20260712000000_baseline_v2.sql) no incluyó ningún REVOKE/GRANT, por lo que
-- las tres funciones SECURITY DEFINER quedaron ejecutables por el rol `anon`
-- (usuarios sin sesión) al aplicarse contra Ping Staging V2. Confirmado por
-- consulta real contra la base (has_function_privilege('anon', ..., 'EXECUTE')
-- = true para las tres).
--
-- Impacto real:
--   - is_conversation_participant(uuid, uuid) y shares_conversation_with(uuid)
--     son funciones LANGUAGE SQL invocables directamente. Con anon pudiendo
--     ejecutarlas, cualquier llamada no autenticada podía preguntar "¿este
--     user_id participa en esta conversation_id?" y obtener un booleano —
--     una fuga de información menor pero real (no expone filas, pero sí
--     confirma pertenencia) que no debería estar disponible sin sesión.
--   - handle_new_user() es una función RETURNS TRIGGER; Postgres no permite
--     invocarla directamente vía SELECT (solo el motor de triggers puede
--     hacerlo), por lo que el riesgo práctico es bajo, pero se cierra el
--     privilegio igualmente por higiene y defensa en profundidad.
--
-- Corrección: revocar EXECUTE de PUBLIC (y explícitamente de anon, aunque ya
-- queda cubierto por la revocación de PUBLIC) y conceder EXECUTE únicamente a
-- `authenticated`, que es el único rol que necesita invocarlas — tanto de
-- forma directa como, sobre todo, indirecta desde las políticas RLS que las
-- usan en su condición USING/WITH CHECK (evaluadas con los privilegios del
-- rol que ejecuta la consulta).
--
-- No se modifica el baseline ya aplicado; esta es una migración nueva y
-- separada, consistente con la política de "nunca reescribir en silencio una
-- migración ya aplicada" documentada en supabase/migrations/README.md.

revoke execute on function public.is_conversation_participant(uuid, uuid) from public;
revoke execute on function public.is_conversation_participant(uuid, uuid) from anon;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

revoke execute on function public.shares_conversation_with(uuid) from public;
revoke execute on function public.shares_conversation_with(uuid) from anon;
grant execute on function public.shares_conversation_with(uuid) to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
-- Sin GRANT a nadie: handle_new_user() solo debe ejecutarse vía el trigger
-- on_auth_user_created (auth.users), que la invoca con los privilegios del
-- propietario de la función (SECURITY DEFINER), no como una llamada directa
-- de ningún rol de aplicación.

-- =============================================================================
-- Verificación (ejecutar manualmente tras aplicar, no forma parte del DDL):
--
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
-- from pg_proc p
-- join pg_namespace n on p.pronamespace = n.oid
-- where n.nspname = 'public' and p.prosecdef = true
-- order by p.proname;
--
-- Resultado esperado: anon_can_execute = false en las tres filas;
-- authenticated_can_execute = true para is_conversation_participant y
-- shares_conversation_with, false para handle_new_user.
-- =============================================================================
