# M11 — Ping te recuerda

Aprobado por el dueño el 2026-11-01. Objetivo: que Ping aprenda lo que el usuario le cuenta y lo use después sin que se lo repita.

## Qué cambia

1. **Ping siempre sabe lo básico.** Cada turno empieza con los hechos que el usuario pidió recordar (los 40 más recientes, como máximo unos 4000 caracteres), cada uno con una referencia corta (`m1`, `m2`…). El modelo los usa para entender ("mi jefe", preferencias, rutinas) sin buscar ni preguntar de nuevo. `search_memory` queda para buscar más allá de esa lista.
2. **Ping ofrece recordar.** Si el usuario menciona de pasada algo duradero sobre su vida (una persona y su relación, una preferencia, una rutina, una fecha o lugar importante), Ping responde lo que le pidieron y además ofrece una vez guardarlo con `propose_remember`. No ofrece datos pasajeros, cosas ya sabidas ni temas sensibles (salud, dinero, claves, vida íntima) salvo que el usuario lo pida, y no insiste si dijo que no.
3. **Ping olvida.** `propose_forget` (herramienta `forget_fact`) borra un hecho, siempre con confirmación. Para corregir, Ping propone olvidar el antiguo y recordar el nuevo.
4. **Perfil → «Lo que Ping recuerda».** Lista los hechos y permite olvidar cada uno (`GET /api/memory/facts`, `DELETE /api/memory/facts/:id`).

## Reglas que no cambian

- Guardar u olvidar siempre pasa por una propuesta que el usuario confirma en un turno posterior.
- Solo se muestran y olvidan los hechos del propio usuario (`predicate = 'user_requested_memory'`, `status = 'active'`). Olvidar es un borrado suave (`status = 'deleted'`).
- La política de sensibilidad de `memory.service.ts` sigue decidiendo si un hecho queda activo.

## Código

- `backend/src/services/memoryFacts.service.ts` — listar y olvidar, compartido por el asistente y Perfil.
- `backend/src/services/toolExecutors/forgetFactExecutor.ts`, registro en `toolRegistry.service.ts`.
- `backend/src/services/assistant/assistantService.ts` — hechos conocidos en cada turno e instrucciones.
- `mobile/src/components/perfil/MemorySheet.tsx`, `mobile/src/api/query-modules/memory.ts`.
- Pruebas: `backend/tests/m9Assistant.test.ts` (M11), `backend/tests/memoryFacts.test.ts`, `mobile/tests/pingMemory.test.ts`; casos M04–M06 del banco real.

No requiere cambios en la base de datos.
