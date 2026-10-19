# Durabilidad de ejecuciones de IA: diagnóstico y plan de migración

Fecha de auditoría: 2026-10-19

Alcance de esta revisión: `agentExecution.service.ts`, los ocho executors
registrados, los RPC de `agent_executions` y las pruebas contractuales/
integración existentes. No se modificó producción, no se añadió una migración
y no se cambió el código de ejecución.

## Diagnóstico

`backend/src/services/agentExecution.service.ts` y la migración
`supabase/migrations/20260908010000_agent_authorization_execution.sql` protegen
estas invariantes:

- `(authorization_id, step_id)` es único y el claim es atómico.
- Una fila existente en `running` nunca vuelve a invocar el executor; se
  devuelve como bloqueada/en curso. Sólo `failed_retryable` puede reclamarse
  actualmente.

Eso evita el doble efecto por concurrencia dentro de la misma fila de
ejecución, pero no resuelve el crash entre `claim_agent_execution_step` y
`complete_agent_execution_step`: la fila puede quedar en `running`
indefinidamente.

El comportamiento actual es deliberadamente fail-closed: una fila existente
en `running` no se vuelve a ejecutar y se publica como bloqueada/en curso; un
estado persistido desconocido también se bloquea con
`execution_state_unknown`. Sólo `failed_retryable` es reclamable.

No es seguro solucionar esto únicamente cambiando el claim para que cualquier
`running` antiguo vuelva a `failed_retryable`. Hay una ventana de resultado
desconocido: el proceso original pudo haber ejecutado el efecto y haberse
caído antes de persistir la finalización. En el estado actual, los ejecutores
no comparten un mecanismo de fencing durable:

- `send_message` sí propaga `idempotencyKey` al RPC canónico del mensaje.
- `remember_fact` usa esa clave como identidad de evidencia.
- `create_commitment`, `respond_to_proposal`, `complete_commitment`,
  `cancel_commitment`, `edit_commitment` y `reschedule_commitment` no reciben
  una clave de intento durable en sus límites canónicos actuales.

Por tanto, reapropiar automáticamente un lease expirado podría duplicar una
mutación de negocio. El cambio seguro en este bloque es no introducir esa
reapropiación incompleta ni convertir `running` en `failed_retryable`.

## Inventario auditado de writers

| Writer | Identidad durable que llega al writer | Resultado si el proceso cae después del efecto |
| --- | --- | --- |
| `send_message` | Sí: `agent_executions.idempotency_key` llega como `clientMessageId` | Reintento protegido por la idempotencia del mensaje |
| `remember_fact` | Parcialmente sí: la clave se usa como `sourceId`/evidencia | Reintento protegido por la deduplicación canónica de memoria, sujeto a la evidencia existente |
| `create_commitment` | No | Resultado desconocido; repetir puede crear otro compromiso/propuesta |
| `respond_to_proposal` | No | Resultado desconocido; repetir puede aplicar otra transición o producir una carrera |
| `reschedule_commitment` | No | Resultado desconocido; repetir puede duplicar propuesta/transición |
| `complete_commitment` | No | Resultado desconocido; no hay fencing del intento en la mutación |
| `cancel_commitment` | No | Resultado desconocido; la transición no valida una clave de intento |
| `edit_commitment` | No | Resultado desconocido; el update canónico no está ligado al intento |

La columna `idempotency_key` de `agent_executions` no basta por sí sola: una
clave que no se valida atómicamente en el writer de dominio no impide que un
segundo worker repita el efecto.

## Decisión de alcance de este bloque

No se implementa una migración de lease ni un cambio de servicio todavía.
Requiere una decisión de esquema y de contrato de efectos, no sólo una
columna nueva. Se mantienen el claim conservador y el fail-closed para
estados desconocidos. El diagnóstico anterior era correcto; esta auditoría
lo precisa con el inventario de writers y no encontró una mejora de runtime
segura dentro del alcance permitido.

Tampoco es seguro “arreglar” el problema cambiando sólo el mensaje o el
estado HTTP: eso podría ocultar un efecto aplicado, pero no recupera la
verdad durable del dominio.

## Plan de migración por slices

La migración debe ser aditiva, compatible y desplegarse en este orden. Cada
slice debe tener pruebas de concurrencia y rollback antes de activar el
siguiente.

### Slice 1 — contrato de intento y lease

1. Añadir `lease_token uuid`, `lease_expires_at timestamptz` y
   `heartbeat_at timestamptz`; indexar estados `running` por vencimiento.
2. Hacer que el claim devuelva un token nuevo para cada intento y que el
   completion/heartbeat exijan ese token mediante actualización condicional.

Durante este slice, un lease vencido sólo puede pasar a `blocked` con
resultado desconocido. No se habilita reintento automático.

### Slice 2 — reconciliación fail-closed

3. Añadir un RPC de reconciliación que, ante un lease vencido, marque el
   intento como `blocked` con una razón explícita de resultado desconocido.
   No debe convertirlo automáticamente en `failed_retryable`.

El RPC debe ser idempotente, conservar `result_ref`, trazabilidad y la fila
original, y no aceptar un completion tardío del token anterior.

### Slice 3 — fencing/idempotencia por writer

4. Antes de permitir reintento automático, dar a cada writer de dominio un
   contrato idempotente con la misma clave durable, o un fencing token que el
   writer valide atómicamente. La clave de `agent_executions` por sí sola no
   puede proteger mutaciones que no la reciben.

Orden recomendado: `create_commitment` y `respond_to_proposal`, luego
`reschedule`/`complete`/`cancel`/`edit`. `send_message` y `remember_fact`
deben conservar sus contratos ya existentes y demostrar compatibilidad con
el nuevo intento.

### Slice 4 — activación controlada

5. Mantener compatibilidad durante el despliegue: primero introducir columnas
   y RPCs aditivos; después adaptar el servicio; finalmente activar la
   reconciliación. No cambiar la firma existente de los RPCs sin una ventana
   de compatibilidad.

La activación debe ser por feature flag, inicialmente observacional, con
reconciliación manual y sin auto-retry. El auto-retry sólo se habilita para
writers que ya pasaron sus pruebas de fencing.

## Invariantes obligatorios de la futura migración

- Un token que no coincide nunca puede completar ni renovar un lease.
- Un intento vencido no puede ser reclamado por dos workers.
- Un completion tardío no puede convertir un resultado desconocido en éxito.
- La reconciliación no puede borrar `result_ref`, trazabilidad ni la fila
  original.
- Un retry sólo puede ocurrir después de demostrar idempotencia/fencing del
  writer concreto.
- Un paso `succeeded` o cualquier estado terminal no vuelve a `running`.
- El código antiguo que no conoce leases debe seguir pudiendo leer filas y no
  debe recibir una falsa señal de `is_new_attempt`.

## Criterios de pruebas antes de activar leases

- Dos claims concurrentes del mismo paso: exactamente un token nuevo y un
  único executor autorizado.
- Heartbeat con token correcto: actualiza el lease; token incorrecto,
  expirado o terminal: no cambia la fila.
- Completion tardío después de reconciliación: rechazado sin convertir el
  bloqueo en éxito.
- Reconciliación repetida: idempotente y sin borrar `result_ref`, auditoría ni
  trazabilidad.
- Crash simulado antes y después del writer: el resultado debe ser
  distinguible por la clave/fencing del writer, no por una suposición del
  worker.
- Retry de cada writer de compromiso: una sola mutación canónica y una sola
  auditoría.
- Compatibilidad: las filas históricas sin lease siguen siendo legibles y no
  se reclaman automáticamente.

## Evidencia revisada

- `agentExecution.service.ts`: claim, replay y fail-closed de estados
  desconocidos.
- `agentExecution.ts`: estados y taxonomía de fallos.
- `20260908010000_agent_authorization_execution.sql`: tabla, unicidad, claim,
  completion y reintento actual.
- `agentAuthorizationExecution.integration.sql`: concurrencia, replay,
  terminalidad y retry de `failed_retryable`.
- Executors de mensaje, memoria, compromisos y propuestas: cobertura desigual
  de idempotencia/fencing.

La auditoría focalizada encontró que los tests actuales prueban el claim
atómico, el replay, la terminalidad, el retry explícito de
`failed_retryable` y el fail-closed de estados desconocidos. No prueban —ni
podrían probar sin el nuevo esquema— la recuperación segura de un `running`
huérfano.

La prueba contractual en
`backend/tests/agentExecutionDurability.contract.test.ts` protege las
garantías que no deben degradarse mientras se diseña la migración. En esta
revisión se ejecutaron además las pruebas focalizadas de resultado y
durabilidad; ambas pasan.
