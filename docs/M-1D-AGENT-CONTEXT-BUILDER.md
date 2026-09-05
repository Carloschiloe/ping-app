# Agent Context Builder Contract (M-1D)

Primera capa canónica que transforma una petición en lenguaje natural en un paquete de contexto autorizado y trazable, apoyada en Structured Retrieval (M-1B/M-1B.1) y Full-text Retrieval (M-1C). **No responde al usuario, no ejecuta nada, no escribe datos.** Es preparación de contexto para un futuro Ping Agent — el significado final y la respuesta se resuelven en una capa posterior, no aquí.

## Auditoría actual

- **LLM infra existente**: `synthesis.service.ts` usa OpenAI (`OPENAI_API_KEY`, modelo `gpt-4o-mini`, `chat.completions.create`). Patrón de "structured output" real: `response_format:{type:'json_object'}` + `JSON.parse` manual + defaulting campo por campo + fallback estático en catch — repetido en cada función, sin helper compartido. `commitment.service.ts#extractCommitment` es el análogo más cercano a lo que M-1D necesita: ya extrae `assignedToName` (nombre de persona) y fechas de lenguaje natural con ese mismo patrón, y ya trata la extracción determinística como más confiable que la del LLM (`message.service.ts`, comentario explícito).
- **`ai.controller.ts`** (`askPing`, `summarize`, `analyzeMessage`): construye su propio contexto de commitments inline con SQL directo — nunca usa `retrieval.service.ts`. Persiste su propio historial en `ai_messages` (tabla separada de `messages`). No se tocó nada de este archivo.
- **Timezone/locale**: no existe columna `profiles.timezone` ni negociación de locale real — todo el backend asume `'America/Santiago'` (`date-parser.service.ts`, `temporalContext.ts`) y `'es-CL'` como defaults hardcodeados. **M-1D NO reutiliza ese default** — ver "Time resolution".
- **Tipos**: no existen `types/conversation.ts`/`message.ts`/`commitment.ts`; el identity shape del actor es `req.user!.id` sobre `Request` de Express (aumentado globalmente en `middleware/auth.ts`), no un tipo `AuthenticatedRequest` dedicado. Irrelevante para M-1D ya que no hay controller — `actorUserId` llega ya resuelto en `AgentContextInput`.
- **Intent classification**: confirmado que NO existe nada previo (ni siquiera parcial) en todo el backend.

Nada de esto se modificó — sólo lectura/auditoría (sección 4 del ticket).

## Arquitectura

```
AgentContextInput
  → agentInputInterpreter.service.ts (interpret) → Interpretation (hints, nunca IDs)
  → resolvePerson (M-1B.1) por cada personHint       → entidades autorizadas o ambigüedad
  → resolveTimeExpression (local, timezone-aware)    → RetrievalTimeRange | null
  → retrieval plan explícito (inspeccionable)
  → retrieveCommitments / retrieveCommitmentEvents / retrieveMessages /
    retrieveTranscriptions / retrieveAttachments (M-1B/M-1C, ya
    authorization-safe — M-1D no reimplementa autorización)
  → dedupeProvenance (M-1B)
  → AgentContext (compacto, tipado, trazable)
```

3 archivos nuevos: `types/agentContext.ts`, `services/agentInputInterpreter.service.ts`, `services/agentContextBuilder.service.ts`. Sin controller, sin ruta pública (prohibido explícitamente).

## Input contract

```ts
AgentContextInput {
  actorUserId: string;   // ya autenticado, resuelto por el caller — nunca del cliente
  input: string;
  conversationId?: string; // ÚNICA fuente de conversationId en todo el pipeline
  channel?: 'mobile'|'web'|'voice'|'device'|'car'|string; // metadata, nunca cambia semántica
  now?: string;
  locale?: string;
  timezone?: string; // IANA, validado — nunca confiado ciegamente
}
```

## Output contract

`AgentContext` (ver `types/agentContext.ts`) — reutiliza los DTOs delgados de M-1B/M-1C (`RetrievalCommitment`, `RetrievalMessage`, etc.) directamente para `commitments`/`events`/`messages`/`transcriptions`/`attachments`, en vez de inventar una envoltura paralela: ya son compactos, tipados y traen `provenance`/`textRank?` — una nueva envoltura habría sido duplicación sin beneficio. Incluye además: `intent`, `entities` (personas resueltas, timeRange, topics, conversationId), `canonicalFacts` (mínimo, honesto — ver abajo), `provenance` agregado y deduplicado, `needsClarification`/`clarification`, `evidenceFound`, `retrievalPlan` inspeccionable, `diagnostics?` opcional. `contextSummary?` existe en el tipo pero **nunca se genera en este slice** (ver "No resumen alucinado").

## Intent model

6 categorías, cada una con un plan de retrieval realmente distinto (sección 7 — "usar sólo categorías justificadas"):

| Intent | Dispara con | Ejemplo |
|---|---|---|
| `commitment_query` | prometí/promise, pendiente/pending, tarea/task, compromiso/commitment | A, B |
| `person_query` | "quién es"/"who is", "cuéntame de"/"tell me about" | — |
| `recall` | hablamos/talked, dijo/said, decidimos/decided, o mención de audio | C, D, F, L |
| `message_search` | busca/buscar/search/find (verbo explícito) | — |
| `document_search` | contrato/contract, documento/document, archivo/file, adjunto/attachment | E |
| `general_context` | fallback — ninguna keyword reconocida | — |

**Descartadas deliberadamente**: `conversation_context` (mismo plan que `recall`, se fusionó) y `task_status` (mismo plan que `commitment_query`, sólo cambia el filtro de status). Menos categorías, cada una justificada por un plan de retrieval distinto — no una taxonomía por el gusto de tenerla.

## Interpreter

`AgentInputInterpreter` es una interfaz desacoplada (`interpret(input, context): Promise<Interpretation>`) — permite mock en tests y un futuro reemplazo sin tocar el builder (sección 30).

**Decisión de alcance**: se implementa **sólo** `DeterministicInputInterpreter` (regex/keywords, sin red, 100% testeable, cero costo, cero no-determinismo). La infraestructura LLM existe y se auditó (`synthesis.service.ts`), pero **no se conecta en este slice** — construir y certificar un `LlmInputInterpreter` real habría introducido dependencia de red/costo/no-determinismo en un milestone que el propio ticket exige certificar 100% local (sección 37) y que explícitamente no debe "depender de reglas frágiles únicamente" pero tampoco necesita resolverlo ya (sección 3: M-1D es preparación, no el agente final). Un futuro `LlmInputInterpreter` implementaría la misma interfaz siguiendo el patrón ya establecido en `commitment.service.ts#extractCommitment` (JSON estructurado + defaulting + fallback), y `agentContextBuilder.service.ts` no necesitaría cambios para adoptarlo — sólo pasar otra instancia vía `options.interpreter`.

**Bug real encontrado y corregido durante el desarrollo**: `\b` (frontera de palabra) de JavaScript es ASCII-only (`\w` = `[A-Za-z0-9_]`) — falla silenciosamente justo después de una vocal acentuada. Verificado empíricamente: `/\bprometí\b/i.test('prometí')` → `false`. Se corrigió usando fronteras Unicode-aware (`(?<![\p{L}\p{N}_])`/`(?![\p{L}\p{N}_])` con flag `u`) en todos los patrones ES/EN — mismo espíritu global-first que la corrección de idioma en M-1C, esta vez a nivel de parsing de texto en JS, no de Postgres.

## Entity resolution

Cada `personHint` (texto plano, nunca un ID) pasa por `resolvePerson(actorUserId, { name: hint, conversationId })` (M-1B, ya authorization-safe). Nunca se elige arbitrariamente:
- 1 match → `resolvedPersonId` se usa para acotar `retrieveCommitments`/`retrieveMessages`.
- 0 matches → sigue como "unresolved", no bloquea el resto del pipeline (podría ser un falso positivo del heurístico, ej. "Proyecto Aurora" detectado como nombre — simplemente no resuelve a nadie).
- >1 match (`ambiguous: true`) → `needsClarification = true`, `clarification = { reason: 'person_ambiguous', candidates }`, y **ningún retrieval usa un personId** para ese hint (no se "adivina" cuál de los candidatos ambiguos es el correcto) — pero el resto de la evidencia disponible (por `conversationId`/`textQuery`, si los hay) sigue recuperándose, porque eso no es "elegir arbitrariamente sobre uno", es evidencia independiente de la identidad ambigua.

## Time resolution

`resolveTimeExpression(expression, now, timezone)` — determinista, separado del intérprete para ser testeable de forma aislada. Soporta: hoy/today, ayer/yesterday, mañana/tomorrow, esta semana/this week (lunes ISO — convención neutral documentada, no ligada a un idioma/región), la semana pasada/last week, el mes pasado/last month, "hace N días"/"N days ago". Usa `Intl.DateTimeFormat` para calcular límites de día/semana/mes **en la zona horaria real dada**, nunca en UTC silencioso — verificado con un test que compara el mismo "ayer" calculado en `America/Santiago` vs `UTC` y confirma que dan resultados distintos cuando corresponde.

**Default de timezone: `UTC`, nunca una zona regional.** Deliberadamente NO se reutiliza `resolveTimeZone()` de `date-parser.service.ts` pese a que ya existe y hace la misma validación (`Intl.DateTimeFormat` try/catch) — porque su fallback es `'America/Santiago'`, un default regional que contradice el principio de M-1D (sección 1: Ping es global). Se escribió una validación local equivalente con fallback `UTC`, evitando repetir el mismo sesgo regional que M-1C corrigió para idioma.

## Retrieval plan

Array explícito e inspeccionable, construido ANTES de ejecutar (`AgentContext.retrievalPlan` / `diagnostics.retrievalPlan`), nunca una mega-query indiscriminada. Ejemplo real (certificado en tests) para "¿Qué le prometí a Laura?": `[resolvePerson, retrieveCommitments, retrieveCommitmentEvents, retrieveMessages]`. Para "¿Me mandaron algún contrato?": nunca incluye `retrieveCommitments` (verificado en test).

## Source priority

Implícita en qué se ejecuta y en qué orden se agrega al resultado — `commitments` y `events` antes que `messages`, que a su vez antes que `transcriptions`/`attachments`, siguiendo exactamente la prioridad de la sección 14. No hay memoria derivada porque todavía no existe (M-1B/M-1C son las únicas fuentes).

## Structured retrieval / Full-text retrieval

Reutilizados sin duplicar ninguna query: `resolvePerson`, `retrieveCommitments`, `retrieveCommitmentEvents`, `retrieveMessages`, `retrieveTranscriptions`, `retrieveAttachments` — las mismas funciones authorization-safe de M-1B.1, con `query` (M-1C) pasado cuando hay `textQuery`. M-1D no re-implementa ninguna lógica de autorización ni de matching — sólo decide QUÉ llamar y CON QUÉ parámetros.

## Context budget

`{ commitments: 10, events: 10, messages: 15, transcriptions: 5, attachments: 5 }` — mismo orden de magnitud que los defaults ya establecidos en M-1B, pasado explícitamente como `limit` a cada función (nunca se trae de más y se recorta después). Configurable vía `options.budget` (verificado en test).

## Context packing

Cada item recuperado ya trae `{ id, campos, timestamp, provenance, textRank? }` (M-1B/M-1C DTOs) — `textRank` hace de `score` cuando hubo búsqueda de texto; su ausencia (structural-only match) es honesta, no un `0` inventado. Nunca se pasa una fila cruda de la base de datos.

## Ambiguity

`needsClarification: boolean` + `clarification?: { reason: 'person_ambiguous'|'time_ambiguous'|'topic_too_broad', candidates? }`. Implementado: `person_ambiguous` (sección 11/20) y `topic_too_broad` (input sin ninguna señal — ni persona, ni texto, ni tiempo — ej. "hola"). `time_ambiguous` queda definido en el tipo pero no tiene disparador implementado en este slice (ninguna de las expresiones temporales soportadas es ambigua por diseño — se agregaría si se soportan expresiones genuinamente ambiguas como "el jueves" sin más contexto).

## No evidence

`evidenceFound: boolean` — `false` cuando las 5 colecciones de evidencia (`commitments`, `events`, `messages`, `transcriptions`, `attachments`) vienen vacías. `diagnostics.sourceCounts` deja explícito qué se consultó y cuánto devolvió cada fuente — nunca se inventa contenido cuando no hay evidencia.

## Provenance

`AgentContext.provenance` agrega y deduplica (`dedupeProvenance`, reutilizado de M-1B) el provenance de las 5 fuentes — cada fact recuperado es trazable a su mensaje/commitment/transcript/attachment/conversación de origen. `canonicalFacts` es deliberadamente pequeño y honesto: sólo entidades resueltas con certeza estructural (`{ type: 'person_resolved', personId, displayName }`), nunca un resumen inventado del contenido recuperado — M-1D no tiene una fuente de "facts" propia más allá de eso.

## Authorization

**El intérprete nunca puede producir un ID que se use directamente** — estructuralmente, `Interpretation` no tiene ningún campo `conversationId`/`personId`/`commitmentId` (sólo `personHints: string[]` en texto plano). El único `conversationId` que el pipeline usa es el que el CALLER pasó explícitamente en `AgentContextInput.conversationId`. Verificado con un test que usa un intérprete "malicioso" (mock que además de la forma válida agrega un campo `conversationId` inyectado) y confirma que `buildAgentContext` lo ignora por completo — sólo usa el `conversationId` real del input. Cualquier 403 de M-1B.1 (ej. un `conversationId` ajeno) se propaga tal cual, nunca se traga (verificado con un test de outsider — consulta objetivo J).

## Privacy

Sin cross-user/cross-conversation leakage (heredado íntegramente de M-1B.1, no reimplementado). `diagnostics` nunca incluye el texto del input del usuario ni contenido recuperado — sólo conteos, nombres de pasos, e intención clasificada (sección 32: "no logs con contenido sensible"). Los `candidates` de una ambigüedad de persona sólo pueden venir de `resolvePerson`, que ya los acota al universo autorizado del actor — nunca se exponen personas fuera de ese universo.

## Self chat

No requiere ningún código especial — un self-chat es una conversación como cualquier otra en `conversation_participants`; M-1B/M-1C ya la autorizan igual (el actor es participante). Verificado con un test explícito ("¿Qué anoté sobre el regalo?" con `conversationId` de un self-chat) confirmando que no hay ninguna rama de código que distinga este caso.

## Audio

"¿Qué dijo Alex en el audio de ayer?" → `personHints:['Alex']`, `timeExpression:'ayer'`, `wantsTranscriptions:true`. **Limitación heredada de M-1C, no de M-1D**: `retrieveTranscriptions` requiere `conversationId` (M-1C nunca ofreció búsqueda global de transcripciones) — si el caller no pasó uno, esta fuente simplemente se omite (verificado en test). No se reproduce audio, no se toca el pipeline de transcripción.

## Attachments

"¿Me mandaron algún contrato?" → `document_search`, `wantsAttachments:true`, plan usa `retrieveAttachments(kind=['document'])` — sólo si hay `conversationId` (mismo requisito heredado de M-1B). Sin OCR, sin document-content search — el adjunto sigue siendo sólo una referencia.

## Multilingual

Certificado con casos en inglés puro ("What happened yesterday?") y mezcla ES/EN ("What did Laura say about vacaciones?") — mismo intérprete, mismas reglas, sin rama de código específica por idioma (más allá del propio parsing de fechas, permitido explícitamente por la sección 29). Ningún test ni fixture usa vocabulario de una industria específica.

## Fallback

`fallbackInterpretation(input)` — usado cuando el intérprete (presente o futuro) lanza una excepción o devuelve una forma inválida (`safeInterpret`, con validación mínima de forma). Nunca crashea, nunca inventa `personId`/`timeRange`; produce `intent:'general_context'`, `textQuery` = input normalizado, `wantsCommitments`/`wantsMessages: true`, `wantsTranscriptions`/`wantsAttachments: false` — conservador, respeta límites y autorización normalmente. Verificado con un intérprete que lanza una excepción real.

## Observability

`diagnostics?: { interpretedIntent, interpretationSource, retrievalPlan, sourcesConsulted, sourceCounts, durationMs }` — nunca contenido sensible, nunca el input completo del usuario, nunca resultados recuperados.

## Performance

`Promise.all` para las 4 fuentes independientes (`commitments`/`messages`/`transcriptions`/`attachments`); `commitmentEvents` depende de los commitments encontrados, va después. Ninguna fuente se ejecuta si la interpretación no la pidió (`wantsX` flags) — verificado explícitamente que `commitment_query` nunca dispara `retrieveTranscriptions`/`retrieveAttachments`, y que sin `conversationId` esas dos fuentes tampoco se disparan (requisito heredado de M-1B/M-1C, no una limitación nueva).

## Tests

35 tests nuevos en `backend/tests/agentContextBuilder.test.ts` — mock completo de `retrieval.service.ts` (certifica el CONTRATO del builder, no el matching real, ya cubierto por M-1B/M-1C). Cobertura: intent (con las consultas objetivo reales A-F, K, L), fallback, resolución temporal timezone-aware, flujo básico con persona resuelta, ambigüedad, sin evidencia/topic_too_broad, autorización (incluyendo intérprete "malicioso" y propagación de 403 de outsider), plan de retrieval inspeccionable, performance (fuentes no solicitadas nunca se disparan), context budget (default y custom), determinismo, validación de input, self-chat.

## Archivos

- `backend/src/types/agentContext.ts` (nuevo)
- `backend/src/services/agentInputInterpreter.service.ts` (nuevo)
- `backend/src/services/agentContextBuilder.service.ts` (nuevo)
- `backend/tests/agentContextBuilder.test.ts` (nuevo, 35 tests)
- `docs/M-1D-AGENT-CONTEXT-BUILDER.md` (este archivo)

Sin controller, sin ruta, sin cambios a `ai.controller.ts`/`synthesis.service.ts`/legacy-ai/mobile/embeddings/producción.

## Riesgos

- El intérprete determinístico es heurístico (regex/keywords) — no es NLP real. Puede fallar en construcciones no cubiertas por los patrones (documentado como limitación explícita, no oculta). Mitigado porque nunca decide autorización ni identidad final por sí mismo — todo pasa por `resolvePerson`.
- No hay `LlmInputInterpreter` implementado todavía — el intérprete determinístico es el único disponible. Diseñado para ser reemplazable sin tocar el builder.
- `time_ambiguous` está definido en el tipo pero sin disparador real todavía (deuda menor, documentada).
- Igual que M-1C: `retrieveTranscriptions`/`retrieveAttachments` requieren `conversationId` — una búsqueda de audio/documentos verdaderamente global (sin conversación) no es posible todavía (deuda heredada, no nueva).

## Staging

No aplica — M-1D no incluye migración ni cambio de schema. Todo el trabajo es TypeScript puro sobre servicios ya certificados en staging (M-1B/M-1C).

## Producción

No tocada.

## Recomendación

M-1D queda aprobado local. Antes de conectar esto a un agente real (fuera de alcance de este ticket), sería necesario: decidir si implementar `LlmInputInterpreter`, definir la capa de síntesis/respuesta final (que si usa LLM, deberá tratar este `AgentContext` como la ÚNICA fuente de verdad — nunca inventar hechos fuera de `provenance`), y decidir la interfaz pública (endpoint) cuando corresponda conectar una interfaz real.

M-1D AGENT CONTEXT BUILDER APROBADO LOCAL
