# M-7 Semantic V4 - Fase 1

Estado: API_BOUNDARY_REACHED en la rama aislada `codex/m7-semantic-benchmark`.
Run 9 permanece congelado y no se repite.

## Evidencia y tareas

- [x] Estado inicial auditado. Evidencia: refs protegidas, estado del worktree aislado y diff contra `origin/codex/staging-beta` verificados antes de editar.
- [x] Baseline Run 9 registrado. Run `36059353916`, evaluacion `e8b94e7`; 150 casos; bateria SHA-256 `5fda1888b7c37ca04348a966161ed89424f1f719a4b3d80935dd0a87c4c40168`.
- [x] CI diagnosticado. `npm ci` PASS; backend y mobile fueron comprobados offline con placeholders seguros.
- [x] CI limpio o baseline diferencial demostrado. Build emisor TypeScript PASS en `C:\tmp\ping-m7-semantic-v4\backend-dist`; TypeScript backend/mobile PASS; mobile 50 suites y 835 tests PASS. Los fallos backend restantes coinciden con la base `ba36e5c`.
- [x] Benchmark usa prompt/schema real. `m7SemanticFrontier.real.test.ts` inyecta solo el nombre de modelo y usa `OpenAiSemanticModel`, prompt, Structured Outputs, parser y normalizador del productor runtime.
- [x] Fixtures calibrados. F08, F23 y F25 reciben contexto explicito; F10 y F16 conservan incertidumbre segura sin inventar acciones o referentes.
- [x] Contrato V4 compartido. El productor exporta prompt, schema estricto, hash y parser; el transporte de slots se normaliza a la forma canonica.
- [x] Shadow flag implementado. `PING_SEMANTIC_V4_SHADOW=true`, solo `local`/`staging` y bloqueado con `NODE_ENV=production`.
- [x] Shadow OFF probado. El productor V4 no se llama cuando el flag esta apagado.
- [x] Shadow ON probado. Se verifica llamada, desacuerdo estructurado y ausencia de contenido crudo en telemetria.
- [x] Failure isolation probada. Fallo de proveedor y timeout generan telemetria sin romper el contrato legacy.
- [x] No side effects probado. El shadow solo devuelve metricas; no contiene plan, autorizacion, ejecucion, persistencia ni mutacion de dialogue state.
- [x] Production guard probado. La combinacion de flag activo y `NODE_ENV=production` permanece deshabilitada.
- [x] Legacy dependency map actualizado. `M7_SEMANTIC_V4_MIGRATION_MAP.md` clasifica callers y heuristicas frente a invariantes Core.
- [x] Characterization tests. Se fijan los overrides legacy actuales sin presentarlos como arquitectura objetivo.
- [x] V4/Core boundary auditada. V4 solo produce hechos; identidad canonica, permisos, autorizacion, planner y ejecucion siguen fuera del productor.
- [x] Full CI final. Backend completo: 125 suites PASS, 7 suites FAIL, 4 suites de integracion no ejecutables con placeholder; 2200 tests PASS, 13 FAIL, 19 SKIP y 18 TODO. Los fallos son `fetch failed` contra `cert.invalid` y dos expectativas legacy; la comparacion contra `ba36e5c` reproduce los mismos fallos. No se atribuyen a V4.
- [ ] Benchmark real. Pendiente `M7_FRONTIER_REAL_LLM=1` con proveedor/modelo autorizado. No se simula ni se declara resultado.
- [x] API_BOUNDARY_REACHED. La frontera local queda preparada y validada sin proveedor real ni datos reales. Se detiene aqui porque el benchmark real requiere una ejecucion autorizada con `OPENAI_API_KEY`.

## Baseline diferencial no atribuido a V4

La ejecucion offline final con placeholders seguros produjo 2200 tests PASS, 13 fallos, 19 pendientes y 18 TODO. Cuatro suites de integracion intentaron usar el placeholder Supabase y fallaron por red (`cert.invalid`). Los fallos focales restantes se reprodujeron en la base `ba36e5c`: retrieval/Auth `fetch failed` y expectativas legacy `plan` frente a `clarification`. No se modificaron estos tests para conseguir verde.

## Seguridad y alcance

El shadow no gobierna routing, objetivo, plan, autorizacion, ejecucion, estado ni respuesta. La bateria real no se ejecuta desde esta fase local y no se usan API keys en el repositorio, documentacion ni chat.

No se eliminaron componentes legacy, no se cambio el routing normal, no se hizo push, merge, deploy, migracion, cambio de staging, cambio de produccion ni cambio de credenciales.

## Evidencia de commits

- Implementacion, contrato, shadow, pruebas y mapa: `93f4f27` (`feat(m7): establish semantic v4 shadow boundary`).
- Este cierre documental se prepara como commit local separado despues de validar este archivo.
