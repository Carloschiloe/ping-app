# Agent Fidelity Hardening (M-1F.1)

Corrige dos fallos reales observados en la certificación de staging (`docs/M-1F-S`): (A) atribución incorrecta de commitments a una persona no resuelta, y (B) prioridad canónica insuficiente frente a evidencia histórica. Ambos son guards estructurales y determinísticos añadidos sobre M-1D (Context Builder) y M-1E (Synthesizer) — ningún cambio de M-1C, sin fuzzy, sin tools, sin producción.

## Causa raíz — atribución de persona (Caso A)

`resolvePerson` hace match EXACTO de nombre normalizado (`"Laura"` ≠ `"Laura Test"`). Cuando un `personHint` explícito no resolvía a nadie (0 candidatos, no ambiguo), el context builder no hacía NADA especial: `resolvedPersonId` quedaba `undefined` y `retrieveCommitments`/`retrieveMessages` se ejecutaban igual, sin `personId` — es decir, como si el usuario nunca hubiera mencionado a nadie. La síntesis, viendo commitments reales sin ningún vínculo verificado con la persona preguntada, los atribuía de todas formas.

## Comportamiento para persona no resuelta

Se distinguen 3 casos, ya existentes en el tipo `PersonResolutionResult` pero antes sólo 2 tenían efecto:

| Caso | `resolved` | `ambiguous` | Antes | Ahora |
|---|---|---|---|---|
| A) no existe/no resuelve | `null` | `false` | sin efecto (bug) | `needsClarification`, `reason:'person_ambiguous'`, `candidates:[]` |
| B) ambiguo | `null` | `true` | `needsClarification` ya correcto | sin cambios |
| C) resuelto | objeto | `false` | `retrieveCommitments({personId})` | sin cambios |

## Retrieval-plan guard

`personScopeBlocked = interpretation.personHints.length > 0 && !resolvedPersonId` — cuando es `true`, `retrieveCommitments`/`retrieveMessages` se tratan como vacías (nunca se ejecutan sin filtro de persona) y se registra un paso `personScopeGuardSkipped` en `retrievalPlan` para observabilidad. Esto es defensa en profundidad: el mecanismo YA seguro de `needsClarification` (prioridad absoluta en `deriveStatus`, M-1E) garantiza que la respuesta final nunca use `context.commitments` para el caso ambiguo o no-resuelto — pero antes de este ticket, un commitment SÍ llegaba a `context` (nunca al usuario, gracias a la plantilla determinística de clarificación) en el caso ambiguo, y en el caso no-resuelto NO HABÍA NINGÚN GUARD, así que el bug real ocurría exactamente ahí.

## No fuzzy

No se implementó ningún matching parcial/fuzzy de nombres (`"Laura"` seguirá sin resolver contra `"Laura Test"`). La corrección es sobre QUÉ PASA cuando no resuelve, no sobre mejorar la resolución en sí — exactamente lo pedido (sección 3 del ticket).

## Causa raíz — prioridad canónica (Caso K)

El prompt de síntesis (M-1E) YA instruye que un commitment canónico pesa más que un mensaje histórico ("commitments... always outweigh messages... when they conflict"), pero es una instrucción, no una garantía. En staging real, el modelo produjo un claim basado ÚNICAMENTE en un mensaje histórico ("Se entregó el regalo el viernes") sin mencionar que el commitment relacionado (`status:'cancelled'`) estaba cancelado.

## Canonical dominance — guard estructural

`enforceCanonicalDominance(claims, context, allowedSourceRefs, language)`, determinístico, ejecutado sobre los claims YA validados contra el boundary de evidencia (M-1E.1), antes de ensamblar `answer`:

1. Para cada commitment en `context.commitments` que NINGÚN claim citó directamente:
2. Si el título del commitment comparte al menos una palabra sustantiva (≥4 caracteres, sin diacríticos) con el texto de un claim que sólo cita evidencia no-commitment (mensaje/evento/transcript) — hay solape temático sin cita canónica.
3. Se AGREGA (nunca reemplaza ni elimina el histórico) un claim adicional, 100% determinístico, con el estado vigente real (`status` serializado a una etiqueta ES/EN), citando el commitment directamente.
4. La cita usada es la del `allowedSourceRefs` efectivamente serializado (M-1E.1) — si el commitment no sobrevivió el boundary de evidencia, nunca se inventa una referencia.

Nunca es fact-checking semántico general (límite explícito del ticket y de M-1E.1) — es una regla angosta y mecánica: "si el tema se menciona sin su commitment, refuerza con el estado real."

## Claim validation / regla de citas

No se implementó una validación previa que EXIJA `sourceType=commitment` en cualquier claim que "hable de estado" (sección 10 del ticket lo ofrecía como alternativa) — la vía elegida (agregar, no exigir/rechazar) es más segura: nunca descarta un claim válido del modelo por no cumplir una regla de forma, sólo complementa. Se documenta como decisión de diseño (sección 6, "no copiar literalmente si hay diseño mejor").

## Synthesis input grouping

Evaluado (sección 8) y NO implementado: agrupar evidencia por entidad (`{canonical, history}`) habría requerido reestructurar `SerializedContext` y el prompt — el guard post-validación logra la MISMA garantía (el estado vigente siempre llega al usuario cuando hay solape temático) sin tocar el payload ni el prompt, con superficie de cambio mínima. Documentado como alternativa descartada, no como pendiente.

## Current status serialization

Sin cambios — ya incluía `status`/`dueAt`/`resolvedAt`/`resolutionResult`, ya en el primer bloque del payload (orden: commitments → events → messages → transcriptions → attachments). Revalidado, no modificado.

## Tests — persona

`agentContextBuilder.test.ts` (+2, 47 en el archivo): personHint con 0 candidatos → `needsClarification`/`person_ambiguous`/`candidates:[]`, `retrieveCommitments`/`retrieveMessages` NUNCA llamados, commitments A (relacionado) y B (no relacionado) nunca llegan a `context` ni se atribuyen; personHint resuelto normalmente → sin cambios de comportamiento (regresión negativa explícita).

## Tests — canonical

`agentResponseSynthesizer.test.ts` (+3, 43 en el archivo): reproduce EXACTAMENTE el bug real (claim sólo-mensaje + commitment cancelado con solape léxico) → el claim histórico se conserva Y se agrega el claim canónico citando el commitment; el modelo ya citando el commitment directamente → sin duplicado; un commitment fuera del boundary de evidencia serializado → nunca se inyecta una cita inventada (test unitario directo de `enforceCanonicalDominance`).

## Real provider smoke

10 casos sintéticos (5+5, sin datos reales, sin staging) contra Postgres local desechable + `gpt-4o-mini` real: **10/10 correcto**. Caso A: 5/5 `needs_clarification`, nunca atribuyó los 2 commitments de fixture (uno relacionado con "Laura Test", otro sin relación) a la "Laura" no resuelta. Caso K: 5/5 `answered`, mencionando explícitamente "cancelado", citando el commitment real.

### Hallazgo adicional descubierto durante la verificación — RESUELTO en M-1D.4

Al reproducir el Caso K con la consulta literal `"¿Qué pasó con el compromiso del regalo?"` (sin palabra de estado explícita), se descubrió que `LlmInputInterpreter` infiere `commitmentFilterHints.status:"open"` por defecto para prácticamente CUALQUIER `commitment_query`, incluso sin ninguna señal de estado en el texto — esto excluye el commitment cancelado de `retrieveCommitments` ANTES de que la síntesis pueda considerarlo, dejando `context.commitments` vacío y por lo tanto sin nada que el guard de dominancia canónica pueda reforzar. Se intentó una corrección determinística (mismo patrón que M-1D.3: descartar el status inferido si el input no contiene palabras de `OPEN_STATUS_KEYWORDS`/`CLOSED_STATUS_KEYWORDS`), pero **rompió un test ya certificado** (`"Did I promise Daniel anything for this week?"` → el modelo infiere correctamente `status:'open'` sin usar la palabra literal "pending"). La distinción entre "el modelo infirió correctamente un estado implícito" y "el modelo aplicó un default incorrecto" no es resoluble con un chequeo de palabras clave sin caer en fact-checking semántico general (prohibido explícitamente, sección 3/17) — **se revirtió el cambio** en este ticket.

**Resuelto en `docs/M-1D1-LLM-INPUT-INTERPRETER.md` (apéndice M-1D.4)**: en vez de un verificador externo, se agregó `statusBasis` (`"explicit"|"implied"|null`) como campo declarativo del propio modelo — `status` se descarta si `statusBasis` es `null`, sin importar el valor. Certificado 50/50 contra proveedor real (10 inputs × 5 corridas) y 11/11 en la regresión end-to-end crítica (la consulta original del Caso K, sin ninguna palabra de estado, ahora sí trae el commitment cancelado a contexto y la síntesis reporta correctamente "cancelado").

## Regresión

`npx tsc --noEmit` limpio. Suite dirigida (interpreter+context builder+synthesizer+orchestrator+e2e): 137/137. Suite completa `--no-file-parallelism`: **521/521** (516 previos + 5 nuevos). `agentEndToEnd.test.ts` mostró un timeout de hook aislado en una corrida (flakiness ambiental ya documentada desde M-1D.1 — módulo Express real cargándose junto a otros archivos), reproducido limpio (7/7) al correrlo solo o con timeout ampliado — no relacionado con estos cambios.

## Account deletion (nota, no resuelta)

Confirmado desde `docs/M-1F-S`: perfiles que enviaron mensajes no pueden eliminarse físicamente bajo el diseño actual (`messages.sender_id` con `ON DELETE SET NULL` viola `messages_origin_check`; `messages`/`conversations` sólo soportan tombstone). **No se resuelve en este ticket** — se reitera la recomendación de una tarea futura dedicada: ACCOUNT-LIFECYCLE / GDPR / anonymización.

## Archivos

- `backend/src/services/agentContextBuilder.service.ts` (modificado: guard de atribución de persona)
- `backend/src/services/agentResponseSynthesizer.service.ts` (modificado: `enforceCanonicalDominance`)
- `backend/src/types/agentContext.ts` (modificado: `RetrievalPlanStep.step` +`'personScopeGuardSkipped'`)
- `backend/tests/agentContextBuilder.test.ts` (+2 tests)
- `backend/tests/agentResponseSynthesizer.test.ts` (+3 tests)
- `docs/M-1F.1-AGENT-FIDELITY-HARDENING.md` (este archivo)

Sin cambios en `retrieval.service.ts`/M-1C, `agentInputInterpreter.service.ts`/M-1D.1 (el intento de fix ahí fue revertido), M-1F endpoint/orchestrator/controller, mobile, legacy AI, embeddings, memoria, producción.

## Riesgos

- El guard de atribución de persona bloquea retrieval person-scoped para CUALQUIER `personHint` que no resuelva, incluyendo falsos positivos de extracción heurística (ej. `DeterministicInputInterpreter` puede extraer "Proyecto Aurora" como personHint por su patrón de cue-word + capitalización) — documentado y aceptado explícitamente desde M-1D/M-1C ("un falso positivo... simplemente no resuelve a nadie, no rompe nada"); con este ticket, ahora SÍ tiene un efecto (fuerza `needsClarification`). Verificado exhaustivamente que esto NO regresiona ningún test existente (incluyendo el caso específico de "Proyecto Aurora", que se testea contra el intérprete directamente, no contra `buildAgentContext`) — pero es un tradeoff real: consultas de tema con nombres propios ambiguos ahora piden aclaración con más frecuencia que antes, a favor de nunca atribuir incorrectamente.
- El guard de dominancia canónica usa solape léxico simple (palabras ≥4 caracteres) — puede, en teoría, disparar por una coincidencia de palabra sin relación temática real (ej. dos commitments distintos que comparten una palabra común en el título). El efecto en ese caso es agregar una oración ADICIONAL, siempre verídica (nunca contradice ni inventa), citando un commitment real y autorizado — nunca puede producir una afirmación falsa, sólo potencialmente una mención poco relevante.
- Hallazgo del status-hint por defecto (ver arriba) queda sin resolver — limita la efectividad práctica del guard de dominancia canónica en consultas neutrales sin palabra de estado explícita.

## Staging

No aplica — sin cambios de schema, sin migración. Recertificación end-to-end en staging real queda pendiente como un ticket separado (M-1F-S ya certificó la arquitectura; este ticket corrige fidelidad, la recertificación confirmaría ambos fixes en el entorno real).

## Producción

No tocada.

## Recomendación

M-1F.1 queda aprobado local. Antes de la próxima certificación de staging: considerar una tarea dedicada para el hallazgo de status-hint por defecto (el mayor riesgo pendiente para la fidelidad de "canonical dominance" en el mundo real), y decidir si vale la pena recertificar M-1F-S completo en staging con ambos fixes aplicados o basta con una recertificación dirigida a los Casos A y K específicamente.

M-1F.1 AGENT FIDELITY HARDENED — LISTO PARA RECERTIFICAR STAGING
