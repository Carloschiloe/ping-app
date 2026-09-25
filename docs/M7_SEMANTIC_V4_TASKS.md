# M-7 Semantic V4 — Fase 1

Estado: implementación local aislada en `codex/m7-semantic-benchmark`. Run 9 permanece congelado y no se repite.

## Evidencia y tareas

- [x] Estado inicial auditado — `git status --short --branch`, refs protegidas y diff contra `origin/codex/staging-beta`; worktree aislado limpio antes de editar.
- [x] Baseline Run 9 registrado — Run `36059353916`, evaluación `e8b94e7`; 150 casos, batería SHA-256 `5fda1888b7c37ca04348a966161ed89424f1f719a4b3d80935dd0a87c4c40168`; no se modificó el artefacto.
- [x] CI diagnosticado — `npm ci` PASS; baseline offline documentado: build fuente PASS con `tsc --noEmit`, 2190 PASS/13 FAIL; fallos clasificados como fetch externo/mocks y deuda legacy, no atribuidos automáticamente a V4.
- [x] CI limpio o baseline diferencial demostrado — pruebas V4 aisladas, TypeScript y baseline comparativo documentados; el build con emisión requiere un directorio de salida escribible en este sandbox y queda pendiente de ejecución autorizada.
- [x] Benchmark usa prompt/schema real — `m7SemanticFrontier.real.test.ts` inyecta sólo `OpenAiSemanticModel(modelo)`, reutilizando prompt, Structured Outputs, parser y normalizador del productor runtime.
- [x] Fixtures calibrados — F08, F23 y F25 reciben contexto explícito; F10 y F16 quedan como incertidumbre segura sin contexto, evitando inventar acciones o referentes.
- [x] Contrato V4 compartido — `canonicalSemanticProducer.service.ts` exporta prompt, schema estricto, hash y parser; transporte de slots se normaliza a la forma canónica.
- [x] Shadow flag implementado — `PING_SEMANTIC_V4_SHADOW=true`, sólo `local`/`staging` y bloqueado si `NODE_ENV=production`.
- [x] Shadow OFF probado — `tests/m7SemanticShadowRuntime.test.ts`; no se llama V4 cuando está apagado.
- [x] Shadow ON probado — el mismo test verifica llamada, desacuerdo estructurado y ausencia de contenido crudo en telemetría.
- [x] Failure isolation probada — proveedor fallido y timeout producen telemetría, sin romper el contrato del legacy.
- [x] No side effects probado — el shadow sólo devuelve métricas; no contiene plan, autorización, ejecución, persistencia ni mutación de dialogue state.
- [x] Production guard probado — la combinación `PING_SEMANTIC_V4_SHADOW=true` + `NODE_ENV=production` permanece deshabilitada.
- [x] Legacy dependency map actualizado — `M7_SEMANTIC_V4_MIGRATION_MAP.md` identifica callers y clasifica heurísticas lingüísticas frente a invariantes Core.
- [x] Characterization tests — `tests/m7SemanticLegacyCharacterization.test.ts` fija los overrides legacy actuales sin presentarlos como arquitectura objetivo.
- [x] V4/Core boundary auditada — V4 sólo produce hechos; resolución canónica, permisos, autorización, planner y ejecución siguen fuera del productor.
- [ ] Full CI final — pendiente ejecutar con build emisor en directorio escribible y revisar los fallos legacy ya identificados.
- [ ] Benchmark real — pendiente `M7_FRONTIER_REAL_LLM=1` con proveedor/modelo autorizado; no se simula ni se declara resultado.
- [ ] API_BOUNDARY_REACHED — se marcará sólo tras completar las validaciones locales técnicamente posibles.

## Baseline diferencial no atribuido a V4

La ejecución offline con placeholders seguros produjo 2190 tests PASS, 13 fallos y 19 pendientes. Los fallos observados fueron llamadas de retrieval que escaparon desde mocks incompletos y dos expectativas legacy (`plan` frente a `clarification`). No se marcaron como regresión V4 sin comparación contra la base.

## Seguridad

El shadow no gobierna routing, objetivo, plan, autorización, ejecución, estado ni respuesta. La batería real no se ejecuta desde esta fase local y no se usan API keys en el repositorio, documentación ni chat.
