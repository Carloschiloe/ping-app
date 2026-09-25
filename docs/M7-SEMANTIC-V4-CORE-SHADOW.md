# Semantic V4 -> Core shadow integration

Estado: implementado y validado localmente; no es cutover.

## Alcance

- `V4_CORE_SHADOW` se ejecuta sólo con opt-in en `local` o `staging`.
- `NODE_ENV=production` bloquea la frontera aunque exista el flag.
- El resultado legacy sigue gobernando routing, respuesta, autorización, estado y ejecución.
- No se llaman OpenAI ni Supabase en esta validación; el proveedor se sustituye por fixtures estructurados.

## Frontera

`agentSemanticV4CoreShadow.service.ts` valida el Semantic V4, lo proyecta al contrato V2/disposition y conserva los campos V4 específicos junto a esa proyección. Después ejecuta la decisión `AgentTurnDispositionService` y genera una forma de preparación/plan sin llamar al planner durable.

La resolución Core es una dependencia estructurada inyectable. El default shadow no consulta almacenamiento ni autoriza entidades. No hay interpretación de texto, regex, keywords, IDs canónicos, tools, writers, persistencia ni mutación de dialogue state.

El comparador observa route, objective, disposition, target/reference resolution, slots, lifecycle y plan shape, clasificando desacuerdos como `SEMANTIC_DISAGREEMENT`, `CORE_RESOLUTION_DISAGREEMENT`, `PLAN_SHAPE_DISAGREEMENT`, `LEGACY_ONLY`, `V4_ONLY` o `SHADOW_ERROR`.

## Evidencia

- `m7SemanticV4CoreShadow.test.ts`: 12/12 PASS.
- `m7SemanticV4CoreShadowContinuity.test.ts`: 10 casos / 16 turnos atraviesan V4 -> Core -> disposition -> preparación shadow.
- Regresiones V4/Core/continuidad/estado seleccionadas: 145/145 PASS.
- TypeScript directo: PASS.
- `git diff --check`: PASS.
- OpenAI calls: 0; writers: 0; persistencia real: 0; tools reales: 0.

## Limitación explícita

Esta etapa demuestra la frontera y sus contratos en shadow. No cambia el camino legacy ni habilita todavía la resolución V4 para gobernar producción. La futura habilitación deberá inyectar el resolver canónico autorizado y la preparación real bajo los mismos controles, sin reutilizar este shadow como ejecutor.
