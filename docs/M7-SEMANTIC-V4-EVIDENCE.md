# Semantic V4 — evidencia histórica y continuidad

Estado: benchmark histórico congelado; no repetir ni usarlo para reescribir expectativas.

## Benchmark GPT-5.6 Sol

- Modelo: `gpt-5.6-sol`.
- Ejecución: una sola corrida real, 30 casos congelados.
- Resultado estricto: 28/30 PASS (93.33%); F16 y F25 requieren adjudicación independiente.
- Proveedor: 30 solicitudes aceptadas; 0 errores HTTP/red/timeout; 0 refusals; 0 `schema_invalid`.
- Seguridad: 0 writers, 0 persistencia, 0 tools y 0 side effects.
- La corrida anterior de 4/30 fue `INVALID_TECHNICAL_RUN` por incompatibilidad de parámetros y no se mezcla con esta evidencia.
- Los fixtures, expectativas, prompt, schema, parser, normalizador y scoring permanecen sin cambios después del resultado.

Métricas registradas de la corrida válida: 169342 ms acumulados, media 5644.73 ms, mediana 5518.5 ms, p95 7929 ms; 41031 tokens de entrada, 9245 de salida, 4702 de razonamiento y 50276 totales.

## Casos que requieren adjudicación

- **F16**: la expresión usa una referencia ambigua (“eso”). El modelo conservó la ambigüedad mediante `read_request`, `ambiguityFields` para referencia e información solicitada, sin inventar una entidad. Se conserva como `REQUIRES_INDEPENDENT_ADJUDICATION`; no se modifica el fixture.
- **F25**: el modelo conservó el objetivo abierto, la referencia y los slots temporales “pasado mañana”/“en la tarde”, pero clasificó el turno como `slot_answer`. Se conserva como `REQUIRES_INDEPENDENT_ADJUDICATION`; no se modifica el fixture.

## F10 y límite de tokens

F10 no produjo contenido válido: `finish_reason=length`, `max_completion_tokens=450`, 450 tokens de razonamiento, contenido ausente y fallback por salida truncada. Es una limitación de presupuesto observada en esa corrida, no una conclusión semántica sobre el modelo.

Recomendación offline, no implementada ni validada con una llamada adicional: evaluar un límite operativo de `1024` tokens de completion para GPT-5.x reasoning. La justificación es dejar espacio tanto para razonamiento interno como para el objeto estructurado visible. No se debe cambiar el prompt ni elevar el límite sólo para maquillar un resultado; debe medirse en una corrida autorizada posterior y separada.

## Cambios locales auditados

| Elemento | Clasificación | Motivo |
|---|---|---|
| Diagnósticos sanitizados del productor V4 | KEEP | Observabilidad segura de proveedor, schema, parser, normalización, fallback y uso de tokens. |
| Política de parámetros GPT-5.x | KEEP | Compatibilidad de transporte: omite `temperature`/`max_tokens` y usa `max_completion_tokens`; no cambia semántica. |
| Tests de contrato, diagnostics, compatibility y shadow | KEEP | Regresiones offline reproducibles y gates explícitos. |
| Frontier real-model test | KEEP / TEST-ONLY | Sólo corre con bandera explícita y no tiene efectos de dominio. |
| Probe unitario único de GPT-5.6 Sol | REMOVE | Artefacto temporal de la investigación ya consolidada en esta evidencia. |
| Helper de evidencia sanitizada | KEEP / TEST-ONLY | Reutilizable para probes autorizados; no guarda prompts, conversaciones ni secretos. |

No se cambiaron routing, Core, prompt, schema, parser, normalizador, fallback ni producción.

## Continuidad preparada

Se creó `backend/tests/fixtures/m7SemanticV4ContinuityGateCases.ts` con 10 escenarios nuevos, derivados de las familias de riesgo de Run 9 pero con redacción nueva:

- single-turn: R017, W028, W038 y W059 como familias de referencia;
- multivuelta: F004, F005, F008, F020, F022 y F030 como familias de confirmación, negación, corrección, referencia, slot y cambio de tema;
- cobertura: READ por entidad/mensaje/persona, WRITE, confirmación, rechazo, negación, corrección temporal, referencia implícita, objetivo abierto y cambio de intención;
- cada caso incluye el resultado semántico V4 esperado y el contrato de resolución Core esperado;
- no copia prompts de la batería de 30 ni agrega regex, keywords o frases productivas.

La prueba `m7SemanticV4ContinuityGate.test.ts` sólo ejecuta normalización V4 con datos autoritativos offline y transiciones de `AgentDialogueStateService` en memoria. Es una preparación segura: no llama al proveedor, no ejecuta writers y no afirma que la ruta general ya sea V4. La ejecución real V4→Core queda pendiente de la frontera de integración correspondiente.

## Validación de esta consolidación

- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: PASS.
- Contrato V4, diagnostics, compatibility, shadow y la batería de continuidad: 24/24 PASS.
- `agentDialogueState.test.ts`: 36/36 PASS.
- Las suites de continuidad que importan la aplicación completa no fueron certificables en este entorno: `agentDialogueContinuation.test.ts` falla al importar `supabaseAdmin` por ausencia de variables de prueba y los fallos posteriores del mock son derivados de esa carga incompleta. No se usaron credenciales ni se intentó red externa.
- `git diff --check`: PASS.
- Llamadas OpenAI adicionales en esta consolidación: 0. El benchmark de 30 casos no se repitió.
