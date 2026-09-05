# Agent Response / Synthesis Layer Contract (M-1E)

Transforma un `AgentContext` ya autorizado y recuperado (M-1D/M-1D.1, sobre M-1B/M-1C) en una `AgentResponse` natural, trazable, para el usuario. Servicio interno — sin ruta, sin controller, sin tocar `PingAIScreen`/mobile/`ai.controller.ts` legacy.

## Auditoría

Reutiliza el mismo patrón OpenAI (`chat.completions.create` + `response_format:json_object`) y la misma librería `zod` ya auditadas y usadas en M-1D.1. Ningún archivo de legacy AI tocado.

## Arquitectura

```
AgentContext (ya autorizado, M-1D)
  → deriveStatus(context)  [SIEMPRE determinístico — sección 6]
  → si needs_clarification / no_evidence / capability_gap:
        plantilla determinística con datos reales de context — CERO llamadas al modelo
  → si answered:
        serializeContextForSynthesis (compacto, acotado)
        → prompt (contrato + contenido recuperado separados)
        → AgentSynthesisModel.synthesize() [1 intento, retry x1 si falla]
        → validateClaimsAgainstContext (integridad referencial contra provenance)
        → assembleAnswerFromClaims (backend arma el answer, NUNCA el modelo)
        → si 0 claims sobreviven: fallback estructurado (sin prosa del modelo)
→ AgentResponse
```

## Decisión arquitectónica central (secciones 6, 35 — "no copiar literalmente si hay diseño mejor")

Dos simplificaciones deliberadas respecto al diseño conceptual del ticket, ambas reducen la superficie de alucinación a costo cero:

1. **`status` nunca lo decide el modelo.** Se calcula 100% determinísticamente desde `AgentContext.needsClarification`/`evidenceFound`/`capabilityGaps` ANTES de invocar cualquier modelo. El modelo nunca ve la posibilidad de "decidir" que hay evidencia cuando no la hay.
2. **El modelo nunca produce `answer` directamente — sólo `claims: [{text, sourceRefs}]`.** El backend ENSAMBLA `answer` uniendo el texto de los claims que sobreviven la validación contra `context.provenance`. Esto evita por completo el problema difícil de "¿qué frase del `answer` corresponde a qué claim, si una referencia resulta inválida?" — si un claim no tiene soporte real, se descarta ENTERO, y su texto nunca llega al usuario porque nunca existió una prosa independiente que pudiera conservarlo accidentalmente.

Consecuencia práctica: **3 de los 4 estados (`needs_clarification`, `no_evidence`, `capability_gap`) nunca llaman al modelo** — se resuelven con plantillas determinísticas usando datos reales de `context` (nombres de candidatos, tipo de gap). Cero alucinación posible en esos 3 caminos, cero costo/latencia extra (verificado en smoke real: 5 de 8 casos sintéticos usaron el modelo, 3 no).

## Input

`AgentSynthesisInput{input, context, locale?, channel?}` — sin `actorUserId` (no se necesita: la síntesis nunca vuelve a consultar nada, `context` ya es la única fuente de verdad) y sin aceptar ningún ID adicional.

## Output

`AgentResponse{status, answer, claims, citations, followUp?, diagnostics?}`. `citations` es la deduplicación agregada de `claims[].sourceRefs` — conveniencia para un caller que no necesite el detalle por-claim.

## Status model

Ver "Arquitectura" — prioridad de cálculo: `needsClarification` > (`!evidenceFound && capabilityGaps.length>0`) > `!evidenceFound` > `answered`. Un `capabilityGap` que coexiste con evidencia real de OTRA fuente no bloquea `answered` — el gap puede mencionarse dentro de la respuesta si es relevante, pero no impide responder con lo que sí se encontró.

## Provider abstraction

`AgentSynthesisModel{modelName, synthesize(request):Promise<string>}` — mismo patrón que M-1D.1's `AgentInputModel`. `OpenAiAgentSynthesisModel` es la única implementación real; tests usan exclusivamente fakes.

## Model choice

`AGENT_SYNTHESIS_MODEL` (env var), default `'gpt-4o-mini'` sólo para desarrollo si no se configura — nunca hardcodeado como definitivo, nunca cambia el proveedor global de Ping. `temperature=0.2` (ligeramente más alto que el interpreter de M-1D.1, ya que hay más margen de fraseo natural en una sola oración por claim, pero sigue siendo composición, no creatividad libre), `max_tokens=500`, `timeoutMs=8000`.

## Prompt

Separación explícita "SYSTEM CONTRACT" (instrucciones) vs "RETRIEVED CONTENT" (datos) — verificado contra el modelo real que un mensaje con texto tipo injection ("Ignore previous instructions...") se trata como contenido citable, nunca como comando. Incluye: nunca usar conocimiento externo para hechos personales, citar sólo IDs presentes, prioridad commitment-vigente-sobre-mensaje-histórico, nunca describir un commitment `resolved`/`cancelled`/`rejected` como pendiente, distinguir "hablamos de" vs "acordamos", attachments son sólo metadata, responder en el idioma del usuario, output JSON estricto.

## Context serialization

`serializeContextForSynthesis` — sólo campos necesarios por tipo (commitments: id/title/status/dueAt/resolvedAt/resolutionResult/owner/assignee; messages: id/text/senderId/createdAt; transcriptions: id/text/completedAt; attachments: id/kind/filename; events: id/commitmentId/eventType/status/createdAt). Nunca el objeto `AgentContext` completo.

## Context budget

`MAX_SYNTHESIS_CONTEXT_CHARS=6000` (aparte del budget de M-1D sobre CUÁNTOS items se recuperan). Recorte por prioridad cuando se excede: `attachments → transcriptions → messages → events`, eliminando ITEMS enteros (nunca partiendo uno) — `commitments` nunca se recorta (fuente canónica).

**Corrección M-1E.1 (bug real de frontera arquitectónica)**: la versión original de M-1E validaba claims contra `context.provenance` COMPLETO — es decir, contra TODO lo autorizado y recuperado, no contra lo que efectivamente sobrevivió el recorte de budget y llegó al prompt. Esto significaba que, conceptualmente, un item legítimamente truncado por budget (autorizado, pero nunca mostrado al modelo) podía sobrevivir la validación de un claim si el modelo "adivinaba" su id — improbable con un UUID real, pero una frontera de diseño incorrecta de todos modos. Corregido: `serializeContextForSynthesis` ahora devuelve, además del payload, la `allowedSourceRefs` — la lista EXACTA de referencias citables, calculada DESPUÉS del recorte, nunca antes. La validación de claims usa exclusivamente esta lista, nunca `context.provenance`.

## Claim model

`{text, sourceRefs: Citation[]}` — sin `answer` separado (ver "Decisión arquitectónica"). Máximo 10 claims, máximo 10 refs por claim, texto acotado a 500 caracteres.

## Claim validation

`validateClaimsAgainstAllowedRefs(claims, allowedSourceRefs)` — integridad de FRONTERA DE EVIDENCIA (nunca semantic fact-check — ver "Semantic validation limitation" abajo, límite explícito del ticket M-1E.1): sourceId no presente en `allowedSourceRefs` → claim afectado descartado; sourceType incorrecto para un id real → descartado; refs duplicadas dentro de un claim válido → deduplicadas.

**Política de refs mixtas endurecida (M-1E.1)**: si un claim tiene VARIAS refs y AL MENOS UNA no está en la allowlist, el claim se descarta ENTERO — no se "arregla" quitando sólo la ref mala (comportamiento de la versión original de M-1E, ahora corregido), porque no hay forma de saber cuánto del texto del claim dependía específicamente de esa evidencia. Si TODOS los claims quedan sin soporte, la respuesta completa se trata como fallo y dispara retry/fallback.

**El retry reutiliza exactamente la misma `allowedSourceRefs`** — nunca se vuelve a serializar ni se amplía el contexto entre intentos para "conseguir que pase" (verificado con un test donde ambos intentos citan la misma ref truncada y ambos fallan igual).

## Citations invariant

Garantía central de M-1E.1, verificada con tests explícitos:

```
response.citations ⊆ allowedSourceRefs ⊆ context.provenance (autorizado)
```

Nunca sólo `citations ⊆ provenance` — un item recuperado y autorizado que quedó fuera del prompt por budget nunca es citable, sin importar que exista en `context.provenance`. Esto aplica IGUAL en los tres caminos que producen `citations`: el camino LLM exitoso, el camino de fallback estructurado (que ahora usa `allowedSourceRefs` directamente, no `context.provenance` — ver "Fallback"), y — trivialmente — los 3 caminos determinísticos, que nunca citan nada (`citations: []`).

## Semantic validation limitation (sección 19 — no exagerar la garantía)

El validador de claims certifica **integridad referencial** (¿esta evidencia fue efectivamente mostrada al modelo?), **nunca corrección semántica** del contenido del claim. Ejemplo explícito: si un mensaje histórico dice "lo entregamos el viernes" y el commitment vigente tiene `status=cancelled`, y el modelo produce un claim "Está pendiente para el viernes" citando SÓLO el mensaje (una ref válida, realmente serializada) — el validador **no puede detectar que esto es semánticamente falso**, porque la ref en sí es 100% legítima. Esto no se resuelve con un fact-checker semántico (explícitamente fuera de alcance, sección 20) — se mitiga (no se garantiza) con la instrucción de prompt reforzada en M-1E.1: "si un commitment es directamente relevante a la pregunta, preferir sus campos vigentes sobre un mensaje/transcript más antiguo para ese mismo hecho" y "nunca describir un commitment resuelto/cancelado/rechazado como pendiente". Es guía para el modelo, no una regla mecánica verificable — documentado explícitamente para no fingir una garantía que el sistema no puede dar hoy.

## Provenance

Cada claim expuesto siempre trae al menos una `sourceRef` verificada contra `allowedSourceRefs` (el subconjunto realmente enviado, ver "Citations invariant"). El fallback estructural usa `allowedSourceRefs` directamente como `citations` (sin pasar por el modelo, y sin usar `context.provenance` completo — ver "Fallback").

## Source type metadata (sección 12)

No se inventó una taxonomía nueva de "canonical/historical" — `sourceType` (ya existente desde M-1B/M-1C: `commitment`/`commitment_event`/`message`/`transcription`/`attachment`/`person`) ya distingue esto estructuralmente: `commitment` es siempre el estado vigente/canónico; `commitment_event` es histórico por definición (registro append-only de cambios de estado); `message`/`transcription` son evidencia histórica cruda; `attachment` es referencia de metadata. El serializer preserva esta distinción por construcción (cada tipo va en su propia clave del payload), no sólo por posición visual en el prompt.

## Answer generation

El backend ensambla `answer` uniendo los `text` de los claims validados. Verificado contra el modelo real (smoke): natural, breve, sin recitar JSON, sin mencionar "RetrievalResult"/nombres de tabla.

## Conflicting sources

Prompt instruye explícitamente la prioridad (commitment vigente > mensaje histórico) y el orden de serialización refleja esa misma prioridad (commitments primero). No se implementó un mecanismo mecánico de "detección de conflicto" — es responsabilidad del modelo guiado por el prompt, dentro del límite explícito del ticket para el validador (sección 34: sin semantic fact-check).

## Commitments

Serializer expone `status`/`dueAt`/`resolvedAt`/`resolutionResult` explícitamente. **Certificado contra el modelo real** (caso I del smoke): un commitment `cancelled` fue descrito correctamente como cancelado, nunca como pendiente.

## Messages

Prompt distingue explícitamente "hablamos de X" (mención) vs "acordamos X" (sólo si hay commitment canónico que lo respalde). Certificado (caso C del smoke): un mensaje informal sobre un viaje se describió como "hablamos de", nunca como un acuerdo.

## Transcriptions

Sin disclaimers forzados en cada respuesta — el prompt no exige un aviso de "esto es una transcripción automática" salvo que sea relevante, evitando ruido innecesario (ticket sección 22 explícitamente lo permite: "no meter disclaimers innecesarios siempre").

## Attachments

Prompt prohíbe explícitamente afirmar contenido interno de un documento no extraído. **Certificado contra el modelo real** (caso E del smoke): "Te enviaron un documento llamado 'documento_prueba.pdf'" — nunca afirmó qué dice el documento.

## Ambiguity

`buildClarificationResponse` — determinístico, usa `context.clarification.candidates` reales (nunca inventados). Distingue: candidatos reales presentes → pregunta con opciones concretas; `unresolved_pronoun` sin candidatos → pide que se especifique el nombre, sin ofrecer opciones falsas; `time_ambiguous`/`topic_too_broad` → preguntas genéricas apropiadas.

## No evidence

`buildNoEvidenceResponse` — mensaje neutral fijo, honesto, sin inferir ("no encontré..." nunca "probablemente no..."). Determinístico, cero riesgo de sobre-especulación.

## Capability gaps

`buildCapabilityGapResponse` — mapeo explícito de cada `CapabilityGapType` (M-1D) a una explicación en lenguaje natural, nunca el string técnico del enum. **Certificado contra el modelo real** (caso H): "I can search audio within a specific conversation, but I can't yet search across all your conversations at once" — nunca "not found" (que habría sido una mentira).

## Language

Camino LLM: el prompt le pide al modelo responder en el idioma del input directamente (no hay detección de idioma duplicada del lado del backend). Camino determinístico (3 de 4 estados): `detectTemplateLanguage` — heurístico mínimo ES/EN, sin hardcodear español como default fijo del servidor (empate o ausencia de señal cae a español sólo como último desempate documentado, no como asunción por defecto). Certificado con inputs en ambos idiomas (unitario) y con el modelo real respondiendo en inglés para una pregunta en inglés (caso D del smoke).

## Channel

`channel` viaja en el input pero no altera status/citations/autorización — verificado explícitamente. Sin lógica de formato específica por canal implementada en este slice (ticket permite explícitamente diferir esto: "no implementar lógica enorme por channel").

## Prompt injection

Certificado en dos niveles: unitario (fake "modelo comprometido" que intenta agregar `systemPromptLeak`/`allUserIds` — descartados por el schema, nunca aparecen en `AgentResponse`) y real (smoke no incluyó este caso específico por no gastar una llamada adicional sin valor nuevo — el mecanismo de descarte estructural ya está probado en M-1D.1 sobre el mismo patrón de schema).

## Fallback

Dos niveles: (1) retry único si JSON inválido/schema inválido/error de API/timeout/cero claims soportados, reutilizando la MISMA `allowedSourceRefs` ya calculada (nunca se re-serializa ni se amplía el contexto entre intentos); (2) si el retry también falla, fallback estructurado que nunca usa prosa del modelo — arma un resumen mínimo por conteo a partir del `payload` efectivamente serializado (no de `context` crudo, para que el conteo también respete el budget) y usa `allowedSourceRefs` directamente como `citations` (corregido en M-1E.1 — la versión original usaba `context.provenance` completo aquí, rompiendo la misma invariante que se acababa de establecer para el camino LLM; ver "Citations invariant").

## Retry

Máximo 1 retry, nunca más — verificado (exactamente 2 llamadas al modelo cuando ambos intentos fallan, nunca 3+). Nunca se reintenta por falta de evidencia (esos 3 estados ni siquiera llegan a esta lógica).

## Observability

`AgentResponseDiagnostics{synthesizerUsed, model?, durationMs, schemaValid?, claimValidationPassed?, fallbackReason?, sourceCount, retried?, serializedSourceCount?, droppedByBudgetCount?}` — los dos últimos (M-1E.1) permiten observar cuánta evidencia autorizada quedó fuera del prompt por budget, sin exponer ningún id ni contenido. Nunca el contexto completo, el prompt completo, el input íntegro, ni la respuesta cruda del modelo.

## Cost

Certificado real (smoke): de 8 casos sintéticos, exactamente 5 invocaron el modelo (los `answered`), 3 no (deterministic) — cero llamadas duplicadas, cero chain-of-thought, cero contexto infinito (acotado a `MAX_SYNTHESIS_CONTEXT_CHARS`).

## Tests

40 tests en `backend/tests/agentResponseSynthesizer.test.ts` (34 de M-1E + 6 de M-1E.1), **100% con fakes — cero red real**: schema, `deriveStatus` (las 4 combinaciones), validación de claims contra la allowlist serializada (ref inexistente, tipo incorrecto, refs duplicadas, **refs mixtas → claim completo descartado**), el **test crítico de la sección 6 del hardening** (una ref que existe en `context.provenance` pero fue truncada por budget es rechazada — este test falla con la implementación anterior de M-1E y pasa con el hardening), el invariante `citations ⊆ allowedSourceRefs`, las 12 consultas objetivo de M-1E (A-L), budget/truncamiento, fallback respetando el mismo boundary de evidencia serializada, retry reutilizando la misma allowlist, injection citando una ref fuera de la allowlist, control de costo.

## Real provider smoke

8 casos sintéticos (sin datos reales de usuario, sin retrieval, sin staging) contra el proveedor real (`gpt-4o-mini`): **8/8 dentro de tolerancia semántica, sin necesidad de ningún fix** (a diferencia de M-1D.2, que sí encontró y corrigió un problema real de schema). Hallazgos destacados: idioma respetado correctamente en ambas direcciones (ES/EN según el input), distinción "hablamos de" vs "acordamos" respetada, commitment cancelado nunca descrito como pendiente, attachment nunca descrito por contenido interno, capability gap explicado sin sonar a error técnico ni a "no encontré nada". 5 de 8 casos usaron el modelo (los `answered`), 3 no (deterministic) — confirma el diseño de costo en la práctica, no sólo en teoría.

## Archivos

- `backend/src/types/agentResponse.ts` (nuevo)
- `backend/src/schemas/agentResponse.schema.ts` (nuevo)
- `backend/src/services/agentResponseSynthesizer.service.ts` (nuevo)
- `backend/tests/agentResponseSynthesizer.test.ts` (40 tests: 34 M-1E + 6 M-1E.1)
- `docs/M-1E-AGENT-RESPONSE-SYNTHESIS.md` (este archivo, actualizado en M-1E.1)

Sin controller/ruta. Sin tocar `PingAIScreen`/mobile/`ai.controller.ts` legacy/`synthesis.service.ts`/producción/embeddings/memory derivada/tool execution/commitment o message writes.

## Riesgos

- El validador de claims certifica integridad de FRONTERA DE EVIDENCIA (¿esto se sirvió al modelo?), no corrección semántica del contenido del claim — ver "Semantic validation limitation": la prioridad commitment-vigente-sobre-histórico depende del prompt, no de un chequeo mecánico verificable (límite explícito, documentado, no un descuido ni una garantía exagerada).
- La política de "claim completo descartado ante cualquier ref inválida" (M-1E.1) puede descartar más claims de los estrictamente necesarios en un caso mixto legítimo (ref A válida + ref B truncada por budget, ambas genuinas) — tradeoff consciente a favor de seguridad: no hay forma de saber cuánto del texto dependía específicamente de la ref truncada, así que se prefiere perder un claim recuperable antes que arriesgar una afirmación parcialmente sin soporte.
- La detección de idioma para el camino determinístico es un heurístico mínimo (no una librería de detección de idioma real) — suficiente para elegir entre 2 plantillas, no generalizable a N idiomas sin trabajo adicional si se necesitara.
- `channel` no tiene lógica de formato propia todavía (deuda documentada, explícitamente permitida diferir).
- El ensamblado de `answer` por concatenación simple de `claims[].text` puede sonar ligeramente menos fluido que una prosa unificada generada por el modelo — tradeoff consciente a favor de seguridad (cero riesgo de desalineación answer/claims) sobre fluidez máxima.

## Staging

No aplica — sin schema de base de datos, sin migración.

## Producción

No tocada.

## Recomendación

M-1E queda aprobado local. Antes de conectar a una interfaz real: decidir el endpoint/ruta que expondrá `synthesizeAgentResponse` (fuera de alcance de este ticket), y evaluar si la fluidez del `answer` ensamblado por concatenación es suficiente para producción o si vale la pena una pasada de "polish" determinística adicional (sin reintroducir el riesgo de prosa no trazable).

M-1E AGENT RESPONSE SYNTHESIS APROBADO LOCAL

---

## M-1E.1 — Synthesis Evidence Boundary Hardening

Cierra la brecha arquitectónica descrita arriba en "Context budget"/"Claim validation": la validación de claims ahora ocurre exclusivamente contra `allowedSourceRefs` (la evidencia efectivamente serializada y enviada al modelo, calculada DESPUÉS del recorte por budget), nunca contra `context.provenance` completo. Ver secciones "Citations invariant" y "Semantic validation limitation" arriba para el detalle completo. Función renombrada: `validateClaimsAgainstContext` → `validateClaimsAgainstAllowedRefs`.

M-1E SYNTHESIS HARDENED — LISTO PARA CIERRE
