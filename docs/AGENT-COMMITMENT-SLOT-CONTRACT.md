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

Esta corrección se validó localmente. En esta tarea no se hizo commit, push, cambio de secretos, migración ni despliegue a producción. La prueba móvil/voz real y los logs de Render deben verificarse después de una autorización explícita de despliegue; el contrato de backend ya es común a ambos canales.
