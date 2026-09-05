# Agent Orchestrator + Read-Only Endpoint (M-1F)

Primer flujo HTTP real de punta a punta del nuevo Ping Agent: `input → interpretación → contexto autorizado → retrieval → síntesis → AgentResponse`, expuesto vía `POST /api/agent/respond`. Capa de ORQUESTACIÓN pura — no reimplementa nada de M-1B/M-1B.1/M-1C/M-1D/M-1D.1/M-1E, sólo los conecta.

## Arquitectura

```
POST /api/agent/respond
  requireAuth              → req.user.id (ÚNICA fuente de actorUserId, nunca el body)
  agentRateLimiter          → 20 req / 5 min por usuario (fallback a IP si no autenticado)
  validateRequest(agentRequestSchema)  → zod strip: cualquier campo no declarado se descarta
  agentController.respond
    → runAgent({actorUserId, input, conversationId?, channel?, locale?, timezone?})
        → buildAgentContext(...)          [M-1D, sobre M-1B/M-1C — sin cambios]
        → synthesizeAgentResponse(...)    [M-1E/M-1E.1 — sin cambios]
        → AgentOrchestratorResponse{...response, diagnostics: {...+contextBuildMs,synthesisMs,totalMs}}
    → toPublicAgentResponse(response)    [{status, answer, citations, followUp?} — sin diagnostics/claims]
```

`agentOrchestrator.service.ts` nunca importa `supabaseAdmin` ni `retrieval.service.ts` directamente — verificado por inspección de imports y porque `agentOrchestrator.test.ts` mockea el Context Builder y el Synthesizer COMPLETOS (si el orchestrator hiciera algo por fuera de esas dos llamadas, no tendría cómo llegar a resultado alguno en esos tests).

## Transporte vs Core

`runAgent` es transport-agnostic por diseño (sección 38): el controller HTTP es sólo un adaptador que traduce `req`/`res` desde/hacia `AgentOrchestratorInput`/`AgentPublicResponse`. Un futuro pipeline de voz/dispositivo/auto puede llamar a `runAgent` directamente sin pasar por Express — no hay nada en el Core atado a HTTP (sin `req`/`res`, sin headers, sin status codes).

## actorUserId

Nunca del body — `agentRequestSchema` ni siquiera declara un campo `actorUserId`/`userId`, y zod en modo `strip` (default) descarta silenciosamente cualquier campo no declarado que un cliente intente enviar. El controller lee `req.user!.id` exclusivamente (poblado por `requireAuth` desde el token verificado). Certificado con un test explícito que envía `body.userId`/`body.actorUserId` spoofeados y confirma que `runAgent` nunca los recibe.

## Endpoint

`POST /agent/respond` (nuevo, no reutiliza `/ai/ask` legacy) — nombre agnóstico de proveedor, sin mencionar OpenAI/gpt en la ruta. Ruta completa `/api/agent/respond` (el router se monta en `/api`).

## Request

`agentRequestSchema`: `input` (string, trim, 1-2000 chars — techo de sanidad HTTP, distinto y más permisivo que el truncamiento interno a 500 chars de `LlmInputInterpreter` en M-1D.1, para no truncar en dos capas silenciosamente), `conversationId` (UUID, opcional), `channel`/`locale`/`timezone` (strings acotados, opcionales). Campos desconocidos: descartados (zod strip).

## Response pública

`AgentPublicResponse{status, answer, citations, followUp?}` — deliberadamente NO incluye `diagnostics` (timings, modelo, prompts) ni `claims` (detalle interno de síntesis, ver M-1E). `citations` viaja como refs opacas `{sourceType, sourceId}` — los ids no son secretos, sólo el contenido lo es, y ya está protegido porque nunca se sirve contenido crudo fuera de `answer`.

## Status HTTP

`needs_clarification`, `no_evidence`, `capability_gap` son respuestas válidas del agente, siempre HTTP 200 — nunca errores. Errores HTTP reales: 400 (validación), 401 (`requireAuth`), 403 (autorización, ej. `assertConversationParticipant` de M-1B), 429 (rate limit), 500 (inesperado, mensaje genérico fijo, nunca detalle de proveedor). Mismo patrón try/catch que el resto del codebase (`error instanceof AppError ? error.statusCode : 500`).

## Rate limiting

Además del limitador global ya existente en `app.ts` (500 req/15min sobre TODAS las rutas), `/agent/respond` tiene un segundo limitador propio, más estricto: 20 req/5min, `keyGenerator` por `req.user?.id` (con fallback a `req.ip`) — posible porque `requireAuth` corre ANTES en la cadena de middleware y ya pobló `req.user`.

## Timezone / locale / channel

Aceptados del cliente, nunca hardcodeados a Chile — `resolveAgentTimezone` (M-1D) ya maneja el fallback técnico si están ausentes/inválidos. `channel` viaja como string libre acotado (metadata), sin lógica de formato específica (deuda documentada ya en M-1E).

## Concurrencia

Sin estado mutable compartido entre requests — certificado con un test que corre dos `runAgent` en paralelo para actores distintos y confirma que las respuestas nunca se cruzan.

## Costo

Máximo 1 llamada LLM de interpretación (M-1D.1) + máximo 1 llamada LLM de síntesis (M-1E) por request — nunca una tercera. Certificado con tests que cuentan invocaciones exactas a cada capa mockeada.

## Logging

Sin loguear input del usuario, contexto recuperado, ni prompts — mismo estándar que M-1D.1/M-1E.

## Read-only — auditoría de call graph

Grep explícito de `\.(insert|update|upsert|delete)\(` sobre los 5 archivos nuevos/relevantes del flujo (`agent.controller.ts`, `agentOrchestrator.service.ts`, `agentContextBuilder.service.ts`, `agentResponseSynthesizer.service.ts`, `agentInputInterpreter.service.ts`): **cero coincidencias**. Cadena completa auditada:

```
controller        → 0 llamadas a supabaseAdmin (sólo llama a runAgent)
orchestrator       → 0 llamadas a supabaseAdmin (sólo llama a buildAgentContext + synthesizeAgentResponse)
context builder    → retrieveCommitments/retrieveCommitmentEvents/retrieveMessages/retrieveTranscriptions/
                      retrieveAttachments/resolvePerson — TODAS `.select()`-only, auditadas exhaustivamente en M-1B.1
synthesizer        → 0 acceso a DB (opera únicamente sobre el AgentContext ya recibido)
```

0 escrituras alcanzables desde el endpoint — confirmado por inspección de código, no sólo por convención de tests.

## No tocado (legacy coexistence)

`/ai/ask`, `ai_messages`, `PingAIScreen`, `ai.controller.ts`, `synthesis.service.ts` legacy — sin cambios. Deuda de migración explícitamente diferida a una decisión futura (no forma parte de este ticket).

## Tests

- `backend/tests/agentOrchestrator.test.ts` (10): una sola llamada a cada capa, contexto pasado por referencia idéntica (no sólo deep-equal), diagnostics fusionados (`contextBuildMs`/`synthesisMs`/`totalMs` + los ya existentes de M-1E), propagación de errores sin swallow (403 de autorización, error genérico), estados no-error (`no_evidence`/`needs_clarification`) pasan intactos, control de costo (exactamente 1 llamada por capa), independencia de concurrencia, `options.interpreter`/`options.contextBudget`/`options.synthesizer` correctamente inyectados.
- `backend/tests/agentController.test.ts` (9): `actorUserId` sólo de `req.user.id` (nunca de `body.userId`/`body.actorUserId`, con aserción explícita de que ni siquiera está presente en el argumento), forma pública mínima exacta, `no_evidence`/`capability_gap`/`needs_clarification` → 200, 403 propagado con mensaje seguro, error genérico → 500 sin fuga de detalle de proveedor, respuesta completa sin `diagnostics`/`claims`/nombres de modelo en ningún campo.
- `backend/tests/agentEndToEnd.test.ts` (7): integración HTTP real (`app.listen()` en puerto efímero + `fetch` real) — auth real, rate limit real, validación real, controller real, orchestrator real, Context Builder real, Retrieval real, contra un `supabaseAdmin` MOCKEADO (mismo patrón ya usado en 40+ archivos del repo) y sin `OPENAI_API_KEY` (mismo patrón que `optionalAiStartup.test.ts`) para no depender de red. Cubre: sin header → 401, token inválido → 401, input vacío → 400, `conversationId` no-UUID → 400, request válida con evidencia → 200 forma pública correcta, sin evidencia → 200 `no_evidence`, outsider con conversación ajena → 403 sin fuga.
- `backend/tests/helpers/supabaseMock.ts` extendido (retrocompatible) con `auth.getUser` mockeable — necesario porque `requireAuth` es la primera vez que este flujo ejercita ese método del mock; verificado sin regresiones contra la suite completa antes y después del cambio.

Suite completa: **507/507** (`--no-file-parallelism`, modo autoritativo en esta máquina — ver nota de flakiness abajo). `tsc --noEmit` limpio.

## Real provider smoke (sección 34)

3 casos sintéticos contra Postgres local desechable + `gpt-4o-mini` real (sin datos de usuario reales, sin staging):

- **B** (`"¿Qué hablamos del presupuesto de marketing ficticio?"`) → `capability_gap`, correctamente explicado (quiere transcripciones sin `conversationId`).
- **C** (outsider con `conversationId` ajeno) → 403 correctamente propagado desde `assertConversationParticipant` (M-1B).
- **A** (`"¿Qué compromisos tengo?"` / `"¿Qué pendientes tengo?"` para el dueño real de un commitment `accepted`) → **resultado no determinístico**: en 1 de 3 corridas idénticas, `answered` con la cita correcta; en 2 de 3, `no_evidence` a pesar de que el commitment existe y está correctamente autorizado.

### Hallazgo real (no es un defecto de M-1F)

Diagnosticado con `buildAgentContext` en aislamiento: la causa es que `LlmInputInterpreter` (M-1D.1) a veces adjunta un `textQuery` residual con una palabra genérica del propio input (`"pendientes"`, `"compromisos"`) además de fijar `statusHints` correctamente — y a veces no, para el MISMO input, en corridas distintas (no determinismo del modelo). Cuando lo hace, `retrieveCommitments` (M-1C, comportamiento correcto y ya certificado) aplica ese `textQuery` como filtro `AND` adicional vía `search_tsv`; si el título/descripción del commitment no contiene literalmente esa palabra (ej. `"Enviar el presupuesto"` no contiene "pendientes"), el filtro de texto — correctamente, dado ese input — excluye un resultado que sí coincidía por estado.

Confirmado paso a paso: (1) `retrieveCommitments` llamado directamente sin `textQuery` devuelve el commitment; (2) `buildAgentContext` corrido 3 veces con el mismo input mostró `hasTextQuery: false → evidenceFound: true` una vez y `hasTextQuery: true → evidenceFound: false` dos veces, para el mismo commitment fijo. La orquestación (M-1F) se comportó exactamente como debía en los 3 casos: pasó fielmente lo que cada capa produjo, sin alterar ni ocultar nada.

**No se modifica ningún código de M-1D.1/M-1C en este ticket** — está fuera de alcance explícito de M-1F ("no reimplementar interpretación/retrieval"). Se documenta como hallazgo real para una futura tarea de hardening del intérprete (ej.: afinar el prompt/schema de M-1D.1 para que una intención de filtro por estado no también popule `textQuery` con una palabra genérica del propio input; o que la capa de retrieval trate un `textQuery` sin resultados como señal para reintentar sin él — decisión de diseño fuera de alcance aquí).

**Resuelto en M-1D.3** (`docs/M-1D1-LLM-INPUT-INTERPRETER.md`, apéndice): prompt hardening + una normalización determinística post-LLM (`isControlLanguageOnly`) eliminan el `textQuery` genérico sin tocar M-1C ni M-1F. Certificado 50/50 contra proveedor real (5 inputs × 5 corridas) y 5/5 en la regresión end-to-end de este mismo escenario. M-1D.3 encontró además un hallazgo separado (commitments sin `due_at` excluidos por consultas con expresión temporal) — documentado allí, no corregido, fuera de alcance de ambos tickets.

## Flakiness conocida (no relacionada)

Igual que en M-1D.1/M-1D.2/M-1E/M-1E.1: correr la suite completa en modo paralelo por defecto produce timeouts intermitentes en tests preexistentes no relacionados (contención de recursos de esta máquina) — reproducido una vez tras agregar los archivos de M-1F, y re-confirmado limpio (507/507) con `--no-file-parallelism` inmediatamente después. No es una regresión de este ticket.

## Archivos

- `backend/src/types/agent.ts` (nuevo)
- `backend/src/schemas/agentRequest.schema.ts` (nuevo)
- `backend/src/services/agentOrchestrator.service.ts` (nuevo)
- `backend/src/controllers/agent.controller.ts` (nuevo)
- `backend/src/routes/index.ts` (modificado — nueva ruta + rate limiter propio)
- `backend/tests/agentOrchestrator.test.ts` (nuevo, 10 tests)
- `backend/tests/agentController.test.ts` (nuevo, 9 tests)
- `backend/tests/agentEndToEnd.test.ts` (nuevo, 7 tests)
- `backend/tests/helpers/supabaseMock.ts` (modificado — `auth.getUser` mockeable, retrocompatible)
- `docs/M-1F-AGENT-ORCHESTRATOR.md` (este archivo)

Sin tools, sin function calling, sin writes de commitments/mensajes/memoria/embeddings/pgvector, sin tocar mobile/`PingAIScreen`/legacy AI, sin producción.

## Riesgos

- El hallazgo de no-determinismo de `textQuery` (ver "Real provider smoke") es una limitación real, hoy, del intérprete LLM heredado de M-1D.1 — puede producir falsos `no_evidence` en consultas de estado genéricas ("pendientes", "compromisos") dependiendo de si el modelo decide adjuntar esa palabra como `textQuery`. No es un riesgo introducido por M-1F, pero sí uno que M-1F hizo visible por primera vez end-to-end con datos reales.
- `channel` sigue sin lógica de formato propia (deuda ya documentada en M-1E, no ampliada aquí).
- Rate limiting es en memoria (mismo patrón que el limitador global ya existente) — no distribuido entre instancias; aceptable para esta fase, documentado como limitación conocida del patrón ya existente en el repo, no nueva de este ticket.

## Staging

No aplica en este ticket — certificación LOCAL únicamente. Staging queda explícitamente diferida a una decisión futura separada.

## Producción

No tocada.

## Recomendación

M-1F queda aprobado local. Antes de una futura certificación en staging: decidir si el hallazgo de `textQuery` no determinístico amerita una tarea de hardening de M-1D.1 primero (recomendado, dado que afecta directamente la tasa de falsos `no_evidence` en consultas de estado comunes), y decidir la estrategia de coexistencia/migración con `/ai/ask` legacy (fuera de alcance de M-1F).

M-1F AGENT ORCHESTRATOR APROBADO LOCAL
