# M-7 Semantic V4 — evidencia de `/agent/turn` real aislado

Estado: local, aislado, sin cutover. Legacy continúa gobernando el resultado
funcional y no se autoriza staging/producción.

## Frontera ejercitada

`backend/tests/m7SemanticV4RealAgentTurnPath.test.ts` llama a `runAgentTurn`,
el servicio consumido por `POST /agent/turn`. El seam `precomputedSemanticV4`
sólo evita una llamada de proveedor durante replay/certificación; no está
expuesto en el body HTTP.

Secuencia comprobada:

`runAgentTurn -> contexto Legacy -> Semantic V4 precomputado -> adapter V2 -> resolver read-only autorizado -> disposition -> plan-shape/planner`

Para WRITE, el resultado sigue siendo `ready_for_authorization`; no se llama
autorización ni ejecución.

## Resultados verificables

| Área | Resultado |
|---|---:|
| READ único, result-set, empty scope, ambiguo, persona, mensaje | 6/6 |
| WRITE hasta plan | 1/1 |
| Multi-turn con estado real in-memory | 1/1 |
| Shadow failures | 0 |
| tools | 0 |
| persistence writes | 0 |
| autorización/ejecución | 0 |

Los datos de retrieval y el repositorio del resolver son sintéticos y están
autorizados sólo para el test. Las credenciales Supabase no se cargan.

## Alcance pendiente

- La ruta HTTP autenticada completa todavía no recibe V4 desde el cliente; el
  seam es deliberadamente interno.
- La comparación con datos Supabase autorizados reales queda pendiente porque
  el entorno local no tiene esas credenciales disponibles.
- WRITE multivuelta (corrección, rechazo, confirmación y cambio de intención)
  aún requiere cobertura estructural específica.
- Legacy sigue siendo dueño de routing, contexto, planning y respuesta; esto
  es evidencia de preparación, no un cutover.
