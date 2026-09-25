# M-7 Semantic V4 — High-Fidelity Core Shadow

Estado: implementado localmente sobre `f259882c3b5c5a2e68bb8710b9d24beb5ce81798`.
No hay cutover, push, deploy, OpenAI ni acceso a Supabase ejecutado por esta
tarea.

## Boundary

```text
Semantic V4 -> V4/V2 adapter -> canonical read-only resolution
             -> temporal Core -> read query planner -> disposition
             -> structural plan shape
```

El resultado sigue siendo únicamente observacional. El camino legacy continúa
siendo dueño de routing, respuesta, autorización durable, ejecución y estado.

## Dependencias auditadas

| Dependencia | Clasificación | Tratamiento shadow |
|---|---|---|
| `AgentPersonResolutionService` | READ_ONLY_SAFE | Reutilizado con invoker read-only; retrieval canónico diferido |
| `AgentReadTargetResolutionService` | READ_ONLY_SAFE | Reutilizado; authorizer de conversación diferido |
| `AgentReadQueryPlanner` | READ_ONLY_SAFE | Reutilizado para validar forma de consulta |
| `resolveTemporal` | READ_ONLY_SAFE | Reutilizado; no cambia instantes ni zona horaria |
| `AgentTurnDispositionService` | READ_ONLY_SAFE | Reutilizado sin mutar el snapshot |
| `retrieve*` / `resolvePerson` | READ_ONLY_SAFE | Sólo a través de `HighFidelityReadOnlyRepository` |
| `AgentContextBuilder` | MIXED_READ_WRITE | No se reutiliza como intérprete/resolver V4 |
| `AgentDialogueContinuationService` | MIXED_READ_WRITE | No se invoca; se usa snapshot y disposition puro |
| `AgentReadFollowupReferentService` | MIXED_READ_WRITE | No se invoca; referentes estructurados |
| `AgentDialogueStateService` | WRITE_CAPABLE | No se invoca; snapshot clonado |
| planner/authorization/writers/tools/memory | WRITE_CAPABLE / EXTERNAL_SIDE_EFFECT | Prohibidos en esta frontera |

## Garantías

- El repositorio high-fidelity sólo expone lecturas autorizadas.
- V4 entrega hints/slots; ningún ID del modelo se acepta como identidad.
- Personas, compromisos, propuestas y mensajes mantienen tipos distintos.
- Un resultado enfocado puede ser `resolved`, `ambiguous` o `zero_match`;
  un conjunto conserva `result_set`; una búsqueda sin evidencia conserva
  `scopeKind=empty_scope` sin inventar entidad.
- La continuidad usa un referente estructurado reautorizado, no una nueva
  inferencia por título ni concatenación de texto.
- La preparación nunca ejecuta writers, tools, memoria, mensajes ni RPCs de
  mutación.
- La activación está limitada a local/staging y bloqueada en producción.

## Evidencia local

- `m7SemanticV4HighFidelityShadow.test.ts`: 8 grupos, 20 tests PASS; cubre
  personas únicas/ambiguas/inexistentes, autorización de compromisos,
  propuestas, mensajes, referentes, scope vacío, slots y barrera anti-write.
- `m7SemanticV4CoreShadow.test.ts`: PASS.
- `m7SemanticV4CoreShadowContinuity.test.ts`: 10 casos / 16 turnos PASS a
  través del resolver high-fidelity, disposition y preparación estructural.
- TypeScript directo (`node node_modules/typescript/bin/tsc --noEmit`): PASS.
- OpenAI calls: 0. Writers, tools y persistencia: 0.

## Límites explícitos

Esta fase no cambia el runtime visible ni certifica la base de datos real. La
prueba con datos reales queda para un entorno local/staging autorizado con la
bandera shadow activa; producción permanece bloqueada.
