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
