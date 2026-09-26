# Semantic V4 — evaluación de desarrollo

Estado: evaluación separada de la batería blind; no certifica ni reinterpreta la batería blind.

## Ejecución

- Modelo: `gpt-5.6-sol`.
- Casos: 12 expresiones nuevas.
- Batería: `backend/certification/m7-v4-development-battery.v1.json`.
- SHA-256 de batería: `fbc78039149734be01980b1206f4474341bf6f3cfa0d6b0eb6092e5453e9558b`.
- Artefacto de evaluación: `backend/.m7-smoke-artifacts/development-v2-20260925/m7-v4-development-evaluation.v1.json`.
- SHA-256 del artefacto: `f77d3c5287789e099224c2b0a830cff372bf821309f2fca8b2441fe416c34dbd`.
- Outputs crudos persistidos antes del Core: `backend/.m7-smoke-artifacts/development-v2-20260925/m7-v4-development-raw.v1.ndjson`.
- SHA-256 de outputs crudos: `feb8f5efb0c2a5117999d9fa351505b63f908e6db129643402e6afb579c8df12`.

## Resultado

- Outputs normalizados: 12/12.
- Errores de proveedor, schema o parser: 0.
- `shadow_failure`: 0.
- Replay offline desde los outputs crudos: PASS, 12/12, 0 llamadas OpenAI.
- Writers, mutaciones de persistencia, tools, mensajes y memory writes: 0.

## Hallazgos semánticos

La muestra cubrió lecturas de colección, persona, mensajes y atributos; escrituras de compromiso y mensajería; corrección temporal; negación; confirmación; rechazo; y referencias implícitas.

- READ/WRITE: la clasificación fue coherente en los 12 casos.
- Continuidad: `continuationLike` y `independentObjective` se conservaron en las correcciones y referencias probadas.
- Negación: “no lo canceles” produjo `cancellation=false`; no se invirtió la intención.
- Confirmación/rechazo: se representaron como hechos semánticos (`confirmation=true` y `reject_proposal`) sin ejecutar writers.
- Incertidumbre: se conservaron campos de ambigüedad para orden, meridiem, alcance y tipo de objetivo cuando correspondía.
- Recuperación: el repositorio sintético estaba vacío; el resultado `zero_match` fue autorizado y no inventó entidades.

Esta evaluación no demuestra todavía integración general del camino `/agent/turn`, cutover de Legacy ni uso de datos reales. No se modificó la batería blind ni se usó para scoring.
