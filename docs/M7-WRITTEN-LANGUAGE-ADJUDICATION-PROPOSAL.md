# Propuesta de adjudicación — M-7 lenguaje escrito

Estado: propuesta separada. No modifica la batería congelada, no cambia el scoring y no autoriza una nueva certificación.

La batería original conserva exactamente sus 150 casos, textos, expectativas, orden y hash SHA-256. Esta rúbrica sólo identifica expectativas que pueden admitir más de una interpretación razonable.

## Casos candidatos

| Caso | Texto o turno | Expectativa congelada | Interpretación alternativa razonable | Recomendación provisional |
|---|---|---|---|---|
| R032 | «¿Qué acordamos con la gente de la parcela?» | `recall` | Puede preguntar por compromisos acordados, no sólo por conversación histórica. | Aceptar `recall` o `commitment_query` si la respuesta conserva evidencia y no mezcla fuentes. |
| R033 | «¿Qué recuerdas de mis preferencias para trabajar temprano?» | `general_context` | Es una consulta de memoria explícita. | Aceptar `general_context` o `recall` con memoria autorizada. |
| R053 | «Dime todo lo importante que tengo abierto, sin inventar nada.» | `general_context` | Puede significar una lista exhaustiva de compromisos abiertos. | Aceptar sólo si el Core delimita fuentes y no inventa; `commitment_query` puede ser válido. |
| W003 | «Quiero que quede agendado comprar pintura el sábado en la mañana.» | `create_personal_commitment` | “Agendado” puede representar un compromiso compartido o una entrada de calendario. | Aceptar creación personal sólo si no aparece otra persona; nunca ejecutar sin confirmación. |
| W014 | «Ponme en la agenda ordenar la bodega cuando tenga tiempo mañana.» | `create_personal_commitment` | “Agenda” puede pedir una operación de calendario no implementada. | Aceptar compromiso personal o aclaración de capacidad; no aceptar escritura de calendario inventada. |
| W025 | «Dile a Marcela que confirme si recibió los documentos.» | `communicate_and_wait` | Puede ser sólo enviar un mensaje con una solicitud, sin crear una espera estructurada. | Aceptar `communicate_message` si conserva el texto literal; `communicate_and_wait` si explicita la espera. |
| W056 | «Me equivoqué: crea la revisión para el viernes, no para el jueves.» | `create_personal_commitment` | Puede corregir un compromiso ya existente y pedir reprogramación. | Sin turno previo, aceptar aclaración o creación; no asumir una entidad existente. |
| W057 | «Corrijo lo anterior: era llamar a Pedro, no a Pablo.» | `create_personal_commitment` | Sin turno previo, sólo es una corrección incompleta. | Aceptar aclaración; no ejecutar creación sin fecha o contexto suficiente. |
| W059 | «Para el jueves...» | `create_personal_commitment` + aclaración | Fragmento incompleto: puede completar una acción previa o iniciar una solicitud nueva. | Aceptar aclaración; nunca clasificar como escritura ejecutable por sí sola. |
| F002 | «Muéstrame mis pendientes de esta semana» → «¿Cuál vence último?» | resultado/`details` | Es una operación `temporalComparison=latest`, no necesariamente un atributo de detalle. | Aceptar comparación temporal sobre el conjunto autorizado. |
| F007 | «¿Cuándo es la visita al galpón?» → «Me refiero a la del sábado, no a la del lunes.» | fecha/referente | Puede introducir una nueva entidad o corregir una ambigüedad entre dos entidades. | Aceptar corrección sólo si ambas entidades existen; si no, pedir aclaración. |
| F010 | «¿Qué tengo para mañana?» → «¿Y para el lunes?» | fecha/alcance cambiado | Puede reemplazar el rango anterior, no referirse a la misma entidad. | Aceptar nuevo alcance temporal y abandonar la selección previa. |
| F011 | «Deja propuesta una visita con Felipe» → «Mejor sólo recuérdamela a mí.» | cambio de intención | Puede convertir una propuesta compartida en compromiso personal. | Aceptar cambio de objetivo; requerir nuevo plan y confirmación. |
| F014 | «¿Qué pasó con el seguro?» → «No hablaba del seguro del auto, sino del de la bodega.» | corrección de tema | Puede corregir el filtro temático manteniendo la conversación. | Aceptar reemplazo del tema y descartar evidencia del seguro del auto. |
| F019 | «Dile a Marcela que confirme el documento» → «¿Qué le pedí exactamente?» | detalle de acción | Puede pedir el contenido del mensaje o el objetivo de espera. | Aceptar respuesta basada únicamente en el plan/mensaje canónico. |
| F024 | «¿Qué pendientes hay con Paula?» → «¿Y con Rodrigo?» | nueva persona | Puede mantener el mismo tipo de consulta cambiando explícitamente el alcance. | Aceptar nuevo ámbito Rodrigo; no arrastrar compromisos de Paula. |
| F028 | «Muéstrame lo de la parcela» → «No, mejor busca los mensajes sobre la parcela.» | cambio de fuente | Puede conservar el tema y cambiar de compromisos a mensajes. | Aceptar `message_search` y abandonar el conjunto anterior. |

## Regla de uso futura

Esta propuesta debe revisarse antes de incorporarse al scoring. Hasta entonces, los casos conservan su expectativa original y una salida alternativa se informa como `requires_adjudication`, nunca como PASS automático.

