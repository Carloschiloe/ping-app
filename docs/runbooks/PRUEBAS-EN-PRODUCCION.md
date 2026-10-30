# Pruebas manuales contra producción

Ping tiene un solo entorno: producción (Supabase `wbigqhtuzfmpnxservlf`,
Render `ping-app-con3`). No hay staging. Las pruebas automatizadas que crean
usuarios o datos corren sólo contra un Supabase/Postgres local desechable
(`e2e-commitment-core-local.mjs` rechaza cualquier URL que no sea
`localhost`). Las pruebas manuales en el teléfono (Expo Go) usan producción con
estas reglas.

## Reglas

1. **Tu propia cuenta.** No uses cuentas de otras personas ni crees
   compromisos asignados a terceros: una asignación notifica a esa persona.
2. **Marca cada registro.** Todo compromiso de prueba lleva la palabra
   `prueba` en el título (por ejemplo "llamar a prueba Ping"). La voz puede
   transcribir "prueba bingo" o "prueba Pink"; basta con que aparezca
   `prueba`.
3. **Anota la hora de inicio** (UTC, ISO 8601) antes de empezar. La limpieza
   sólo toca registros creados después de esa hora.
4. **No crees más de lo necesario.** Cada escenario debe dejar el mínimo de
   compromisos para demostrar el comportamiento.
5. **Limpia al terminar** cancelando, nunca borrando.

## Limpieza

Desde `backend/`, con el `.env` de producción:

```bash
node scripts/prod-test-cleanup.mjs <tu-email> <hora-de-inicio-ISO>
```

Sólo lista: compromisos tuyos, creados después de esa hora, con `prueba` en el
título y todavía abiertos (`proposed`, `accepted`, `counter_proposal`). Revisa
la lista. Si es correcta:

```bash
node scripts/prod-test-cleanup.mjs <tu-email> <hora-de-inicio-ISO> --apply
```

Cancela cada uno con la transición canónica (`cancelCommitment`), así quedan
registrados el evento de cancelación, el mensaje de sistema en el chat y la
memoria del compromiso. Nada se borra: un compromiso cancelado se puede
reabrir desde la app.

## Qué no limpia

Los turnos de conversación del agente (`agent_conversation_turns`,
`agent_turn_admissions`) son historial y auditoría; se conservan.
