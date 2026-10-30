# Ping — Auditoría general 2026-10-29 (seguimiento)

Rama: `claude/audit-remediation-20261029` (desde `origin/main` = `85de657`, el mismo commit que reporta producción en `/api/health`).
Producción no fue modificada. Ninguna migración fue aplicada en remoto.

## Método

Cinco auditores independientes, todos de solo lectura: seguridad, datos/idempotencia, voz en tiempo real, IA/costos y mobile/Expo Go/DevOps.
Cada hallazgo P0/P1 que se corrigió fue reverificado por el director contra el código. Las pruebas nuevas se comprobaron en ambos sentidos: **fallan sin la corrección y pasan con ella**.

Línea base antes de los cambios:
- Backend: 184 archivos, 2702 tests OK, 4 suites de integración excluidas como en CI.
- Mobile: 55 archivos, 890 tests OK; `tsc` limpio; lint con 0 errores y 95 warnings.

## Corregido en esta rama

| Prio | Hallazgo | Corrección | Evidencia |
|---|---|---|---|
| P0 | **Voz:** confirmar por voz ("Crear"/"sí") nunca ejecutaba nada. `/agent/turn` sólo devuelve `plan` con `confirmationState:'received'`; el cliente WebView no llamaba `/agent/authorize` ni `/agent/execute`, y Ping leía en voz alta el efecto futuro ("Se creará…"). `runCanonicalAgentTurn` no tiene llamadores desde `075940d`. | El cliente de voz (`m8LiveVoiceClient.service.ts`) autoriza el digest exacto y ejecuta, con el mismo contrato que el cliente de texto. Sólo dice "Listo" si la ejecución vuelve `done` con pasos `verified`. Cada fallo tiene un mensaje honesto. | `tests/m8LiveVoiceConfirmedExecution.test.ts` (4 tests) |
| P0 | **Duplicados:** un segundo "sí" al mismo plan (doble toque, reintento por timeout, voz y texto a la vez) creaba una autorización nueva y volvía a ejecutar: segundo compromiso o segundo mensaje. | `executeAuthorization` usa como identidad el **turno que produjo el plan** (`sourceTurnKey`). Si ese turno ya tiene una ejecución con el mismo digest bajo otra autorización, hace replay de esa ejecución en vez de escribir de nuevo. Una repetición deliberada es un turno nuevo y sí se ejecuta. La voz conserva el turn key del plan ejecutado para que un "sí" repetido quede ligado a él. | `tests/agentExecutionSourceTurnReplay.test.ts` (3) y test de doble confirmación en `m8LiveVoiceConfirmedExecution.test.ts` |
| P1 | **Voz:** el modelo Realtime podía confirmar con su propio argumento de herramienta (`provider_tool_input_fallback`) en vez de la transcripción del usuario. | Una confirmación sólo se ejecuta si la entrada vino de la transcripción final del usuario. | Mismo archivo de test |
| P0 | **IA:** escrituras con un orden de palabras natural se enrutaban como lectura y se perdían. Por ejemplo: "mañana tengo que llamar a Marcelo a las diez", "el viernes debo pagar la luz", "no olvides que mañana llamo a Marcelo". | El fast path determinista de lectura rechaza frases que llevan hora, fecha o persona y no tienen forma de pregunta: es una frontera gramatical, no una lista de frases. Las lecturas sin forma de pregunta siguen funcionando por la vía del modelo. | `tests/agentSemanticInterpreter.fastPath.test.ts` (9 casos nuevos) |
| P1 | **Seguridad:** el backend firmaba con service-role cualquier `media_object_path`/`avatar_object_path` guardado en la fila, aunque perteneciera a otra conversación. | Toda referencia firmada debe estar bajo el prefijo de su recurso dueño. Se verificó en el historial que todos los paths generados desde el origen cumplen ese formato. | `tests/privateFileService.test.ts` (2 tests nuevos) |
| P1 | **Seguridad (BD):** `authenticated` puede insertar, editar y borrar en `messages` por PostgREST (política legacy `messages_insert_own`) y editar cualquier columna de `profiles` (email, phone, avatar_*, push token). | Migración `20261029230000_restrict_client_message_profile_writes.sql`: revoca esos permisos y deja en `profiles` sólo las columnas que la app escribe (privacidad, presencia, locale). | La cadena de 48 migraciones aplica desde cero en Postgres 16 local. La aserción `tests/postgres/clientWritePrivileges.integration.sql` falla sin la migración y pasa con ella. |

### Revisión independiente (auditor QA, no implementador)

- Voz, ownership de paths y migración: **correctos**. Se verificó lo siguiente:
  - Escapes del script generado.
  - Que los schemas de authorize y execute aceptan el cuerpo del cliente.
  - CSP `connect-src 'self'`.
  - Que el binding de historial (`sourceTurnKey` = Idempotency-Key del turno del plan) coincide con lo que exige `claim_agent_authorization_for_execution_with_history`.
- **Rechazado y rehecho:** la primera versión del arreglo de duplicados reutilizaba autorizaciones consumidas por digest. Como el digest depende sólo del contenido, una repetición deliberada (mismo mensaje dos veces, o reprogramar A→B→A) se convertía en un falso éxito. El diseño actual liga el replay al turno del plan.
- **Ajustado:** el fast path aceptaba frases que contenían "?" en cualquier posición; ahora sólo cuenta un "¿" inicial.
- **Residual conocido:**
  - "¿Me recuerdas llamar a Marcelo mañana?" se clasifica como `recall` y va por la vía de lectura. Es previo a esta rama y ambiguo por naturaleza ("¿te acuerdas?" frente a "recuérdame").
  - Las lecturas sin forma de pregunta que llevan hora o persona ("compromisos de mañana") ahora pasan por el modelo. Es costo y latencia, no un error.
- **Residual de duplicados:**
  - Dos confirmaciones *simultáneas* del mismo turno todavía pueden ganar ambas la carrera, porque falta una restricción única en BD. Requiere migración.
  - Sin `conversationId` no hay binding de turno.

## Requiere decisión o acción del propietario

1. **Aplicar la migración `20261029230000` en producción** (`wbigqhtuzfmpnxservlf`).
   - No pude verificar los permisos reales: el conector Supabase de esta sesión no ve ese proyecto.
   - Comprobación previa sugerida:
     `select has_table_privilege('authenticated','public.messages','INSERT'), has_column_privilege('authenticated','public.profiles','avatar_object_path','UPDATE');`
2. **Recordatorios:** no se entregan en producción, porque `RUN_CRON_JOBS=false` y `ENABLE_AUTOMATIONS=false`, y el fallback local `scheduleCommitmentReminder` no tiene llamadores.
   - Encender el cron en el plan free (instancia que duerme) perdería avisos: la ventana es de un solo minuto, sin catch-up.
   - Opciones: (a) Render Cron Job o pg_cron más una ventana de catch-up; (b) recordatorios locales en el dispositivo como fallback. Tiene costo y afecta infraestructura.
3. **Canales Realtime públicos** (llamadas y presencia):
   - Hoy se pueden falsificar llamadas entrantes y espiar presencia con la anon key.
   - Requiere activar canales privados en el proyecto (ajuste del dashboard) y políticas sobre `realtime.messages`.
4. **Signup:** confirmar si producción tiene la confirmación de email desactivada (`supabase/config.toml` es sólo local). Si es así, cuentas desechables multiplican los límites de voz y LLM, que son por usuario.
5. **Render plan free:** los cold starts de 30–60 s superan los timeouts del cliente (15 s en CRUD). El riesgo es el patrón "no se guardó" → reintento → duplicado.
6. **Deploy:** `autoDeployTrigger: commit` despliega aunque CI falle. Recomendado: `checksPass` y branch protection en `main`.
7. **Credenciales por defecto** en `backend/test_notify_endpoint.js` (`TEST_PASS || 'test1234'`). Rotar la contraseña de esa cuenta si alguna vez fue real.

## Pendiente técnico (siguiente iteración, sin decisión externa)

- **Voz:**
  - Barge-in mientras todavía suena el audio: hoy no se envía `output_audio_buffer.clear` ni `conversation.item.truncate`.
  - Doble `response.cancel`: el comportamiento del proveedor está sin verificar.
  - Turno huérfano: una transcripción vieja puede llegar al Core.
  - El habla durante "pensando" se descarta.
  - Falta timeout de inactividad y duración máxima de sesión (costo).
  - El JWT no se refresca en sesiones de más de 1 h.
  - La telemetría excede su propio rate limit tras unos 7 turnos.
- **IA:**
  - "sí" hace una llamada LLM idéntica duplicada.
  - "a las diez" hace hasta 4 llamadas antes de la ruta determinista.
  - Los timeouts no abortan las requests; el SDK sigue con `maxRetries` 2.
  - No hay `reasoning_effort`.
  - No hay contabilidad ni presupuesto de tokens por usuario.
  - Modelos hard-codeados en varios archivos.
- **Datos:**
  - `create_commitment` no propaga la idempotency key al dominio: un retry de `failed_retryable` puede duplicar.
  - Pasos `running` sin lease.
  - `authorize` concurrente sin índice único parcial.
  - Timeouts de 15 s en authorize/execute.
- **Mobile:**
  - `Alert.prompt` no funciona en Android (rechazar tarea, crear contacto).
  - Hoy y Compromisos no tienen estado de error.
  - Strings técnicos en inglés llegan a las alertas.
  - Faltan `accessibilityLabel` en botones de ícono.
- **DevOps:**
  - CI usa Node 20 y Render usa 22.14.0.
  - `/api/health` es público, sin rate limit, consulta la BD y expone diagnósticos internos.
  - OTA con `runtimeVersion: appVersion` y versión fija `1.0.3`.

## No verificado (falta acceso, hardware o credenciales)

- Ningún cambio de esta rama se probó en un dispositivo físico ni en Expo Go real. La voz confirmada exige una certificación física en iPhone antes de darse por terminada.
- Permisos y políticas reales en producción.
- Configuración real de Auth, Realtime y variables de Render.
- Comportamiento del proveedor Realtime ante un doble cancel y facturación en silencio.
