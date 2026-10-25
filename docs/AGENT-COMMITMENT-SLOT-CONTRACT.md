# Contrato estructural de creación de compromisos

## Causa raíz

La cadena no tenía un contrato único de slots obligatorios. El intérprete de objetivos podía copiar `contentHint` del proveedor a `targetEntities.entityHints`; para `Crea un compromiso para mañana`, el valor `un compromiso` cruzaba la frontera como si fuera un título real. El planificador sólo comprobaba que el campo no estuviera vacío, por lo que una etiqueta del tipo de objeto podía llegar a la propuesta.

Además, el flujo de continuación comparaba tipos de objetivo de forma demasiado estricta. Una respuesta válida con el título podía parecer un objetivo nuevo en vez de completar el objetivo abierto. Cuando la respuesta era sólo la hora, la unión de slots podía conservar `mañana` y descartar la hora recién entregada antes de volver al planificador.

## Contrato actual

- `isGenericCommitmentTitleHint` es compartido por interpretación, continuación y planificación. Rechaza únicamente títulos que son exactamente el nombre genérico del objeto, con artículos y variantes lingüísticas; una frase legítima como `Reunión sobre compromisos` sigue siendo válida.
- El planificador es la barrera final: no genera pasos si falta un título significativo. Para `create_commitment_or_proposal` tampoco genera pasos si sólo hay fecha y falta una hora explícita.
- La continuación acepta la familia de creación, no sólo un `objectiveType` exacto. Un título significativo llena el slot `title`; una respuesta temporal preserva la fecha ya conocida y añade la hora por procedencia estructurada del objetivo abierto.
- La propuesta sólo aparece después de que Core tenga todos los slots. Mantiene el digest, la confirmación explícita, la idempotencia, la evidencia y la ruta normal de autorización; esta corrección no ejecuta operaciones.
- Texto y voz entran por el mismo `runAgentTurn`/Core. Realtime no recibe permiso para completar slots ni para saltarse el planificador.

## Evidencia local

La prueba de aceptación cubre la secuencia:

`Crea un compromiso para mañana` → aclaración de `title` y `time` → `Comprar materiales` → aclaración sólo de `time` → `A las diez` → una propuesta `create_commitment`, con confirmación requerida y sin llamadas a autorización/ejecución.

También se cubren título genérico aislado, fecha sin hora, título legítimo que contiene palabras genéricas, respuestas de continuación, cancelaciones, correcciones y aislamiento del estado existente en la suite de diálogo.

## Limitaciones

### Procedencia temporal y memoria

- `planCreateCommitment` sólo consulta memoria temporal cuando Core deja una
  intención estructurada `memoryTimeReference`; una solicitud nueva sin esa
  intención no puede heredar la hora de otro compromiso.
- La memoria debe coincidir con el sujeto solicitado y con los tokens
  significativos del título. Si no coincide, el plan queda en aclaración.
- En el camino V3, un hecho temporal canónico sólo es ejecutable con
  `temporalOrigin: current_turn`; el paso conserva `agent_turn_temporal` y su
  `temporalSourceRef` en provenance/preconditions antes de autorizar.

### Continuidad y voz

- Una respuesta corta de slot se reconcilia con el objetivo abierto; una orden
  completa con el mismo título pero una nueva fecha/hora no se absorbe como
  continuación (`same_title_new_temporal_request`).
- `m8LiveVoiceCoreBridge.integration.test.ts` ejecuta el JavaScript real del
  WebView con un PeerConnection/DataChannel controlado: transcripción final,
  VAD, `response.function_call_arguments.done`, llamada a `/agent/turn`,
  presentación Core y ausencia de llamadas locales a `/agent/authorize` o
  `/agent/execute`.

### Validación ejecutada

- Suites dirigidas de planner/interpreter/continuidad/V3: **256/256**.
- Voz WebView + broker: **19/19**.
- Regresión completa backend fuera del sandbox: **2.669 pasaron, 20 skipped,
  18 todo; 1 falló de 2.708**. El único fallo es el caso histórico en inglés
  `tomorrow at 10` de
  `agentTurnHttpBoundaryDialogueContinuity.test.ts:279`: el parser canónico
  reconoce la fecha pero la ruta de compromiso compartido no reconoce esa hora
  inglesa como hora explícita. No se relajó la expectativa ni se aumentó un
  timeout.
- Regresión móvil completa: **889/889** en 55 archivos.
- TypeScript móvil: **exit 0**, 1.474 archivos, 59,88 s.
- Build backend: **exit 0**.

El fallo inglés anterior no usa memoria ni `canonicalFacts`; el diff de esta
corrección sólo cambia la consulta de memoria cuando existe una referencia
explícita, por lo que no se puede atribuir a la nueva barrera de procedencia.
Queda como riesgo pendiente separado, no como una expectativa ocultada.

Esta corrección se validó localmente. Los cambios se mantienen limitados a la
rama de revisión: no se hizo merge, no se modificaron secretos ni migraciones,
y no se desplegó producción. La prueba física en iPhone y la observación de
logs de Render siguen pendientes; el puente de voz controlado y el contrato de
backend ya están verificados, pero eso no sustituye la prueba física.
