# Ping Conversation Runtime

## Estado auditado

La revisión corresponde a `0c52ab93b5bdb9621b5f86a7c88bbaea5cd681f0`, con
workflow `37216999644` completamente PASS en staging. La sesión física que
motivó esta auditoría no es recuperable: el buffer process-local de telemetría
no contiene un artefacto persistido de esa sesión. No se atribuye su respuesta
genérica a una capa concreta sin esa evidencia.

## Grafo canónico

```text
text / voice / future device
        -> channel adapter
        -> POST /agent/turn
        -> runCanonicalAgentTurn
        -> semantic interpretation
        -> durable dialogue checkpoint
        -> disposition / plan / correction / rejection
        -> confirmation state
        -> authorizePlan (server)
        -> executeAuthorization (server)
        -> canonical writer + read-after-write evidence
        -> canonical AgentTurnResult
        -> text or voice presentation adapter
```

`agentConversationRuntime.service.ts` es el owner de la frontera durable. En
un turno de confirmación semántica, el servidor vuelve a autorizar contra el
`planDigest` y los `stepIds` del plan vigente, ejecuta mediante el writer
canónico, verifica los pasos y sólo entonces devuelve la respuesta de éxito.

## Ownership

- Semantic providers proponen significado; no autorizan ni escriben.
- El checkpoint durable es la fuente de verdad para objetivo, slots, lifecycle,
  plan pendiente, versión y secuencia del diálogo.
- El servidor es el único owner de autorización, ejecución, persistencia y
  read-after-write.
- Text y mobile voice usan el mismo `/agent/turn` y la misma runtime durable.
- Voice mantiene únicamente transporte: WebRTC, VAD, audio, correlación de
  turnos, reconexión y presentación del `core_presentation` autorizado.
- El `pendingPlan` existente en `AgentPreviewScreen` es un espejo de UX para
  renderizar un PlanCard en el modo legacy/compatibilidad; no es autoridad y
  no se usa por la runtime durable staging para ejecutar.

## Voice boundary

La sesión Realtime tiene dos respuestas deliberadas por turno de voz: una
respuesta de selección de herramienta sin audio y, después de obtener el
resultado de Core, una respuesta de audio limitada al `core_presentation`.
El primer output textual no se presenta ni se verbaliza. Si no existe un
resultado autorizado de Core, el cliente mantiene el gate de audio cerrado.

Por tanto, la invariante es:

```text
no core_presentation autorizado -> no assistant speech
provider generation done -> no assertion of physical playback completion
no verified write -> no success presentation
```

La protección de audio posterior a `audio.done` y la recuperación de estado
de salida siguen siendo parte del adaptador de transporte; no cambian la
autoridad semántica del Core.

## Deuda clasificada

| Área | Clasificación | Tratamiento |
|---|---|---|
| Plan/UI local de texto | Compatibilidad de presentación | Mantener como espejo no autoritativo hasta migrar la UX completa al contrato durable |
| `/agent/authorize` y `/agent/execute` | API canónica legacy-compatible | El runtime durable los invoca server-side; no se agregan writers alternativos |
| Validaciones de idempotencia, digest, step IDs y autorización | Safety invariant | Preservadas; no eliminar |
| Reglas lingüísticas determinísticas | Parser/safety según cada caso | No añadir frases, keywords o nombres para resolver casos físicos |
| Telemetría latest process-local | Observabilidad staging | No usarla como prueba histórica si no existe buffer; una futura persistencia diagnóstica requiere un cambio separado |

## Evidencia actual

- Quality gate: PASS.
- Staging: deploy y health con SHA exacto `0c52ab9`.
- E2E autenticado: PASS, secuencia de cambio de objetivo, corrección, rechazo,
  confirmación, ejecución y read-after-write.
- Fixture: una escritura controlada verificada y limpiada; identidad temporal
  eliminada; mensajes activos cero.
- No se ejecutó una nueva prueba física, no se generó APK y no hubo llamadas
  OpenAI desde este ciclo.

## Alcance no demostrado

La evidencia automática no certifica todavía conversación física completa,
continuidad de voz, reproducción en dispositivo ni barge-in. M8 permanece
abierto hasta una prueba física posterior con telemetría recuperable.
