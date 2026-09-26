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

## Evidencia adicional: matriz multivuelta local

`backend/tests/m7SemanticV4MultiTurnReal.test.ts` define una bateria nueva de
20 conversaciones, cuatro turnos cada una (80 turnos), sin reutilizar la
bateria blind. Cada turno pasa por `runAgentTurn`, conserva el mismo
`AgentDialogueStateService` dentro de su conversacion y entrega un
`SemanticTurnV4` precomputado por el seam interno de certificacion.

Resultado: 80/80 sombras V4 sin fallo, 46 turnos READ, 34 turnos WRITE,
25 hechos temporales procesados por `resolveTemporal`, estado con secuencia
monotonica entre turnos y 0 side effects. La matriz contiene persona/pronombre,
referencias implicitas, elipsis, correcciones de fecha/hora, fechas relativas,
abandono/reanudacion, ambiguedad, cambio de tema y retorno al tema anterior.

La evidencia es local y sintetica: no llama OpenAI, no usa Supabase real, no
crea compromisos y no autoriza planes. Por eso no demuestra todavia el endpoint
HTTP autenticado ni un cutover; esos siguen siendo huecos explicitos.

## Alcance pendiente

- La ruta HTTP autenticada completa todavía no recibe V4 desde el cliente; el
  seam es deliberadamente interno.
- La comparación con datos Supabase autorizados reales queda pendiente porque
  el entorno local no tiene esas credenciales disponibles.
- WRITE multivuelta (corrección, rechazo, confirmación y cambio de intención)
  aún requiere cobertura estructural específica.
- Legacy sigue siendo dueño de routing, contexto, planning y respuesta; esto
  es evidencia de preparación, no un cutover.
