# LLM Input Interpreter Contract (M-1D.1)

Agrega comprensión real de lenguaje natural al Agent Context Builder (M-1D), manteniendo intacta la arquitectura existente: `AgentInputInterpreter` sigue siendo la interfaz desacoplada; `DeterministicInputInterpreter` pasa de ser "el intérprete" a ser el fast-path/fallback; `LlmInputInterpreter` es la implementación PRIMARY nueva. Ping sigue siendo global/multilingüe/domain-agnostic — nada aquí asume una industria, empresa o idioma.

## Auditoría

Confirmado en M-1D y reverificado aquí: `synthesis.service.ts` usa OpenAI (`OPENAI_API_KEY`, `gpt-4o-mini`, `chat.completions.create` + `response_format: json_object` + `JSON.parse` manual). `zod` (`^4.3.6`) ya es una dependencia real del backend, usada extensamente en `backend/src/schemas/*.schema.ts` para validar requests HTTP — se reutiliza esa misma librería y convención (`backend/src/schemas/agentInterpretation.schema.ts`) en vez de introducir una dependencia nueva. Ningún archivo de legacy AI fue modificado — sólo se importó (lectura) `isAiConfigured` de `synthesis.service.ts`.

## Arquitectura

```
raw user input
  → LlmInputInterpreter.interpret()
      → trunca input (≤500 chars)
      → AgentInputModel.interpret() [con timeout] → JSON crudo
      → JSON.parse (falla → fallback)
      → agentInterpretationPayloadSchema.safeParse (falla → fallback)
      → mapPayloadToInterpretation() → Interpretation validada
  → [cualquier fallo en el camino] → DeterministicInputInterpreter.interpret() (fallback real, no un vacío)
→ agentContextBuilder.service.ts (SIN CAMBIOS de contrato — sigue recibiendo la misma Interpretation)
→ resolvePerson / M-1B / M-1C (sin cambios — authorization-safe, como siempre)
→ AgentContext (+ capabilityGaps, nuevo en M-1D.1)
```

`agentContextBuilder.service.ts` cambia en un solo punto estructural: el interpreter por defecto pasa de `DeterministicInputInterpreter` a `LlmInputInterpreter` (que internamente ya incluye ese mismo determinístico como su propio fallback) — todo lo demás del pipeline de M-1D queda igual.

## Provider abstraction

```ts
interface AgentInputModel {
    readonly modelName: string;
    interpret(request: { input: string; context: InterpreterContext }): Promise<string>; // JSON crudo
}
```

`LlmInputInterpreter` depende únicamente de esta interfaz, nunca de OpenAI directamente — los tests inyectan un `AgentInputModel` fake (nunca la red real, sección 34). `OpenAiAgentInputModel implements AgentInputModel` es la única implementación real, reutilizando el patrón ya establecido (mismo modelo, mismo estilo de llamada) sin acoplar `LlmInputInterpreter` a un SDK concreto — cambiar de proveedor en el futuro significa escribir OTRA clase que implemente `AgentInputModel`, sin tocar el resto del pipeline.

## Structured output

Ejemplo real generado en el prompt (ver `buildInterpreterPrompt`):
```json
{"intent":"...", "personHints":[], "topicHints":[], "textQuery":null, "timeExpression":null,
 "requestedSources":[], "commitmentFilterHints":{"status":null}, "attachmentKindHints":[], "ambiguityHints":[]}
```
**Simplificación deliberada respecto al ejemplo del ticket**: `personHints` se mantiene como `string[]` (no `{text, roleHint}[]`) — `roleHint` no aporta a la resolución de identidad hoy (sólo `resolvePerson` decide, y sólo usa el nombre) y habría sido complejidad sin beneficio funcional inmediato; documentado explícitamente en vez de copiado literalmente sin justificación (mismo principio que M-1D, sección 6: "no copiar literalmente si hay un diseño mejor"). `commitmentFilterHints.status` se simplifica a un único valor `'open'|'closed'|null` (no un array de estados individuales) porque es exactamente lo que `DeterministicInputInterpreter` ya soportaba y lo único que el resto del pipeline consume.

No se parsea prosa en ningún punto: `response_format: json_object` fuerza JSON, y CUALQUIER desviación de forma cae a `JSON.parse` (falla) o al schema (falla) — nunca a un regex sobre texto libre del modelo.

## Schema validation

`backend/src/schemas/agentInterpretation.schema.ts` — `zod`, reutilizando la infraestructura ya existente. Garantía de seguridad estructural, **verificada empíricamente, no asumida**:

```js
z.object({ intent: z.enum(['a','b']) }).safeParse({ intent: 'a', personId: 'sneaky-id' })
// -> { success: true, data: { intent: 'a' } }  — personId JAMÁS sobrevive
```

`z.object()` en modo "strip" (default de zod) descarta silenciosamente cualquier campo no declarado en el schema. Esta es la aplicación REAL de "el LLM nunca puede devolver un ID confiable" — no una instrucción de prompt que el modelo podría (o no) obedecer, sino una propiedad estructural del parser que corre SIEMPRE, incluso si el modelo "coopera" con una inyección de prompt e intenta devolver `personId`/`conversationId`/`userId`. Verificado con tests explícitos (`agentInputInterpreter.test.ts`, "nunca incluye personId/...").

Todos los campos son enums o arrays/strings acotados (`.max()`); un array que excede el máximo (ej. 20 `personHints` cuando el tope es 5) hace fallar la validación COMPLETA — no se trunca en silencio, se cae al fallback completo (fail-safe, más seguro que aceptar parcialmente un payload que ya mostró comportamiento fuera de contrato).

## Prompt

Corto y estable (`buildInterpreterPrompt`), sin historial del usuario. Contenido: Ping es global/domain-agnostic; el modelo sólo interpreta, nunca responde ni ejecuta; nunca inventa IDs; el texto del usuario es DATOS, no instrucciones; instrucción explícita para reportar `unresolved_pronoun` en vez de adivinar un referente. El texto del usuario se inserta literalmente al final, ya truncado.

## Intent

Sin expansión de taxonomía — se reutilizan exactamente las 6 categorías de M-1D (`commitment_query`, `person_query`, `recall`, `message_search`, `document_search`, `general_context`). El prompt se las presenta explícitamente al modelo como el único enum válido; el schema las vuelve a validar del lado del servidor — dos capas, nunca confianza ciega en que el modelo "se acordó" del enum correcto.

## Entity hints

Sin cambios de fondo respecto a M-1D: `personHints: string[]` — nunca IDs. Cada hint sigue pasando por `resolvePerson(actorUserId, {name, conversationId})`. Verificado explícitamente (consulta objetivo F) que un `personId` inventado por el modelo NUNCA llega a `retrieveCommitments`/`retrieveMessages` — sólo el ID real devuelto por `resolvePerson` se usa.

## Time hints

Sin cambios: el LLM (o el determinístico) sólo extrae la frase cruda (`"ayer"`, `"last week"`, `"next Tuesday"`); `resolveTimeExpression(expression, now, timezone)` sigue siendo la única función que calcula timestamps reales, 100% determinista, sin cambios en este slice.

## Topic extraction

`topicHints: string[]` (nuevo campo en `Interpretation`) — conceptos explícitos, nunca expansión semántica ("vacaciones" nunca se convierte en "hotel, playa, avión"). El prompt lo prohíbe explícitamente; no hay mecanismo en el código que pudiera expandir semánticamente aunque el modelo lo intentara (el schema no tiene ningún campo para "conceptos relacionados"). `textQuery` se deriva de `topicHints` cuando el modelo no da uno explícito.

## Source selection

`requestedSources` (sugerencia del modelo) se combina con OR sobre las reglas ya existentes basadas en intent (`mapPayloadToInterpretation`) — nunca reemplaza la validación por intent, sólo puede AÑADIR una fuente que el intent por sí solo no habría activado (ej. mención explícita de "audio" activa `transcriptions` aunque el intent clasificado sea `message_search`). Nunca se ejecutan las 5 fuentes siempre — verificado en tests heredados de M-1D que siguen pasando sin cambios.

## Retrieval plan

Sin cambios de diseño: sigue siendo `agentContextBuilder.service.ts` quien construye el `RetrievalPlanStep[]` a partir de la `Interpretation` ya validada — el LLM nunca genera queries ni llamadas, sólo hints. Inspeccionable en tests exactamente igual que en M-1D.

## Capability gaps

**Cambio de comportamiento real en el builder** (secciones 17-18): antes, si `wantsTranscriptions`/`wantsAttachments` era `true` pero no había `conversationId`, la fuente simplemente se omitía en silencio (indistinguible de "no había evidencia"). Ahora se registra un `AgentCapabilityGap` explícito:

```ts
type CapabilityGapType = 'global_transcription_scope_not_supported' | 'global_attachment_scope_not_supported';
AgentContext.capabilityGaps: AgentCapabilityGap[]
```

Certificado que ambos estados nunca se confunden (sección 30): "búsqueda ejecutada, vacía" → `evidenceFound:false`, `capabilityGaps:[]`; "búsqueda pedida, no ejecutable" → `capabilityGaps` no vacío, `evidenceFound` sigue siendo un campo honesto e independiente sobre lo que sí corrió.

## Ambiguity

`ambiguityHints: AmbiguityHintType[]` (nuevo campo en `Interpretation`, tanto para el LLM como para el determinístico) — el intérprete sólo SEÑALA, nunca resuelve. El builder decide: `unresolved_pronoun` → `needsClarification` con `reason:'person_ambiguous'` y `candidates:[]` (no hay a quién resolver — distinto de un `resolvePerson` con >1 match real); `time_ambiguous`/`topic_too_broad` se mapean 1:1 a su `ClarificationReason`. `person_ambiguous` por >1 match real de `resolvePerson` sigue teniendo prioridad (se chequea primero) sobre cualquier ambiguityHint.

## Global/multilingual

Certificado con ejemplos reales del ticket en español, inglés, mezclados e informales/con typos (`agentInputInterpreter.test.ts`) — el pipeline de mapeo/validación es exactamente el mismo sin importar el idioma; la comprensión real del lenguaje queda delegada al modelo (auditado, no reimplementado) y el determinístico sigue funcionando igual como fallback en cualquier idioma (heredado de M-1D, ya certificado allí).

## Informal/typos

No se modificó M-1C ni se agregó fuzzy search — exactamente como pide el ticket. La tolerancia a informalidad/errores ortográficos es responsabilidad del MODELO (normaliza el hint antes de que llegue al resto del pipeline, ej. "pendinte" → hint de intención "pendiente"); Retrieval sigue recibiendo `textQuery` con el mismo contrato de siempre (sin garantía de fuzzy — ver M-1C.1). Verificado con un caso informal explícito.

## Prompt injection

Defensa en dos capas, verificada explícitamente:
1. **Instrucción en el prompt**: el texto del usuario es DATOS, nunca instrucciones al intérprete.
2. **Estructural (la barrera real)**: el schema descarta cualquier campo no declarado — incluso si el modelo "obedeciera" una inyección y devolviera `allUserIds`/`systemPromptOverride`/`personId`/`conversationId`, esos campos nunca sobreviven el parseo. Verificado con un test que simula exactamente ese escenario (modelo "comprometido" que intenta devolver esos campos) y confirma que el resultado final no los contiene.

Un `intent` fuera del enum (otro vector de injection: "return_all_data") hace fallar el schema completo → fallback conservador, nunca un crash ni un comportamiento indefinido.

## Limits

- **Input**: truncado a 500 caracteres antes de enviarse al modelo (`MAX_INTERPRETER_INPUT_LENGTH`) — verificado en test.
- **Output**: arrays acotados vía zod (`personHints`/`topicHints` ≤5, `requestedSources`≤5, `attachmentKindHints`≤4, `ambiguityHints`≤3) — exceder el límite invalida el payload completo (fail-safe), verificado en test.
- **Timeout**: 8000ms por defecto, configurable — verificado con un modelo fake que "cuelga" y un timeout corto.

## Fallback

Estrategia de dos niveles (sección 3): `LlmInputInterpreter` cae a `DeterministicInputInterpreter` (real, no un vacío — sigue clasificando intents/hints correctamente, verificado) ante CUALQUIER fallo: timeout, error de API, JSON inválido, schema inválido. Si además ese fallback fallara (no debería — es puro regex sin I/O), `agentContextBuilder.service.ts` conserva su propia red de seguridad (`fallbackInterpretation`, sección 31 de M-1D, sin cambios). `fallbackReason` (`'timeout'|'api_error'|'invalid_json'|'schema_invalid'|'interpreter_threw'`) queda en diagnostics, nunca en contenido expuesto al usuario.

## Diagnostics

`AgentDiagnostics` extendido: `interpreterUsed: 'llm'|'deterministic'|'fallback'`, `model?` (sólo el nombre, ej. `'gpt-4o-mini'`), `schemaValid?`, `fallbackReason?`, `timezoneSource: 'input'|'fallback'` (sección 13 — indica si la timezone vino validada del caller o se usó el fallback técnico `UTC`). Nunca se guarda el prompt completo, el input íntegro del usuario, contenido recuperado, ni la respuesta cruda del modelo — sólo metadata de diagnóstico (nombres, booleanos, duraciones).

## Cost

Una interpretación = **una** llamada al modelo, siempre — verificado explícitamente (`model.interpret` llamado exactamente 1 vez por `interpret()`). No se hacen llamadas separadas para intent/personas/fechas/fuentes: todo sale de la misma extracción estructurada. **Fast-path determinístico evaluado y descartado por ahora**: la sección 26 sugiere considerar resolver casos triviales sin llamar al modelo, pero se decidió NO construirlo en este slice — el riesgo señalado explícitamente por el propio ticket ("no volver a convertir el deterministic interpreter en el cerebro principal") pesa más que el ahorro de una llamada económica (`gpt-4o-mini`, prompt corto, `max_tokens:300`) para un milestone que todavía no tiene ningún consumidor real. Documentado como candidato futuro, no implementado.

## Tests — interpreter

19 tests nuevos en `backend/tests/agentInputInterpreter.test.ts`, **100% con `AgentInputModel` fake — cero llamadas de red reales**. Cobertura: mapping payload→Interpretation, español/inglés/mixto/informal reales del ticket, audio/document intent, IDs inventados nunca sobreviven, JSON inválido, schema inválido, error de API, timeout, fallback real (no vacío), prompt injection (dos escenarios), límites de input/output, cost control.

## Tests — context builder

11 tests end-to-end nuevos en `backend/tests/agentContextBuilder.test.ts` (consultas objetivo A-I del ticket) + 2 tests explícitos de "no evidence vs capability gap" — 45 tests totales en el archivo (34 de M-1D + 11 de M-1D.1).

**Hallazgo crítico de seguridad de tests, corregido durante el desarrollo**: `buildAgentContext` ahora usa `LlmInputInterpreter` como default, y este entorno de desarrollo tiene un `OPENAI_API_KEY` real configurado en `.env` — sin corrección, los 34 tests heredados de M-1D habrían intentado llamadas reales a la red de OpenAI en cada ejecución de la suite. Corregido introduciendo `withDeterministicInterpreter()`, un wrapper de test que inyecta explícitamente `DeterministicInputInterpreter` como interpreter por defecto en TODOS los tests de este archivo (los que necesitan un interpreter/modelo específico lo siguen pasando explícitamente, que sobrescribe el default). Verificado que la suite completa (440 tests) corre sin ninguna llamada de red.

## Performance

Sin N+1 nuevo: como máximo una llamada al modelo por interpretación (cost control), Retrieval sigue usando exactamente las mismas queries de M-1B/M-1C sin duplicación.

## Archivos

- `backend/src/schemas/agentInterpretation.schema.ts` (nuevo — zod, reutiliza convención existente)
- `backend/src/services/agentInputInterpreter.service.ts` (extendido: `AgentInputModel`, `OpenAiAgentInputModel`, `LlmInputInterpreter`)
- `backend/src/services/agentContextBuilder.service.ts` (extendido: capability gaps, ambiguityHints wiring, diagnostics, default interpreter)
- `backend/src/types/agentContext.ts` (extendido: `topicHints`, `ambiguityHints`, `AmbiguityHintType`, `CapabilityGapType`/`AgentCapabilityGap`, diagnostics ampliados)
- `backend/tests/agentInputInterpreter.test.ts` (nuevo, 19 tests)
- `backend/tests/agentContextBuilder.test.ts` (extendido, +11 tests, +wrapper de seguridad para tests)
- `docs/M-1D1-LLM-INPUT-INTERPRETER.md` (este archivo)

Sin controller/ruta nueva. Sin tocar `ai.controller.ts`/legacy-ai/mobile/embeddings/producción.

## Riesgos

- El modelo real (`gpt-4o-mini`) no fue probado contra la red real en este slice (sección 34 lo prohíbe explícitamente sin reportarlo aparte) — la certificación es 100% contra fakes. Una prueba manual real quedaría pendiente y debe reportarse por separado si se hace.
- `intentConfidence` para resultados LLM es un valor fijo (0.75), no auto-reportado por el modelo — decisión documentada (los scores de confianza auto-reportados por LLMs no están calibrados de forma confiable), pero es una simplificación real.
- `time_ambiguous` sigue sin un disparador real más allá de que el propio LLM lo señale explícitamente (heredado de M-1D).
- Fast-path determinístico para casos triviales: evaluado, no implementado — deuda documentada explícitamente.

## Staging

No aplica — sin schema de base de datos nuevo, sin migración.

## Producción

No tocada.

## Recomendación

M-1D.1 queda aprobado local. Antes de cualquier prueba con el proveedor real: confirmar presupuesto/límites de uso de la cuenta OpenAI y reportarla como una actividad separada, nunca como parte de la suite automatizada. Antes de M-1E (o de conectar un agente real): decidir si vale la pena el fast-path determinístico documentado como deuda, y diseñar cómo la capa de síntesis final debe comunicar un `capabilityGap` al usuario sin sonar como una alucinación ("no encontré nada" vs "no puedo buscar eso todavía").

M-1D.1 LLM INPUT INTERPRETER APROBADO LOCAL

---

## M-1D.3 — Interpreter Query-Hint Hardening

### Causa raíz

Hallazgo real del smoke con proveedor real de M-1F: `mapPayloadToInterpretation` tomaba `payload.textQuery` textual, tal cual el modelo lo devolvía, sin ninguna guía en el prompt sobre CUÁNDO debía ser `null`. Para inputs como `"¿Qué pendientes tengo esta semana?"`, el modelo — de forma no determinística, mismo input, corridas distintas — a veces devolvía `textQuery:"pendientes"` (repitiendo la palabra de intención/estado ya capturada por `commitmentFilterHints.status`) y a veces `textQuery:null`. M-1C aplica un `textQuery` no nulo como filtro `AND` real vía `search_tsv`; si el título del commitment no contenía esa palabra literal, un commitment estructuralmente válido (estado correcto, dueño correcto) quedaba excluido → falso `no_evidence`. Confirmado paso a paso (`buildAgentContext` corrido 3 veces con el mismo input: 1/3 `evidenceFound:true`, 2/3 `false`, tracking exacto con si el modelo adjuntó `textQuery`).

### Regla intent vs topic

Separación conceptual aplicada en dos capas independientes (defensa en profundidad, ninguna es la única barrera):
1. **Prompt** (primera línea, reduce la frecuencia en origen): instruye explícitamente que `textQuery` es opcional y debe ser `null` cuando los campos estructurados (`intent`, `commitmentFilterHints`, `requestedSources`) ya expresan la solicitud completa — nunca debe repetir una palabra genérica de estado/intención ("pending", "commitments", "tasks", "promised") aunque aparezca literalmente en el texto.
2. **Normalización determinística post-LLM** (`isControlLanguageOnly`, red de seguridad final, sección 6 del ticket): si TODOS los tokens del `textQuery` resuelto son palabras de control (stopwords + los mismos `COMMITMENT_KEYWORDS`/`OPEN_STATUS_KEYWORDS`/`CLOSED_STATUS_KEYWORDS` ES+EN ya definidos para `DeterministicInputInterpreter`), se descarta a `null`. Reutiliza conjuntos YA existentes en el archivo — sin lista lingüística nueva, sin vocabulario de industria, sin asumir un idioma. Un tema real ("Proyecto Aurora", "viaje", "trip", "task list app") nunca coincide con estos conjuntos porque basta con que UN SOLO token no sea de control para conservar el `textQuery` completo.

### Prompt

Dos líneas nuevas en `buildInterpreterPrompt`, deliberadamente sin sobrecargar de ejemplos (sección 4 del ticket): la instrucción explícita "textQuery is OPTIONAL... never set it to a generic word about status or intent itself" + un único par contrastivo ("what are my pending commitments this week?" → `null` vs "pending commitments about Project Aurora" → `"Project Aurora"`).

### Schema

Sin cambios — `textQuery: z.string().trim().max(200).nullable().default(null)` ya era null-safe desde M-1D.1; el gap estaba en el prompt/mapping, no en el schema.

### Normalization

`isControlLanguageOnly(text)` — tokeniza por espacios, verdadero si CADA token está en `STOPWORDS` o matchea `COMMITMENT_KEYWORDS`/`OPEN_STATUS_KEYWORDS`/`CLOSED_STATUS_KEYWORDS`. Se agregaron 12 pronombres posesivos ES+EN a `STOPWORDS` (`mi/mis/tu/tus/su/sus/my/your/his/her/their/our`) para que variantes como `"mis compromisos"` también se reconozcan como puro lenguaje de control — extensión mínima del mismo conjunto ya existente, no una lista nueva.

### textQuery semantics

`textQuery` final = `isControlLanguageOnly(rawTextQuery) ? null : rawTextQuery`, aplicado tanto si `rawTextQuery` vino directo de `payload.textQuery` como si se derivó de `topicHints` (el camino de fallback ya existente desde M-1D.1) — un solo punto de verdad, sin duplicar la regla.

### Topic hints

Auditado (sección 7 del ticket): `topicHints` sólo alimenta `AgentContext.entities.topics` (metadata de visualización) — **nunca** el filtro `AND` de retrieval, que usa exclusivamente `textQuery`. Por eso el hallazgo original era 100% explicable por `textQuery` solo; no se tocó `topicHints` (fuera del `textQuery` derivado de él), evitando ampliar el alcance sin necesidad.

### Determinism

Certificado con proveedor real: 5 corridas idénticas de `"¿Qué pendientes tengo esta semana?"` y de `"What pending commitments do I have this week?"` → `textQuery:null` en las 10/10 (antes: no determinístico). 5 corridas de `"¿Qué pendientes tengo sobre Proyecto Aurora?"` → `textQuery:"Proyecto Aurora"` en 5/5. 5 corridas de `"What commitments do I have about the trip?"` → `textQuery:"trip"` en 5/5. 5 corridas de `"¿Qué le prometí a Laura?"` → `textQuery:null`, `personHints:["Laura"]` en 5/5.

### Provider real

10 casos sintéticos (5 inputs × 5 corridas c/u, sin datos de usuario reales, sin staging) contra `gpt-4o-mini`: **50/50 según lo esperado**, cero variación una vez aplicado el hardening — a diferencia del comportamiento previo a este ticket, donde el mismo input producía resultados distintos entre corridas.

### End-to-end regression

Fixture con título sin palabras genéricas (`"Revisar el borrador de Proyecto Aurora"`, `status:accepted`) — 5 corridas de `buildAgentContext` con `"¿Qué pendientes tengo esta semana?"`: **5/5 `evidenceFound:true`**. Certificado además con el pipeline completo vía `runAgent` (interpretación real + retrieval real + síntesis real): `status:"answered"`, respuesta natural citando el commitment real. **Nota de fixture**: la primera corrida de este regression reveló que un commitment sin `due_at` es excluido por `retrieveCommitments` cuando la consulta incluye una expresión temporal (`gte('due_at', ...)` contra una columna `NULL` nunca es verdadero en Postgres) — un hallazgo real, separado, de la interacción `resolveTimeExpression`/`due_at` (M-1C/M-1D), no relacionado con `textQuery` y explícitamente fuera de alcance de este ticket (`NO cambiar retrieval semantics`). El fixture final incluye `due_at` dentro de la semana actual para aislar limpiamente el bug que este ticket sí corrige. Documentado aquí como hallazgo para una futura tarea (ver "Riesgos").

### Negative topic case

Dos commitments abiertos (`"Proyecto Aurora"` y `"viaje a Bariloche"`, ambos con `due_at` esta semana) — consulta `"¿Qué pendientes tengo sobre Proyecto Aurora?"` → sólo el commitment de Aurora aparece en `context.commitments`, el del viaje correctamente excluido. Confirma que el hardening elimina el filtro genérico sin sacrificar el filtro textual cuando SÍ hay un tema real.

### No evidence

Consulta sobre un tema genuinamente ausente (`"el cohete a Marte"`, filtros estructurados + tema real) → `evidenceFound:false` correctamente, sin ensanchar retrieval para forzar una respuesta.

### Tests

9 tests nuevos en `backend/tests/agentInputInterpreter.test.ts` (29 totales en el archivo): pending/commitments genéricos → `null` (ES+EN), posesivo+control (`"mis compromisos"`) → `null`, control word + personHint ya capturado → `null`, tema real preservado (`"Proyecto Aurora"`, `"trip"`), verbo de intención + persona → `null`, derivación desde `topicHints` sigue funcionando, un tema real que comparte una palabra de control (`"task list app"`) NO se descarta enteramente. Los 20 tests preexistentes del archivo siguen pasando sin modificación.

### Suite completa

`npx tsc --noEmit` limpio. `agentInputInterpreter.test.ts`: 29/29. `agentContextBuilder.test.ts` + `agentOrchestrator.test.ts` + `agentEndToEnd.test.ts`: 92/92 (sin regresión). Suite completa `--no-file-parallelism`: **516/516** (507 previos + 9 nuevos).

### Archivos

- `backend/src/services/agentInputInterpreter.service.ts` (modificado: `isControlLanguageOnly`, prompt extendido, `STOPWORDS` +12 posesivos, `mapPayloadToInterpretation` usa la normalización)
- `backend/tests/agentInputInterpreter.test.ts` (extendido, +9 tests)
- `docs/M-1D1-LLM-INPUT-INTERPRETER.md` (este apéndice)

Sin cambios en `agentInterpretation.schema.ts`, `retrieval.service.ts`, `agentContextBuilder.service.ts`, M-1F, mobile, embeddings, ni producción.

### M-1F impact

El hallazgo NO era un defecto de M-1F — `agentOrchestrator.service.ts` siguió pasando fielmente lo que el Context Builder producía en los tres casos observados durante el smoke original. Este ticket cierra el hallazgo documentado en `docs/M-1F-AGENT-ORCHESTRATOR.md` ("Real provider smoke" → "Hallazgo real") sin tocar ningún archivo de M-1F.

### Riesgos

- **Nuevo hallazgo, fuera de alcance de este ticket**: un commitment sin `due_at` queda excluido de cualquier consulta que incluya una expresión temporal resuelta (`"esta semana"`, `"ayer"`, etc.), porque `retrieveCommitments` aplica `gte`/`lte` sobre `due_at`, y Postgres nunca evalúa esos operadores como verdaderos contra `NULL`. Esto puede producir falsos `no_evidence` para commitments abiertos sin fecha límite cuando el usuario pregunta con una referencia temporal. Documentado explícitamente para una futura tarea de M-1D/M-1C — no corregido aquí (`NO cambiar retrieval semantics` era una restricción explícita de este ticket).
- La normalización basada en keyword-matching, aunque reutiliza conjuntos ya pequeños y genéricos, sigue siendo ES+EN-céntrica — un input en un tercer idioma cuyo `textQuery` sea puramente lenguaje de control en ESE idioma no sería detectado por `isControlLanguageOnly` (sólo por el prompt, que si es multilingüe por diseño). Riesgo aceptado y documentado, igual que el resto de listas ES+EN ya existentes en este archivo desde M-1D.
- El prompt sigue sin garantía dura de cumplimiento (es una instrucción, no una restricción estructural) — la normalización determinística es la que realmente garantiza el resultado, el prompt sólo reduce cuántas veces se necesita.

### Staging

No aplica — sin schema de base de datos, sin migración.

### Producción

No tocada.

### Recomendación

M-1D.3 queda aprobado local, desbloqueando el hallazgo documentado en M-1F. Antes de una futura certificación en staging de M-1F: considerar una tarea separada para el hallazgo de `due_at`/`NULL` documentado arriba en "Riesgos" — afecta la tasa de falsos `no_evidence` en consultas con expresión temporal sobre commitments sin fecha límite, un patrón de uso plausible en producción.

M-1D.3 INTERPRETER HARDENED — M-1F DESBLOQUEADO

---

## M-1D.4 — Status-Hint Semantics Hardening

### Causa raíz

Hallazgo real descubierto verificando M-1F.1 (`docs/M-1F.1-AGENT-FIDELITY-HARDENING.md`): `LlmInputInterpreter` inferÍa `commitmentFilterHints.status:"open"` por defecto para prácticamente CUALQUIER `commitment_query`, incluso sin ninguna señal de estado en el texto (ej. `"¿Qué pasó con el compromiso del regalo?"`, `"¿Qué le prometí a Laura?"`). Confirmado con 5 phrasings distintas, sin excepción, contra el modelo real. Esto excluía commitments cerrados/cancelados/resueltos de `retrieveCommitments` ANTES de que el guard de "canonical dominance" de M-1F.1 pudiera siquiera considerarlos — dejando ese guard funcionalmente inerte en el escenario exacto que fue diseñado para resolver.

### Intent vs status

`intent` describe el TIPO de entidad consultada (`commitment_query`); `commitmentFilterHints.status` es un filtro ADICIONAL, opcional, nunca implícito por el intent. Son conceptos ortogonales — el bug era tratar "es una consulta de commitments" como sinónimo de "quiere ver sólo los pendientes".

### Prompt

Una regla explícita y corta agregada a `buildInterpreterPrompt` (sección 5 del ticket, sin decenas de ejemplos): `commitmentFilterHints.status` es un filtro separado que NUNCA debe asumirse por el intent; sólo se setea junto con `statusBasis` (`"explicit"` = palabra de estado real, `"implied"` = la frase implica claramente pendiente/cerrado sin nombrarlo); una consulta neutral sobre un commitment/tema específico deja ambos en `null`; cuando el framing cerrado apunta a un resultado específico real (`resolved`/`cancelled`/`rejected`), usar ese valor en vez del genérico `closed`.

### Schema

`commitmentFilterHints` extendido (`agentInterpretation.schema.ts`): `status` ahora acepta `'open'|'resolved'|'cancelled'|'rejected'|'closed'|null` (antes sólo `'open'|'closed'`) — más preciso, sin inventar nombres fuera de `CanonicalCommitmentStatus`. `statusBasis: 'explicit'|'implied'|null` es el campo nuevo. `preprocess` sigue normalizando `commitmentFilterHints` ausente/null a `{}` (M-1D.2, sin cambios). El objeto por defecto pasa a `{status: null, statusBasis: null}`.

### Normalization

**Enfoque elegido, tras un intento fallido (M-1F.1)**: en vez de detectar "señal de estado" con keyword-matching determinístico EXTERNO al modelo (revertido en M-1F.1 por romper un caso implícito legítimo — ver "Cuidado con implicit status" abajo), el opt-in vive DENTRO del mismo juicio del modelo: `statusBasis` es un campo que el modelo debe declarar junto con `status`, dentro de la MISMA llamada estructurada (sin segunda llamada, sin verificador separado — sección 19 del ticket). La normalización post-LLM es mecánica y mínima: `mapPayloadToInterpretation` descarta `status` ENTERAMENTE si `statusBasis` es `null`, sin importar qué valor tenga `status` — nunca se aplica un filtro que el modelo no pueda justificar con su propio campo declarativo.

```ts
const statusHints = payload.commitmentFilterHints.statusBasis == null ? null
    : STATUS_HINT_MAP[payload.commitmentFilterHints.status ?? ''] ?? null;
```

### Explicit status

`statusBasis:"explicit"` — el usuario usó una palabra de estado real ("pendientes", "pending", "cancelé", "completé", en cualquier idioma). Certificado 20/20 contra proveedor real (4 inputs × 5 corridas: `"¿Qué pendientes tengo esta semana?"`, `"What pending commitments do I have?"`, `"¿Qué compromisos cancelé?"`, `"What commitments did I complete?"`) — 100% estable, y con precisión real: `"cancelé"` produjo `statusHints:["cancelled"]` (no el bucket genérico), `"complete"` produjo `["resolved"]`.

### Implied status

`statusBasis:"implied"` — la frase implica claramente pendiente/cerrado sin nombrarlo (ej. `"¿Qué me falta hacer?"`, `"Did I promise Daniel anything for this week?"`). Certificado 5/5 contra proveedor real para `"¿Qué me falta hacer?"` → `statusHints` open. El caso `"Did I promise Daniel..."` (ya certificado desde M-1D.1) se actualizó para declarar `statusBasis:'implied'` explícitamente en su fixture, reflejando lo que un modelo bien guiado por el nuevo prompt debe declarar.

### Neutral commitment queries

Certificado 20/20 contra proveedor real (4 inputs × 5 corridas: `"¿Qué pasó con el compromiso del regalo?"`, `"¿Qué le prometí a Laura?"`, `"What happened with the gift commitment?"`, `"Tell me about my commitment with Emily"`) — **100% `statusHints:null`**, sin excepción, incluyendo el input exacto que disparó el hallazgo original.

### Closed/cancelled

`STATUS_HINT_MAP` distingue los 3 estados terminales reales del Commitment Core (`resolved`/`cancelled`/`rejected`, auditados contra `CanonicalCommitmentStatus` y las migraciones reales — nunca inventados) además del `closed` genérico (fallback cuando el usuario dice "cerrado"/"closed" sin especificar cuál, preservando el comportamiento previo a M-1D.4 para ese caso). Certificado que `"cancelé"`/`"complete"` producen el estado específico, no el bucket amplio.

### TextQuery interaction

M-1D.3 confirmado intacto: `"¿Qué pendientes tengo sobre Proyecto Aurora?"` → `status:open` + `textQuery:"Proyecto Aurora"` juntos; `"¿Qué pasó con el compromiso de Proyecto Aurora?"` → `status:null` + `textQuery` preservado igual. Ambos campos son independientes, ninguno interfiere con el otro.

### Person interaction

M-1F.1 confirmado intacto: `"¿Qué le prometí a Laura?"` → `statusHints:null`, `personHints:["Laura"]` — el guard de atribución de persona (M-1F.1) sigue actuando sobre `personHints`/`resolvePerson`, sin relación con `statusHints`. `status:"open"` nunca se usa como sustituto de una persona no resuelta.

### Provider real

50 casos sintéticos (10 inputs × 5 corridas, sin datos reales, sin staging) contra `gpt-4o-mini`: **50/50 según lo esperado, 100% determinístico** — a diferencia del comportamiento pre-M-1D.4 (donde el status por defecto era consistentemente `"open"`, es decir, consistentemente INCORRECTO para las consultas neutrales, no inconsistente). Modelo: `gpt-4o-mini` (mismo de siempre). Sin fallback observado en ninguna corrida.

### Critical E2E regression

Fixture real (Postgres local desechable): 3 commitments (`open`/`due_at` esta semana, `cancelled` "Comprar regalo", `resolved` "Enviar informe mensual" con `resolution_result` — requerido por un trigger real del Commitment Core, `commitments_require_resolution_result`) + mensaje histórico "Se entregó el regalo el viernes." Pipeline completo (`runAgent`: interpreter real → context builder real → retrieval real → synthesis real, M-1F.1 incluido) con `"¿Qué pasó con el compromiso del regalo?"` × 5: **5/5 correcto** — el commitment cancelado llega a `AgentContext` (antes de M-1D.4 quedaba excluido por el status implícito) y la síntesis menciona el estado vigente ("cancelado") citando el commitment, además del mensaje histórico. Demuestra que M-1D.4 y M-1F.1 se complementan: sin M-1D.4, el guard de M-1F.1 nunca tenía nada que reforzar en este escenario exacto.

### Open-query regression

Misma fixture, `"¿Qué pendientes tengo?"` × 3: **3/3 correcto**, sólo el commitment `open` aparece — el `cancelled` y el `resolved` correctamente excluidos. Confirma que corregir el caso neutral no rompió el caso realmente pendiente.

### Historical query

Misma fixture, `"¿Qué compromisos cancelé?"` × 3: **3/3 correcto**, sólo el commitment `cancelled` aparece ("Cancelaste el compromiso de comprar un regalo") — nunca se amplía al `open`.

### Tests

13 tests nuevos en `agentInputInterpreter.test.ts` (42 en el archivo): consulta neutral → `null`; status sin `statusBasis` → descartado igual (defensa contra el default implícito); pendiente explícito → open; pendiente implícito → open; cancelado explícito → `["cancelled"]` específico; completado explícito → `["resolved"]` específico; "cerrados" genérico → bucket `closed` completo (compatibilidad); neutral+topic; pendiente+topic (M-1D.3 intacto); person query neutral; inglés neutral; mixed language neutral; informal. Fixtures existentes de M-1D.1 (`"Did I promise Daniel..."`) y M-1D.3 (3 casos con `status:'open'`) actualizados para incluir `statusBasis` explícito, reflejando el nuevo contrato — sin cambiar sus aserciones originales.

### Suite completa

`tsc --noEmit` limpio. `agentInputInterpreter.test.ts`: 42/42. Suite dirigida (interpreter+context builder+synthesizer+orchestrator+e2e): 150/150. Suite completa `--no-file-parallelism`: **534/534** (521 previos + 13 nuevos).

### Archivos

- `backend/src/schemas/agentInterpretation.schema.ts` (modificado: `commitmentFilterHints.status` ampliado, `+statusBasis`)
- `backend/src/services/agentInputInterpreter.service.ts` (modificado: prompt + `STATUS_HINT_MAP` + `mapPayloadToInterpretation`)
- `backend/tests/agentInputInterpreter.test.ts` (+13 tests, fixtures existentes actualizadas)
- `docs/M-1D1-LLM-INPUT-INTERPRETER.md` (este apéndice)

Sin cambios en M-1C/retrieval, `agentContextBuilder.service.ts`, `agentResponseSynthesizer.service.ts`, endpoint/orchestrator M-1F, mobile, legacy AI, account deletion, producción.

### Riesgos

- La distinción explicit/implied sigue siendo un juicio del modelo, no una regla mecánica verificable de forma independiente — un modelo diferente o una versión futura de `gpt-4o-mini` podría declarar `statusBasis` de forma distinta para la misma frase. Mitigado (no garantizado) por el prompt explícito y por el hecho de que la normalización post-LLM sigue siendo la barrera real (nunca se aplica status sin `statusBasis`, pase lo que pase el modelo declare como valor).
- El hallazgo de M-1F.1 sobre status por defecto queda RESUELTO por este ticket — se actualiza esa nota como cerrada, no como pendiente.

### Staging

No aplica — sin schema de base de datos nuevo, sin migración.

### Producción

No tocada.

### Recomendación

M-1D.4 queda aprobado local. El guard de "canonical dominance" de M-1F.1 ahora tiene efecto práctico real en el escenario que lo motivó. Antes de una futura certificación en staging: recertificar el Caso K de `docs/M-1F-S` con la consulta original sin señal de estado explícita (`"¿Qué pasó con el compromiso del regalo?"`), que ahora debería funcionar correctamente sin necesitar la palabra "cancelado" en la pregunta.

M-1D.4 STATUS SEMANTICS HARDENED — LISTO PARA CIERRE FIDELITY
