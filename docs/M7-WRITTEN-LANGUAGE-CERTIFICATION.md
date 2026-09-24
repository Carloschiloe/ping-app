# M-7 — Certificación real de lenguaje natural escrito

Estado: harness corregido localmente; segunda certificación todavía no ejecutada y M-8 permanece pausado.

## Artefactos congelados

- Batería: `backend/certification/m7-written-language-battery.v1.json`
- Runner: `backend/certification/m7-written-language-certification.mjs`
- Hash SHA-256 de los bytes UTF-8 de la batería:
  `5fda1888b7c37ca04348a966161ed89424f1f719a4b3d80935dd0a87c4c40168`
- Casos fijos: 150
- Distribución: 120 turnos individuales (60 READ, 60 WRITE) y 30 conversaciones multivuelta.
- Familias cubiertas: `followup` (30), `read` (18), `create_personal` (15), `message`
  (10), `time` (10), `memory` (8), `people` (7), `commitments` (6), `cancel`,
  `complete`, `reject` y `reschedule` (5 cada una), además de comparación, documentos,
  historial, ambigüedad, coloquialismos, errores, frases incompletas, negación,
  corrección, cambio de tema y solicitudes amplias.

La batería se diseñó desde las capacidades del producto y se marca `frozen: true`.
El runner aborta si cambia el hash o el número de casos. No se modifica para obtener
un resultado favorable.

## Capas medidas

El runner ejecuta la misma batería en recorridos separados:

1. **LLM principal (A):** prueba mínima con el proveedor real y después el intérprete
   semántico real. Una respuesta marcada `llm_fallback` nunca cuenta como PASS del LLM.
2. **Core con LLM (B):** usa la interpretación obtenida en A y ejecuta únicamente
   admisión/planificación seca. No llama writers ni persiste mensajes, compromisos,
   personas o memoria.
3. **Multivuelta (D):** atraviesa `agentTurnCore` con el mismo `conversationId`,
   `AgentDialogueStateService`, contexto de lectura, recuperación en memoria y
   planificación real. El adaptador de retrieval es sintético y actor-scoped; no
   hay escritores ni persistencia. No se fabrica `priorReferenceIntent` para que
   una prueba pase: se observa el estado y el resultado final del Core.
4. **Fallback (C):** intérpretes deterministas sobre exactamente la misma batería,
   separado de A y B. Sus resultados no se mezclan con los del LLM.

Los resultados conservan los 150 casos completos y distinguen `pass`, `semantic_fail`,
`legitimate_ambiguity`, `provider_unavailable`, `provider_http_error`, `timeout`,
`invalid_json`, `schema_invalid`, `fallback_used`, `core_error` y casos no puntuados.
Cada registro conserva expectativa, entrada, capa, ruta, objetivo, fuente/modelo,
fallback y razón. Los errores estructurados sólo guardan tipo, código, etapa, mensaje
sanitizado y causa; nunca claves ni respuestas crudas del proveedor. Los `schema_invalid`
incluyen paths, códigos y expected/received obtenidos mediante una validación diagnóstica
independiente, sin persistir el JSON original.

## Contención de seguridad

- El workflow fuerza variables Supabase inválidas de certificación y desactiva
  automatizaciones; el runner las vuelve a fijar antes de cargar el Core.
- No se importa el ejecutor de acciones ni se invocan writers.
- La planificación usa sólo entidades sintéticas en memoria cuando puede medirse sin
  dependencia de datos; las capacidades que requieren resolución real se reportan como
  `not_run_data_dependency`, no como PASS.
- No se usa producción, Render, staging ni una base persistente.
- La ejecución de Core usa un adaptador de retrieval en memoria que devuelve DTOs
  canónicos sintéticos; los planes se generan, pero autorización/ejecución nunca se llama.
  El informe verifica `writerCalls = 0` por caso y globalmente.

## Adjudicación separada

`docs/M7-WRITTEN-LANGUAGE-ADJUDICATION-PROPOSAL.md` contiene una propuesta de revisión
para expectativas potencialmente ambiguas. No modifica la batería ni participa todavía
en el scoring. Las salidas alternativas se mantienen como `requires_adjudication` hasta
una decisión explícita.

## GitHub Actions

Workflow dedicado: `.github/workflows/m7-written-language-certification.yml`.

- `workflow_dispatch` y push restringido exclusivamente a tags `m7-cert-*`; no se
  ejecuta en commits, ramas ni pull requests normales.
- Requiere el environment protegido `m7-llm-certification` y dentro de él el secret
  `OPENAI_API_KEY`. El valor nunca se imprime ni se escribe en un archivo.
- Al iniciar se registra el SHA del checkout. La ejecución termina antes de la batería
  si la prueba mínima no obtiene una respuesta JSON estructurada del proveedor.
- Se sube un artefacto con los informes independientes A/B/D y C junto con la batería;
  los informes se escriben en `${{ runner.temp }}` y no en el repositorio.

GitHub sólo muestra un workflow manual en la interfaz cuando su archivo existe en la
rama por defecto. Por eso la alternativa segura es abrir una PR que contenga únicamente
estos artefactos y el workflow, revisarla y fusionarla manualmente en la rama por defecto;
no se fusiona ni publica automáticamente desde este trabajo. Si se desea mantenerlo
fuera de la rama por defecto, se puede ejecutar mediante la API/CLI con una referencia
que ya contenga el workflow, pero requiere permisos de Actions y no se asume aquí.

## Estado de ejecución

La primera validación local histórica ejecutó el fallback sobre 150 casos y conservó
31 PASS y 119 FAIL; ese resultado pertenece al runner anterior. El harness corregido
mantiene los 150 registros, puntúa 120 turnos individuales del fallback y deja las 30
conversaciones multivuelta como `not_scored_without_core` en esa capa separada. Ninguno
de esos resultados es certificación LLM. La segunda prueba real debe ejecutarse en
Actions después de revisar esta infraestructura.

La primera ejecución y sus artefactos se preservan sin reescritura. El harness corregido
se valida localmente con sintaxis, TypeScript, smoke tests y hash de batería, pero la
segunda corrida completa contra OpenAI queda deliberadamente pendiente de autorización.
El proyecto no se declara certificado hasta disponer de A, B, C y D reales, con el
proveedor operativo, todos los resultados conservados y cero writers.
