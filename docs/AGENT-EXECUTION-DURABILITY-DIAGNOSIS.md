# Durabilidad de ejecuciones de IA: diagnóstico y propuesta mínima

Fecha: 2026-10-18

## Diagnóstico

`backend/src/services/agentExecution.service.ts` y la migración
`supabase/migrations/20260908010000_agent_authorization_execution.sql` ya
protegen dos invariantes importantes:

- `(authorization_id, step_id)` es único y el claim es atómico.
- Una fila existente en `running` nunca vuelve a invocar el executor; se
  devuelve como bloqueada/en curso. Sólo `failed_retryable` puede reclamarse
  actualmente.

Eso evita el doble efecto por concurrencia, pero no resuelve el crash entre
`claim_agent_execution_step` y `complete_agent_execution_step`: la fila puede
quedar en `running` indefinidamente.

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
reapropiación incompleta.

## Decisión de alcance

No se implementa una migración de lease todavía. Requiere una decisión de
esquema y de contrato de efectos, no sólo una columna nueva. Se mantienen el
claim conservador y el fail-closed para estados desconocidos.

## Propuesta concreta para el siguiente bloque

Implementar una migración aditiva, sin reescribir `agent_executions`:

1. Añadir `lease_token uuid`, `lease_expires_at timestamptz` y
   `heartbeat_at timestamptz`; indexar estados `running` por vencimiento.
2. Hacer que el claim devuelva un token nuevo para cada intento y que el
   completion/heartbeat exijan ese token mediante actualización condicional.
3. Añadir un RPC de reconciliación que, ante un lease vencido, marque el
   intento como `blocked` con una razón explícita de resultado desconocido.
   No debe convertirlo automáticamente en `failed_retryable`.
4. Antes de permitir reintento automático, dar a cada writer de dominio un
   contrato idempotente con la misma clave durable, o un fencing token que el
   writer valide atómicamente. La clave de `agent_executions` por sí sola no
   puede proteger mutaciones que no la reciben.
5. Mantener compatibilidad durante el despliegue: primero introducir columnas
   y RPCs aditivos; después adaptar el servicio; finalmente activar la
   reconciliación. No cambiar la firma existente de los RPCs sin una ventana
   de compatibilidad.

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

La prueba contractual añadida en
`backend/tests/agentExecutionDurability.contract.test.ts` protege las
garantías que no deben degradarse mientras se diseña la migración.
