# Semantic V4 — evidencia de desarrollo V2

Esta evaluación es independiente de la batería blind y no cambia su scoring.

## Ejecución

- Casos inéditos ejecutados: 12 (`V2-13` a `V2-24`).
- Modelo V4: `gpt-5.6-sol`.
- Modelo Legacy comparado: `gpt-4o-mini`.
- Batería: `backend/certification/m7-v4-development-battery.v2.json`.
- Artefacto final: `backend/.m7-smoke-artifacts/development-v4-20260925/m7-v4-development-evaluation.v2.json`.
- SHA-256 del artefacto: `c1fde22e700ee6b0aea525671ec30ceb1a06711085bdf6763e916d8d418068e2`.
- Outputs V4 crudos persistidos antes de Core:
  `backend/.m7-smoke-artifacts/development-v4-20260925/m7-v4-development-raw.v2.ndjson`.
- SHA-256 de outputs crudos:
  `8085d80eff4bdb5c6f6c9c3edbc5664f8fc754f0bb749a1388054991da654792`.

## Resultados

- V4 proveedor/schema/parser/normalización: 12/12, sin errores.
- Core shadow: 12/12 atravesaron resolver y disposition, sin `shadow_failure`.
- Replay del mismo output persistido: PASS, 12/12, 0 llamadas OpenAI.
- Legacy: 0 fallback; hubo una diferencia de ruta en un `slot_answer` y
  diferencias de catálogo de objetivo, registradas sin ocultarlas.
- Side effects: writers 0, persistencia 0, tools 0, mensajes 0, memory writes 0.

El primer intento de esta V2 quedó conservado como evidencia histórica de un
defecto del replay harness: no reconstruía el repositorio sintético ni el
snapshot de diálogo. La corrida final usó ambos contratos corregidos y es la
medición válida.

## Cambio estructural adicional

En el camino shadow de `/agent/turn`, el resultado V4 ya producido por el
shadow semántico se reutiliza en el Core shadow. Esto evita una segunda llamada
al proveedor por turno; el hand-off es no enumerable y no entra en la
telemetría sanitizada. Legacy sigue siendo autoridad de routing, planning,
autorización y ejecución.
