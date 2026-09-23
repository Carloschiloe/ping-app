# M-7 — Certificación real de lenguaje natural escrito

Estado: preparado localmente; no certificado y M-8 permanece pausado.

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
3. **Multivuelta (D):** conserva el mismo `conversationId`, entrega el resumen de la
   primera lectura y mide referencia, atributo, cambio de tema y aclaración.
4. **Fallback (C):** intérpretes deterministas sobre exactamente la misma batería,
   separado de A y B. Sus resultados no se mezclan con los del LLM.

Los resultados distinguen `pass`, `semantic_fail`, `legitimate_ambiguity`,
`provider_unavailable`, errores de infraestructura y casos no ejecutados por dependencia
de datos. El informe no contiene claves ni respuestas completas del proveedor.

## Contención de seguridad

- El workflow fuerza variables Supabase inválidas de certificación y desactiva
  automatizaciones; el runner las vuelve a fijar antes de cargar el Core.
- No se importa el ejecutor de acciones ni se invocan writers.
- La planificación usa sólo entidades sintéticas en memoria cuando puede medirse sin
  dependencia de datos; las capacidades que requieren resolución real se reportan como
  `not_run_data_dependency`, no como PASS.
- No se usa producción, Render, staging ni una base persistente.

## GitHub Actions

Workflow dedicado: `.github/workflows/m7-written-language-certification.yml`.

- Sólo `workflow_dispatch`, sin ejecución automática por push o pull request.
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

La validación local disponible sólo pudo ejecutar la batería en fallback, porque este
entorno tiene bloqueado `api.openai.com:443`. Resultado local de control: 150 casos
ejecutados, 31 PASS y 119 FAIL del fallback determinista; no es certificación LLM.
La prueba real debe ejecutarse en Actions después de configurar el secret y publicar
manualmente el workflow en una referencia revisada.

El proyecto no se declara certificado hasta disponer de A, B, C y D reales, con el
proveedor operativo y el informe conservado.
