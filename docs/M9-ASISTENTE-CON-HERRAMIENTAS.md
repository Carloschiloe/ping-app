# M9 — Ping como asistente con herramientas

Estado: diseño aprobado en principio, pendiente de visto bueno para implementar. Este documento no cambia nada en tiempo de ejecución.

## La decisión

Ping deja de **clasificar** cada frase y pasa a **conversar con herramientas**:

```
Hoy:    voz → gpt-realtime-2.1 → ping_core_turn(texto) → clasificador (2 LLM + ~15.000 líneas) → plantilla → voz
M9:     voz → gpt-realtime-2.1 ──llama──→ herramientas de Ping → datos reales → el modelo responde
        texto → gpt-5.6-luna  ──llama──→ las mismas herramientas
```

El modelo ve toda la conversación, incluido lo que él mismo dijo. Las referencias ("el primero", "ese", "el de bingo"), las elipsis ("¿y a qué hora?"), las correcciones ("no, mejor a las 5") y las preguntas por datos faltantes las resuelve él, sin reglas.

**El backend sigue mandando en todo lo que importa:** qué datos ve cada usuario, qué acciones son legales y que nada se escribe sin un "sí" del usuario.

## Modelos

| Canal | Modelo | Precio por 1M tokens (oficial, 31-10-2026) | Motivo |
|---|---|---|---|
| Voz | `gpt-realtime-2.1` (ya en uso) | audio US$32 de entrada / US$64 de salida, ~US$0,05 por minuto | El más maduro llamando herramientas en tiempo real; ya funciona en Expo Go dentro del WebView |
| Texto | `gpt-5.6-luna` | US$0,20 de entrada / US$1,20 de salida | El más barato de la familia actual; menos de medio centavo por turno con 2 o 3 llamadas a herramientas |

Ambos se configuran por entorno (`M8_LIVE_VOICE_MODEL`, `PING_ASSISTANT_MODEL`). No hay nombres de modelo en el código. Solo si el banco de conversaciones muestra fallas atribuibles al modelo se evalúa `gpt-5.6-terra`. No se hacen comparaciones previas.

**Descartados por ahora:** Gemini Live, porque obliga a reescribir toda la voz y es menos maduro con herramientas; LiveKit y Pipecat, porque agregan servidores y no funcionan en Expo Go; Claude, porque no tiene voz en tiempo real; memoria externa (Mem0, Zep), porque Supabase ya es la memoria real.

## Herramientas

Se construyen sobre lo que ya existe y funciona:
- `retrieval.service.ts` para lecturas con visibilidad por usuario;
- `toolRegistry.service.ts` y `toolExecutors/` para escrituras con esquemas estrictos;
- `agentPlanValidator` y `agentPlanDigest`;
- `agentExecution.service.ts` para la ejecución durable e idempotente.

### Lectura (se ejecutan solas)

| Herramienta | Qué hace |
|---|---|
| `list_commitments(from?, to?, status?, person?, text?)` | Lista compromisos visibles. Cada uno trae `ref`, título, fecha, estado, persona y si soy responsable o es de otro |
| `get_commitment(ref)` | Detalle e historial de uno |
| `list_proposals(focus)` | Propuestas que esperan mi respuesta o la de otros |
| `find_person(name)` | Resuelve contactos; si hay varios, devuelve los candidatos |
| `search_messages(text?, person?, from?, to?)` | Busca en mensajes visibles |
| `search_memory(query)` | Hechos recordados |

### Escritura (solo proponen; nada se ejecuta sin "sí")

| Herramienta | Ejecutor existente |
|---|---|
| `propose_create_commitment(title, dueAt, person?)` | `create_commitment` |
| `propose_reschedule(ref, dueAt)` | `reschedule_commitment` |
| `propose_complete(ref)` / `propose_cancel(ref)` / `propose_edit(ref, title)` | `complete_` / `cancel_` / `edit_commitment` |
| `propose_respond(ref, decision, dueAt?)` | `respond_to_proposal` |
| `propose_send_message(person, content)` | `send_message` |
| `propose_remember(fact)` | `remember_fact` |
| `confirm_action(actionId)` / `discard_action(actionId)` | Autoriza y ejecuta, o descarta, la acción propuesta |

### Referencias seguras (`ref`)

Las herramientas nunca entregan identificadores reales al modelo. Entregan `ref` cortos (`c1`, `c2`…) que el backend guarda por conversación. **El modelo solo puede actuar sobre lo que una herramienta le mostró en esa conversación.** Un `ref` inventado se rechaza.

### Fechas

El modelo recibe la fecha, la hora y la zona horaria del usuario, y entrega fechas ISO con zona. El backend valida que sean fechas reales y, al crear, que no estén en el pasado. Ya no se interpreta lenguaje de fechas con reglas.

## Confirmación de escrituras (la parte de seguridad)

1. `propose_*` valida los argumentos contra el esquema estricto del registro y el estado canónico (que exista, sea visible y la transición sea legal). Luego guarda una **acción pendiente congelada** (`agent_pending_actions`) con:
   - herramienta, argumentos resueltos, digest y conversación;
   - número del turno del usuario que la originó;
   - vencimiento de 10 minutos.

   El modelo recibe un resumen exacto ("Crear «Dentista» el martes 3 a las 17:00") y debe decirlo antes de preguntar.
2. **Texto:** la app muestra la tarjeta con *Confirmar*, que llama a `/agent/authorize` con el digest. Ahí no se interpreta lenguaje.
3. **Voz:** cuando el usuario dice que sí, el modelo llama `confirm_action`. El backend exige que:
   - la confirmación venga de un turno del usuario **posterior** al que creó la propuesta, para que el modelo no pueda proponer y confirmar solo;
   - la acción siga pendiente y no haya vencido;
   - el estado canónico siga permitiendo la acción.
4. La autorización congela los pasos y `executeAuthorization` los ejecuta con los ejecutores actuales, igual que hoy.

**Cambio respecto de hoy:** `authorizePlan` ya no vuelve a interpretar la frase original para rehacer el plan. Autoriza la acción congelada después de revalidarla contra el estado actual. Es más seguro y no depende del lenguaje.

## Conversación y memoria

- **Texto:** cada turno guarda en `agent_conversation_turns` la frase, la respuesta y un resumen compacto de las herramientas (con sus `ref`). El modelo recibe los últimos turnos. Así "el primero" funciona incluso tras reiniciar el servidor o cambiar de dispositivo.
- **Voz:** la sesión de tiempo real mantiene su propio contexto mientras dura. Al abrir una sesión nueva, se le entregan los últimos turnos de esa conversación.
- Texto y voz comparten conversación, `ref` y acciones pendientes.

## Instrucciones del asistente (corto, sin listas de frases)

Identidad y tono de Ping en español de Chile, breve en voz. Principios:
- responder solo con lo que devolvieron las herramientas;
- preguntar cuando falte un dato que importa;
- nunca afirmar que algo se hizo hasta que `confirm_action` lo confirme;
- leer la propuesta exacta antes de pedir confirmación.

## Qué se borra (fase 4)

Unas 15.000 líneas de comprensión escrita a mano y sus pruebas de frases:
- `agentInputInterpreter`, `agentObjectiveInterpreter`, `agentSemanticInterpreter`;
- `agentDialogueContinuation`, `agentContextBuilder`, `agentResponseSynthesizer` (plantillas);
- `agentTurnCore`, `agentPlanner` y `agentPlanOrchestrator`, en su parte de lenguaje;
- toda la pila V4: `canonicalSemanticProducer`, `agentSemanticV4*`, `agentReadV4*`, sombra y seguimiento de lectura;
- la herramienta única `ping_core_turn`.

**Se conserva:** recuperación de datos, registro de herramientas y ejecutores, validador y digest de planes, ejecución durable, admisión e idempotencia, persistencia del historial, auditoría, autenticación y tokens de voz.

## Banco de conversaciones

Unas 60 conversaciones de varios turnos al inicio, ampliables, congeladas antes de implementar. Cubren:
- todo lo que falló en Expo Go;
- selección en listas, elipsis y correcciones;
- tareas interrumpidas y retomadas;
- chilenismos, muletillas y ruido de transcripción;
- saludos;
- contrastes de seguridad.

Corren contra el backend real con datos de prueba marcados, y verifican el resultado: qué herramientas se llamaron, con qué datos, y qué quedó escrito.

**Bloqueante absoluto:** cualquier escritura sin confirmación, o un `ref` ajeno.

## Fases

| Fase | Entrega | Compuerta |
|---|---|---|
| F1 | Capa de herramientas, `ref`, acciones pendientes y bucle de texto con `gpt-5.6-luna` detrás de `PING_AGENT_MODE=assistant`. El camino actual queda intacto | Suite verde y banco de texto |
| F2 | Voz: la sesión de tiempo real recibe las herramientas; el cliente del WebView las reenvía al backend y se retira `ping_core_turn` | Banco y tu prueba en Expo Go |
| F3 | Confirmación sobre acciones congeladas en texto y voz; tarjeta de confirmación adaptada en la app | 0 escrituras sin confirmar y Expo Go |
| F4 | Borrado del clasificador y sus pruebas; se retira el flag | Suite completa verde y banco igual o mejor |
| F5 | Despliegue a producción | Tu autorización |

Pruebas siempre en local con túnel y Expo Go, sin staging, con limpieza de los registros de prueba al final.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El modelo responde algo que no viene de los datos | Instrucción estricta; el banco verifica respuestas contra los resultados de las herramientas |
| El modelo intenta actuar sin permiso | Las escrituras solo proponen; la confirmación exige un turno posterior y una acción congelada válida |
| Costo de conversaciones largas | Historial acotado, prompt fijo cacheado, `gpt-5.6-luna` en texto |
| Latencia en voz por llamadas a herramientas | Herramientas con consultas acotadas; el modelo puede decir "déjame revisar" mientras espera |
