# M-7 Ledger: mapa de no determinismo

Este mapa pertenece al harness de certificación y no cambia el runtime de
Ping. Cada entrada debe clasificarse antes de una captura ledger real.

| Dependencia | Uso en la prueba | Clasificación | Regla de captura/replay |
| --- | --- | --- | --- |
| Semantic V4 provider output | Interpreta cada utterance | `PERSIST_REQUIRED` | Persistir respuesta cruda, hash, diagnóstico, modelo, finish reason y salida normalizada antes de Core. Replay no llama proveedor. |
| Legacy semantic interpretation | Ruta legacy y comparación de Core | `PERSIST_REQUIRED` | Persistir interpretación raw/normalizada, route, objective y fallback. Si no está capturada, el ledger no es replayable. |
| `LlmObjectiveInterpreter` | Puede resolver objetivo durante una aclaración | `PERSIST_REQUIRED` + `MOCK_REQUIRED` en replay | Capturar input/output antes de evaluar la transición. Replay inyecta el output capturado; una llamada no registrada es fallo. |
| Otras llamadas LLM | Enriquecimiento de objetivos/mensajes | `PERSIST_REQUIRED` | Enumerar cada request y su output; el runner debe contar y abortar cualquier llamada no registrada. |
| Reloj (`now`) | TTL, secuencias, fechas y planes | `DETERMINISTIC` | Fijar instante por conversación/turno y persistirlo en el envelope. No usar reloj real en replay. |
| Zona horaria/locale | Fechas y renderizado | `DETERMINISTIC` | Persistir `timezone` y `locale`; replay usa exactamente esos valores. |
| UUID/random | IDs de plan/trace | `DISABLE_REQUIRED` | No comparar IDs efímeros; usar IDs semilla para fixtures o proyectar sólo campos canónicos. Nunca generar IDs que afecten ledger. |
| Repository seed | Resolución y autorización | `PERSIST_REQUIRED` | Persistir filas autorizadas relevantes o usar repositorio in-memory congelado. No Supabase. |
| Dialogue initial state | Continuidad y versionado | `PERSIST_REQUIRED` | Guardar estado anterior y reiniciar explícitamente cada conversación. |
| Feature flags/config | Activa rutas V4/shadow | `DETERMINISTIC` | Persistir fingerprint y flags; validar antes de capture/replay. |
| Referencia temporal | Interpretación de hoy/mañana/fechas | `DETERMINISTIC` | Persistir `turnReferenceInstant`, locale y timezone por turno. |
| Resolver inputs/outputs | Identidad canónica y evidencia | `PERSIST_REQUIRED` | Capturar entradas relevantes, resultado, cardinalidad y canonical IDs autorizados. Replay sólo resolver read-only fixture. |
| Fallbacks | Cambian semántica cuando falla un proveedor | `PERSIST_REQUIRED` | Registrar motivo exacto; fallback no se cuenta como output LLM. Replay falla ante fallback no registrado. |
| Writers/tools/persistencia | Efectos externos | `DISABLE_REQUIRED` | Repositorio read-only, tools bloqueadas, contadores en cero; cualquier llamada aborta. |
| Supabase/Auth/red externa | Datos/permisos remotos | `DISABLE_REQUIRED` | No cargar `.env` ni tocar red durante replay; autorización se prueba con fixture canónico. |

## Contrato mínimo de captura

Cada turno debe guardar explícitamente todos los campos del envelope, usando
`NOT_USED` cuando una capa no participa. La escritura debe completarse y
verificarse antes de evaluar Core. El envelope posterior incluye el estado
antes/después, disposición, plan y objetivo vigente.

## Regla de replay

Replay sólo puede consumir el envelope y fixtures deterministas. Si intenta
consultar un proveedor, red, reloj no fijado, Supabase, writer, tool o una
salida no persistida, debe fallar con
`UNRECORDED_NONDETERMINISM=<source>`; nunca debe degradar silenciosamente a
fallback.
