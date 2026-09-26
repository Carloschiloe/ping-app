# M-7 Semantic V4 — mapa ejecutable de `/agent/turn`

Estado: diagnóstico y shadow local; no es un cutover ni autoriza producción.

## Camino real

1. `agentTurn.controller.ts` valida la petición, obtiene el actor y delega en
   `runAgentTurn` o en la frontera durable.
2. `agentTurn.service.ts` resuelve el seguimiento de lectura heredado
   (`agentReadFollowupReferent`, `agentReadClarification`) y delega al Core.
3. `agentTurnCore.service.ts` resuelve el envelope y el scope de diálogo,
   atiende primero aclaraciones/confirmaciones/correcciones heredadas y luego
   llama a `interpretAgentSemanticTurn`.
4. `interpretAgentSemanticTurn` llama al intérprete de entrada Legacy LLM,
   aplica sus salvaguardas deterministas y, si la ruta es WRITE, llama al
   intérprete de objetivo Legacy.
5. El resultado Legacy se entrega a `buildAgentContext`. Ese contexto ejecuta
   retrieval autorizado, resuelve personas, alcance temporal, cardinalidad,
   procedencia y capability gaps.
6. En paralelo, mientras el shadow está habilitado sólo en local/staging y no
   en producción, `agentTurnCore` ejecuta `runSemanticV4Shadow` y
   `runSemanticV4CoreShadow`.
7. La decisión funcional todavía la toma `semantic.route` derivada de Legacy:
   READ pasa a `synthesizeAgentResponse`; WRITE pasa a
   `runWriteActionTurn` → `runAgentPlanning` → validación/digest/confirmación.
8. La autorización, identidad canónica, estado de diálogo y ejecución quedan
   en Core; el shadow no responde, no persiste y no ejecuta writers.

## Clasificación de dependencias

| Dependencia | Uso actual | Clase | Cobertura V4 / dueño futuro | Bloqueo de cutover |
|---|---|---:|---|---|
| `agentInputInterpreter` | ruta READ/WRITE, forma de consulta, alcance y señales de lectura | A, con B en salvaguardas | V4 ya expresa `kind`, `readMeaning`, temporalidad y continuidad; Core debe conservar authz y retrieval | Sí: aún alimenta `buildAgentContext` y routing |
| `agentObjectiveInterpreter` | objetivo WRITE, slots, destinatario, título y contenido candidato | A, con B en normalización/validación | V4 expresa objetivo, slots y lifecycle; Planner/Core debe probar entidades y contenido | Sí: planner todavía recibe objetivo Legacy |
| `agentDialogueContinuation` | continuidad, reconciliación de slots, escapes y correcciones | A+B | V4 expresa `continuationLike`, `pendingSlotAnswer`, lifecycle y slots; estado/CAS/confirmación siguen en Core | Sí: clasificador Legacy sigue gobernando antes de V4 |
| `agentReadFollowupReferent` | seguimiento de un referente único con elegibilidad determinista | A+B | V4 + Core high-fidelity resolver pueden usar `priorReferent` reautorizado | Sí: `TARGETED_FIRST_READ` aún limita la captura |
| `TARGETED_FIRST_READ` | activa una captura especial de referente en wrapper | D/A | Debe reemplazarse por evidencia/cardenalidad canónica, no por otra regex | Sí: deuda lexical explícita |
| `agentContextBuilder` | retrieval, cardinalidad, temporalidad, procedencia, gaps | A+B | B permanece Core; las señales A deben llegar desde V4 | Parcial: mezcla interpretación Legacy con resolución Core |
| `agentPlanOrchestrator` | normaliza objetivo, resuelve entidades, valida plan, digest y autorización | B | No debe ser reemplazado por V4; consume una propuesta semántica | No, pero falta entrada V4 tipada |
| `agentTurnDisposition` | decide response/plan/clarification/continuation | B | dueño permanente del Core | No |
| `retrieval.service` y resolvers | datos, identidad, permisos, evidencia y procedencia | B | dueño permanente del Core | No |
| `agentResponseSynthesizer` | redacción de respuesta sobre contexto autorizado | C/B | requiere contrato estable de Core; no es intérprete de intención | No, pero aún depende del contexto Legacy |

## Cobertura actual y huecos

Comprobado localmente: V4 → adapter V2 → high-fidelity read-only resolver →
disposition → plan shape, con replay sin proveedor y sin side effects. La
evaluación de desarrollo de 12 casos pasó 12/12 y el smoke end-to-end pasó.

No comprobado todavía: que el camino HTTP completo pueda recibir V4 como
fuente semántica única, que todos los tipos de mensajes/personas/propuestas
sean comparables con datos reales autorizados, y que retirar Legacy no cambie
respuestas, confirmaciones, idempotencia o trazabilidad.

## Evidencia adicional: frontera real aislada

La prueba `m7SemanticV4RealAgentTurnPath.test.ts` invoca el servicio real
`runAgentTurn` con un `SemanticTurnV4` precomputado. El valor sólo puede llegar
por un seam interno de certificación; no está expuesto al body HTTP. Así se
evita una segunda llamada al proveedor sin cambiar la autoridad Legacy.

Pasaron las rutas aisladas: READ de compromiso único, result-set, empty scope,
ambigüedad, persona y mensaje (6/6); WRITE hasta
`ready_for_authorization` (1/1); y continuidad de dos turnos con el mismo
`AgentDialogueStateService` (1/1). Todos terminaron sin `shadow_failure`, con
tools 0, persistence 0 y sin autorización/ejecución.

El test usa retrieval/memory y repositorio high-fidelity sintéticos. El mock
de Supabase es exclusivo del proceso de test para impedir que la importación
de sesiones/auth cargue credenciales ausentes; no sustituye código productivo.

Esto no certifica todavía el HTTP autenticado con V4 como fuente única, datos
Supabase reales autorizados, WRITE multivuelta completo ni un cutover. Legacy
sigue gobernando routing, contexto, planning, respuesta y ejecución.

## Secuencia segura de cutover posterior

1. mantener shadow y comparar semántica, continuidad, ambigüedad, resolución,
   disposition y plan por separado;
2. introducir una frontera V4 precomputada para que el mismo output alimente
   observación y Core sin duplicar llamadas;
3. habilitar V4 sólo para READ en un entorno aislado, manteniendo Legacy como
   fallback explícito y midiendo diferencias;
4. habilitar WRITE únicamente hasta plan/confirmación, nunca ejecución directa;
5. validar authz, canonical IDs, digest, idempotencia y diálogos multivuelta;
6. retirar cada dependencia lingüística sólo después de evidencia equivalente.

No se elimina Legacy en M-7 ni se cambia el camino productivo con este mapa.
