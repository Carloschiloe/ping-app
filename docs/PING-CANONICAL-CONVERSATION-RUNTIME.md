# Ping canonical conversation runtime

Estado de diseño/implementación: 2026-10-04. Este documento describe el
límite permanente que comparten texto y voz; no es un log de pruebas.

> El entorno operativo vigente es producción. Las menciones históricas a
> staging o a `PING_M7_DATABASE_URL` se conservan sólo para explicar gates de
> certificación antiguos y no deben configurarse en producción.

## Fuente de verdad

`POST /api/agent/turn` es la entrada del runtime conversacional. La frontera
durable admite el turno con su `Idempotency-Key`, recupera el checkpoint por
actor y scope, ejecuta el Core y persiste atómicamente el resultado y el estado
de diálogo. `PING_M7_DATABASE_URL` queda documentada únicamente como variable
histórica de certificación y no forma parte de la configuración de producción.

El scope sin `conversationId` es `agent:mobile` tanto para `mobile_text` como
para `mobile_voice`. Así una corrección o confirmación no cambia de contexto al
cambiar de modalidad.

Una confirmación semántica que el Core devuelve como `plan` con
`confirmationState: received` continúa dentro del mismo runtime servidor:

`Core plan → authorizePlan → executeAuthorization → resultado verificado`

El runtime nunca presenta éxito salvo que la ejecución termine `done` y todos
los pasos ejecutados estén `succeeded` y `verified`. La autorización sigue
ligada a `planDigest` y a los `stepIds` del plan canónico.

## Adaptadores

- Texto envía turnos al mismo `/agent/turn`; la UI sólo renderiza el resultado.
- Voice conserva únicamente WebRTC, micrófono, VAD, reproducción, reconexión,
  correlación de turnos y presentación del `core_presentation`.
- Voice ya no mantiene `pendingPlan`, ni llama directamente a
  `/agent/authorize` o `/agent/execute`. Envía `channel: mobile_voice` y una
  clave idempotente estable para cada turno.
- Realtime sólo transcribe/selecciona el tool y verbaliza el texto autorizado
  por Core; el audio sigue bloqueado hasta recibir ese resultado.

## Deuda clasificada

- `AgentPreviewScreen` conserva componentes visuales y contratos de ejecución
  para la compatibilidad del flujo text UI histórico; la confirmación se
  resuelve en el runtime servidor y no vuelve a ejecutar el plan desde el
  cliente.
- `/agent/respond`, `/agent/plan` y el fallback no durable son superficies
  legacy/compatibilidad. No son usados por el nuevo flujo durable.
- Las validaciones deterministas de seguridad, digest, idempotencia,
  autorización y ejecución son invariantes legítimas; no son comprensión de
  lenguaje y no se eliminan.

## Invariantes

1. No hay escritura sin confirmación válida y plan vigente.
2. Un digest corregido o invalidado no puede autorizarse después.
3. Repetir la misma clave de turno devuelve el replay durable.
4. Ningún canal decide semántica, autorización o ejecución.
5. Ningún proveedor puede hablar antes de que Core entregue la presentación.
6. La activación productiva requiere pasar el release gate y verificar el
   destino/commit exactos; ninguna referencia histórica de staging la activa.
