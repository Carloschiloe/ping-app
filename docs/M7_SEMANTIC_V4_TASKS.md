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
- [x] Benchmark real GPT-5.6 Sol ejecutado una sola vez sobre 30 casos congelados. Resultado histórico: 28/30 strict PASS (93.33%), 2 casos pendientes de adjudicación independiente (F16/F25), 0 fallos de proveedor, 0 `schema_invalid`, 0 refusals, 0 writers, 0 persistencia y 0 herramientas. Evidencia detallada en `M7-SEMANTIC-V4-EVIDENCE.md`.
- [x] API_BOUNDARY_REACHED. La frontera local queda preparada y validada; el benchmark real quedó ejecutado y congelado sin cambiar fixtures, prompt, schema ni scoring.

## Baseline diferencial no atribuido a V4

La ejecucion offline final con placeholders seguros produjo 2200 tests PASS, 13 fallos, 19 pendientes y 18 TODO. Cuatro suites de integracion intentaron usar el placeholder Supabase y fallaron por red (`cert.invalid`). Los fallos focales restantes se reprodujeron en la base `ba36e5c`: retrieval/Auth `fetch failed` y expectativas legacy `plan` frente a `clarification`. No se modificaron estos tests para conseguir verde.

## Seguridad y alcance

El shadow no gobierna routing, objetivo, plan, autorizacion, ejecucion, estado ni respuesta. La bateria real no se ejecuta desde esta fase local y no se usan API keys en el repositorio, documentacion ni chat.

No se eliminaron componentes legacy, no se cambio el routing normal, no se hizo push, merge, deploy, migracion, cambio de staging, cambio de produccion ni cambio de credenciales.

## Evidencia de commits

- Implementacion, contrato, shadow, pruebas y mapa: `93f4f27` (`feat(m7): establish semantic v4 shadow boundary`).
- Este cierre documental se prepara como commit local separado despues de validar este archivo.

## IntegraciÃ³n V4 -> Core en shadow

- [x] Adaptador estructural V4 -> V2/disposition creado sin reinterpretar texto ni crear identidad, autorizaciÃ³n o efectos.
- [x] Frontera `V4_CORE_SHADOW` integrada en `agentTurnCore` despuÃ©s del contexto legacy; permanece apagada por defecto y bloqueada en producciÃ³n.
- [x] ResoluciÃ³n Core representada como dependencia estructurada inyectable; el default shadow no consulta DB ni autoriza entidades.
- [x] PreparaciÃ³n/plan representados como forma estructural sin llamar al planner, tools, writers ni persistencia.
- [x] Comparador estructural sanitizado implementado para route, objective, disposition, target, slots, lifecycle y plan.
- [x] Fallos de proveedor, schema y timeout quedan aislados del resultado legacy.
- [x] Continuity gate conectado al puente: 10 casos / 16 turnos atraviesan la frontera nueva con fixtures offline.
- [x] Suite especÃ­fica V4 -> Core shadow: 12/12 PASS; regresiones seleccionadas: 145/145 PASS.
- [x] TypeScript directo y `git diff --check`: PASS.
- [x] OpenAI calls, writers, persistencia y tools reales: 0.

## High-Fidelity Core Shadow

- [x] Dependencias del Core auditadas y clasificadas como read-only, mixtas,
  write-capable o externas. Evidencia: `docs/M7-SEMANTIC-V4-HIGH-FIDELITY-SHADOW.md`.
- [x] Reemplazado el resolver nulo del shadow por `HighFidelityReadOnlyRepository`
  y `AgentSemanticV4HighFidelityReadOnlyResolver`; los IDs sólo provienen de
  lecturas autorizadas.
- [x] Reutilizados person resolution, read target resolution, temporal Core,
  read query planner y disposition sin llamar writers ni estado durable.
- [x] Aislada la carga del retrieval/authz para que fixtures in-memory no
  requieran Supabase al importar módulos read-only.
- [x] Barrera anti-escritura comprobada: no INSERT/UPDATE/DELETE/RPC mutante,
  tool, writer, mensaje, memoria ni mutación de diálogo.
- [x] Fixtures high-fidelity cubren A-T por grupos: personas, compromisos,
  propuestas, mensajes, scope vacío, referente canónico, slots, ambigüedad,
  cambio de tema y fallo de repositorio.
- [x] Continuidad 10 casos / 16 turnos atraviesa el resolver high-fidelity,
  disposition y preparación estructural.
- [x] TypeScript y suite enfocada high-fidelity: PASS; OpenAI/persistencia
  real: 0.
