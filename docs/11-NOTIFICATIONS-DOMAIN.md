# Ping — Modelo Conceptual de Notificaciones

Este documento define oficialmente el significado de las notificaciones de Ping para el MVP.

Una notificación comunica a un usuario autorizado un hecho relevante o una situación que requiere atención. Sólo comunica: no ejecuta, decide ni modifica el asunto.

## 1. Propósito

El propósito de una notificación es ayudar al usuario a reconocer a tiempo información relevante para recordar, seguir o resolver un asunto importante.

Una notificación debe permitir comprender:

- qué requiere atención;
- por qué importa;
- con qué compromiso se relaciona;
- quién es responsable;
- qué fecha o situación temporal existe;
- qué contexto ayuda a reconocer el asunto;
- qué fuente autorizada permite comprenderlo.

La notificación apoya el seguimiento, pero no lo sustituye. Su valor depende de ayudar a avanzar, no de aumentar la cantidad de comunicaciones.

## 2. Qué es una notificación

Una notificación es una comunicación dirigida a un usuario determinado para:

- informarle de un hecho relevante;
- advertirle de una situación vigente;
- llamar su atención sobre un asunto;
- ayudarle a reconocer qué necesita revisar;
- facilitar que vuelva al contexto autorizado.

Toda notificación posee:

- destinatario;
- motivo;
- contexto;
- relación con un asunto;
- procedencia;
- momento relevante;
- vigencia;
- prioridad comprensible cuando corresponda;
- límites de autorización.

Una notificación puede basarse en un evento o en una situación actual, pero sigue siendo una comunicación distinta.

## 3. Qué no es una notificación

Una notificación no es:

- el hecho ocurrido;
- un evento;
- una conversación;
- un mensaje de origen;
- un compromiso;
- un seguimiento;
- un avance;
- un resultado;
- una persona;
- un recuerdo;
- una autorización;
- una orden;
- una decisión;
- una acción automática;
- una propuesta de IA;
- una fuente de verdad.

Una notificación nunca:

- reemplaza el evento;
- reemplaza la conversación;
- reemplaza el compromiso;
- reemplaza el contexto;
- concede permisos;
- ejecuta acciones;
- cambia estados;
- crea compromisos;
- registra avances;
- resuelve asuntos;
- toma decisiones por el usuario.

Si la notificación desaparece o pierde vigencia, el hecho, la fuente y el compromiso no cambian por esa razón.

## 4. Principios

**Relevancia antes que volumen**

Sólo debe comunicarse aquello que ayuda al usuario a recordar, seguir o resolver.

**Contexto antes que interrupción**

La comunicación debe permitir reconocer el asunto y su motivo.

**Destinatario explícito**

Toda notificación está dirigida a una persona autorizada.

**Mínimo privilegio**

La notificación contiene únicamente información que el destinatario puede consultar.

**Una situación no obliga a notificar**

No todo evento ni todo cambio necesita una comunicación.

**Seguimiento antes que repetición**

Repetir un aviso sin aportar utilidad no constituye seguimiento útil.

**Vigencia comprensible**

La notificación deja de ser pertinente cuando su motivo ya no requiere atención o el destinatario deja de estar autorizado.

**Fuente preservada**

La comunicación orienta hacia el contexto, pero no sustituye la información original.

**Control del usuario**

La notificación informa; el usuario decide qué acción tomar.

## 5. Origen de una notificación

Una notificación puede originarse conceptualmente en:

- un compromiso confirmado;
- una fecha o plazo confirmado;
- la proximidad de un plazo;
- un compromiso atrasado;
- un asunto que continúa abierto;
- una necesidad de seguimiento;
- una respuesta o avance relevante;
- un cambio confirmado del compromiso;
- un hecho relevante expresado por un evento;
- contexto autorizado recuperado por Memory.

El origen debe ser:

- identificable;
- confirmado cuando corresponda;
- relevante para el destinatario;
- autorizado;
- suficiente para explicar el motivo.

No pueden ser origen definitivo por sí solas:

- una inferencia;
- una predicción;
- una propuesta de IA;
- una fecha no confirmada;
- un responsable no confirmado;
- una relación ambigua;
- información sin procedencia.

La IA puede sugerir que conviene informar algo. Las reglas del negocio deben validar la situación, el destinatario, la autorización y la vigencia antes de que exista una notificación definitiva.

## 6. Destinatarios

Toda notificación posee al menos un destinatario determinado.

En la experiencia personal principal, el destinatario es el usuario propietario del asunto o recuerdo autorizado.

Cuando exista colaboración aprobada:

- una misma situación puede ser relevante para distintos usuarios;
- cada usuario recibe una comunicación separada según su propio contexto;
- cada destinatario debe estar autorizado;
- el contenido puede diferir según el alcance que cada persona puede consultar;
- ser participante no implica recibir todas las notificaciones;
- ser responsable no implica recibir una notificación ni obtener acceso automáticamente;
- ser persona relacionada no concede derecho a recibir información.

Una situación compartida no convierte la notificación en pública.

La identidad y representación del destinatario provienen de People, pero Authorization determina si puede recibir el contexto comunicado.

## 7. Relevancia

Una notificación es relevante cuando ayuda al destinatario a:

- reconocer un compromiso abierto;
- anticipar una fecha o plazo;
- identificar un atraso;
- saber que un asunto continúa sin resolver;
- comprender que se necesita seguimiento;
- reconocer un avance o cambio que requiere atención;
- volver al contexto de origen;
- avanzar hacia una resolución.

La relevancia depende de:

- situación actual del asunto;
- fecha o plazo confirmado;
- responsable confirmado;
- relación del destinatario;
- contexto autorizado;
- tiempo transcurrido;
- seguimiento ya realizado;
- cambios posteriores;
- vigencia del motivo.

No todo evento es relevante para comunicar.

No toda actividad merece una notificación.

Una comunicación deja de ser relevante cuando no ayuda a comprender ni avanzar.

Los criterios exactos para determinar relevancia y evitar repetición permanecen pendientes.

## 8. Prioridad

La prioridad de una notificación expresa cuánta atención requiere la situación para su destinatario.

Puede considerar:

- proximidad de una fecha o plazo confirmado;
- atraso;
- permanencia de un asunto abierto;
- importancia confirmada del compromiso;
- necesidad de una decisión del usuario;
- existencia o ausencia de seguimiento;
- contexto de la persona responsable;
- cambios relevantes posteriores.

La prioridad de la notificación no es necesariamente igual a la prioridad del compromiso.

Una prioridad:

- debe ser comprensible;
- debe basarse en información confirmada;
- no puede inventarse;
- no concede permisos;
- no ejecuta acciones;
- puede cambiar si cambia la situación;
- pierde sentido cuando la notificación deja de estar vigente.

Los documentos base no definen niveles oficiales ni reglas de comparación. No deben asumirse escalas silenciosamente.

## 9. Estado de una notificación

El estado conceptual mínimo distingue:

**Vigente**

La notificación conserva un motivo relevante, el destinatario mantiene autorización y la situación todavía requiere atención o conocimiento.

**Sin vigencia**

La notificación ya no debe llamar la atención porque:

- el asunto cambió;
- el compromiso fue resuelto;
- el motivo dejó de ser relevante;
- apareció información correctiva;
- el destinatario perdió autorización;
- transcurrió el período útil de la comunicación.

Una notificación sin vigencia puede desaparecer de la atención del usuario sin modificar:

- el evento de origen;
- la conversación;
- el compromiso;
- la persona;
- el recuerdo;
- la historia relevante.

Los documentos base no definen estados oficiales para lectura, revisión, descarte o atención. Esas distinciones quedan como decisiones pendientes.

## 10. Relación con Conversation

Conversation conserva:

- conversaciones;
- participantes;
- mensajes;
- capturas;
- archivos o audios asociados cuando corresponda;
- contexto conversacional;
- procedencia.

Una notificación puede incluir una referencia autorizada a Conversation para que el usuario comprenda el origen.

La notificación no:

- reemplaza el mensaje;
- copia toda la conversación;
- modifica participantes;
- crea una conversación;
- convierte cada mensaje en aviso;
- expone contexto privado;
- supone que todos los participantes deben recibirla.

Un nuevo mensaje puede contribuir a una situación relevante, pero no genera automáticamente una notificación.

Conversation sigue siendo propietaria de su información.

## 11. Relación con Commitment

Commitment es el origen principal de las notificaciones obligatorias del MVP.

Puede aportar:

- compromiso confirmado;
- propietario;
- responsable;
- fecha o plazo;
- estado;
- prioridad cuando corresponda;
- condición de próximo o atrasado;
- seguimiento;
- avances;
- resolución;
- resultado;
- contexto y procedencia.

Una notificación puede ayudar a comunicar:

- que un compromiso se aproxima a su plazo;
- que está atrasado;
- que continúa abierto;
- que necesita seguimiento;
- que ocurrió un cambio relevante.

La notificación no:

- crea el compromiso;
- cambia su estado;
- registra seguimiento;
- registra avances;
- resuelve el asunto;
- modifica el resultado.

Commitment conserva el ciclo de vida. La notificación sólo comunica una situación derivada de ese ciclo.

## 12. Relación con People

People aporta:

- identidad comprensible del destinatario;
- identidad del propietario;
- responsable confirmado;
- personas relacionadas;
- relaciones contextuales autorizadas.

People ayuda a que la notificación exprese con quién está relacionado el asunto.

La notificación no:

- define identidades;
- confirma coincidencias;
- fusiona personas;
- amplía relaciones;
- concede acceso a una persona mencionada;
- convierte a un responsable en destinatario automático;
- construye perfiles.

Una misma situación puede producir comunicaciones distintas para usuarios diferentes, porque cada relación y autorización se entiende desde su propia perspectiva.

People sigue siendo propietario de identidad y relaciones.

## 13. Relación con Memory

Memory puede aportar:

- contexto relevante;
- conversación o mensaje de origen;
- compromiso relacionado;
- persona relacionada;
- seguimientos;
- avances;
- resultado;
- procedencia.

Memory permite que la notificación no sea un aviso aislado.

La notificación no:

- convierte todo recuerdo en comunicación;
- convierte todo evento en recuerdo;
- reemplaza la memoria;
- conserva contexto no autorizado;
- amplía permisos;
- decide qué es verdad.

Una notificación puede orientar al usuario hacia un recuerdo autorizado. Si pierde vigencia, Memory no elimina ni modifica por esa razón la información relevante del asunto.

Memory sigue siendo propietaria de la capacidad de recuperar información.

## 14. Relación con IA

La IA puede:

- sugerir que una situación podría ser conveniente de comunicar;
- ayudar a resumir contexto autorizado;
- proponer una explicación comprensible;
- sugerir prioridad;
- reconocer incertidumbre;
- identificar que falta información.

Toda ayuda de IA:

- permanece derivada;
- conserva procedencia;
- respeta autorización;
- expresa incertidumbre;
- no crea por sí sola una notificación definitiva;
- no decide el destinatario;
- no concede acceso;
- no ejecuta ninguna acción.

La IA no puede inventar:

- un motivo;
- una fecha;
- una urgencia;
- un responsable;
- un destinatario;
- una situación.

La conveniencia sugerida debe pasar por las reglas del negocio antes de comunicarse.

## 15. Relación con Authorization

Authorization determina:

- quién puede recibir una notificación;
- qué información puede incluir;
- qué contexto puede consultarse;
- qué fuente puede alcanzarse;
- si el permiso continúa vigente.

Toda notificación debe respetar:

- propiedad;
- mínimo privilegio;
- alcance del recurso;
- propósito;
- vigencia.

Una notificación:

- no concede permisos;
- no amplía acceso;
- no permite evitar una revocación;
- no hace pública información compartida;
- no transfiere acceso entre personas.

Si el destinatario pierde autorización, la notificación deja de estar vigente para esa persona y no puede seguir exponiendo contenido protegido.

Compartir un compromiso no autoriza a comunicar conversaciones privadas no relacionadas.

## 16. Relación con Events

Un evento describe un hecho que ocurrió.

Una notificación comunica a un usuario autorizado que un hecho o situación merece atención.

La relación debe mantener estas diferencias:

- el evento pertenece a la historia del dominio;
- la notificación pertenece a la comunicación dirigida al usuario;
- el evento puede existir sin notificación;
- la notificación puede referirse a un evento;
- no todo evento genera una notificación;
- distintos usuarios pueden recibir notificaciones diferentes desde una misma situación;
- la notificación puede perder vigencia sin alterar el evento;
- ocultar una notificación no reescribe la historia;
- una notificación no ejecuta el hecho.

El evento conserva su procedencia y temporalidad.

La notificación conserva su motivo, destinatario, contexto y vigencia.

## 17. Temporalidad

Toda notificación se relaciona con un momento o período relevante para la atención del usuario.

La temporalidad puede depender de:

- fecha o plazo confirmado;
- proximidad del vencimiento;
- atraso;
- tiempo sin seguimiento;
- permanencia de un asunto abierto;
- momento de un cambio relevante;
- resolución posterior;
- revocación de acceso.

La notificación debe distinguir:

- cuándo surgió su motivo;
- cuándo resulta útil comunicarlo;
- hasta cuándo conserva vigencia.

Una fecha futura no confirmada no puede sustentar una notificación definitiva.

Si el compromiso cambia, se resuelve o pierde relevancia, la notificación debe reevaluar su vigencia sin modificar la historia.

Los umbrales temporales exactos no están definidos por los documentos base.

## 18. Reglas e invariantes

1. Una notificación informa.
2. Una notificación llama la atención.
3. Una notificación ayuda al usuario.
4. Toda notificación posee destinatario.
5. Toda notificación posee motivo.
6. Toda notificación posee contexto.
7. Toda notificación posee procedencia.
8. Toda notificación posee vigencia.
9. Una notificación puede perder vigencia.
10. Una notificación no es un evento.
11. Una notificación no reemplaza el evento.
12. Una notificación no reemplaza Conversation.
13. Una notificación no reemplaza Commitment.
14. Una notificación no reemplaza People.
15. Una notificación no reemplaza Memory.
16. Una notificación no concede permisos.
17. Una notificación no ejecuta acciones.
18. Una notificación no toma decisiones.
19. Una notificación no crea compromisos.
20. Una notificación no cambia estados.
21. Una notificación no registra seguimiento por sí sola.
22. Una notificación no resuelve asuntos.
23. No todo evento genera una notificación.
24. No todo mensaje genera una notificación.
25. No todo recuerdo genera una notificación.
26. La misma situación puede originar notificaciones distintas para usuarios distintos.
27. Cada destinatario requiere autorización propia.
28. Una relación no convierte a una persona en destinatario automático.
29. Un responsable no obtiene acceso automático.
30. El contenido aplica mínimo privilegio.
31. La pérdida de vigencia no modifica la fuente.
32. La desaparición de una notificación no modifica el evento.
33. Conversation conserva conversaciones.
34. Commitment conserva compromisos.
35. People conserva identidad.
36. Memory conserva información relevante.
37. La IA sólo sugiere la conveniencia de informar.
38. La IA no crea una notificación definitiva por sí sola.
39. Authorization determina quién puede recibirla.
40. La cantidad de notificaciones no es una medida de valor.
41. Una comunicación sin contexto no constituye seguimiento útil.

## 19. Casos de uso del MVP

**Recordar antes de un plazo**

El usuario recibe una comunicación contextual cuando un compromiso confirmado se aproxima a su fecha.

**Advertir un atraso**

El usuario comprende qué compromiso está atrasado, quién es responsable y cuál es su contexto.

**Recordar un asunto abierto**

El usuario reconoce que un compromiso continúa sin resolver.

**Solicitar atención sobre seguimiento**

La comunicación ayuda a revisar si hubo avances sin registrar un seguimiento automáticamente.

**Informar un cambio relevante**

El usuario autorizado conoce un cambio que requiere su atención sin que la notificación modifique el compromiso.

**Volver al contexto**

El destinatario puede alcanzar la conversación, compromiso, persona o recuerdo que ya está autorizado a consultar.

**Dejar sin vigencia una comunicación**

La notificación deja de llamar la atención cuando el asunto se resolvió, cambió o perdió relevancia.

**Aplicar revocación**

La notificación deja de exponer información si el destinatario pierde autorización.

**Diferenciar destinatarios**

Cuando exista colaboración aprobada, una misma situación se comunica de acuerdo con el permiso y contexto de cada usuario.

## 20. API conceptual

La API conceptual describe capacidades de negocio y resultados esperados. No define formas técnicas de entrega.

**Evaluar la conveniencia de informar**

Resultado esperado: se determina si una situación confirmada es relevante para un usuario.

**Identificar el motivo**

Resultado esperado: la notificación expresa por qué el asunto requiere atención.

**Determinar el destinatario**

Resultado esperado: se selecciona únicamente una persona autorizada y relacionada con el propósito.

**Obtener contexto autorizado**

Resultado esperado: se incluye sólo la información necesaria que el destinatario puede consultar.

**Establecer prioridad**

Resultado esperado: la atención requerida se expresa desde información confirmada y comprensible.

**Crear una notificación conceptual**

Resultado esperado: existe una comunicación con destinatario, motivo, contexto, procedencia y vigencia.

**Consultar una notificación**

Resultado esperado: el destinatario autorizado comprende el asunto sin recibir permisos adicionales.

**Volver al origen**

Resultado esperado: el destinatario alcanza únicamente la fuente que ya puede consultar.

**Reevaluar vigencia**

Resultado esperado: la notificación continúa vigente o deja de serlo según la situación y autorización actuales.

**Retirar una notificación sin vigencia**

Resultado esperado: deja de llamar la atención sin modificar el evento ni el recurso de origen.

**Solicitar ayuda de IA**

Resultado esperado: se obtiene una sugerencia derivada que no crea la comunicación definitiva.

**Distinguir notificaciones por destinatario**

Resultado esperado: cada usuario recibe sólo el contenido permitido para su propio contexto.

## 21. Criterios de aceptación

El modelo se considera definido correctamente para el MVP cuando:

1. Una notificación se define como comunicación dirigida.
2. Tiene destinatario, motivo, contexto, procedencia y vigencia.
3. Puede informar un hecho o una situación que requiere atención.
4. Se distingue de un evento.
5. Se distingue de una acción.
6. No reemplaza Conversation.
7. No reemplaza Commitment.
8. No reemplaza People.
9. No reemplaza Memory.
10. No ejecuta cambios.
11. No toma decisiones.
12. No concede permisos.
13. No todo evento produce una notificación.
14. No todo mensaje produce una notificación.
15. Una situación puede comunicarse de forma distinta a usuarios diferentes.
16. Cada destinatario se evalúa con autorización propia.
17. Puede perder vigencia sin alterar su origen.
18. Los compromisos próximos, atrasados y abiertos pueden motivar comunicaciones contextuales.
19. Una comunicación sobre seguimiento no registra seguimiento por sí sola.
20. La IA sólo sugiere y no crea la notificación definitiva.
21. Authorization limita destinatario y contenido.
22. El modelo permanece dentro del significado del negocio.

## 22. Decisiones pendientes

1. Definir los criterios exactos que hacen relevante una notificación.
2. Definir los niveles oficiales de prioridad, si fueran necesarios.
3. Definir cómo se relaciona la prioridad del compromiso con la prioridad de la notificación.
4. Definir cuánto antes de una fecha debe comunicarse proximidad.
5. Definir con qué frecuencia puede recordarse un asunto abierto.
6. Definir qué comportamiento cuenta como seguimiento útil.
7. Definir cómo se evita repetir comunicaciones sin utilidad.
8. Definir qué estados adicionales, si alguno, necesita una notificación.
9. Definir si se distinguirá entre comunicación vista, atendida o descartada.
10. Definir cuándo una notificación pierde vigencia.
11. Definir si un avance debe comunicarse y bajo qué condiciones.
12. Definir si una resolución debe comunicarse a personas distintas del propietario.
13. Definir si la colaboración básica estará habilitada en la primera beta.
14. Definir quién puede ser destinatario cuando el responsable no es el propietario.
15. Definir qué contexto puede comunicarse cuando el compromiso proviene de una conversación privada.
16. Definir el efecto exacto de una revocación sobre notificaciones ya consultadas.
17. Definir qué sugerencias de IA pueden considerarse al evaluar conveniencia o prioridad.
18. Definir qué información mínima debe mostrar una notificación para ser comprensible.
19. Definir si una notificación sin vigencia conserva alguna referencia recuperable para el usuario autorizado.
20. Definir qué eventos del MVP pueden motivar una notificación y cuáles nunca deben hacerlo.

Hasta resolver estas decisiones, no deben asumirse destinatarios, prioridad, repetición, estados adicionales ni plazos silenciosamente.

## 23. Resumen

Una notificación en Ping es una comunicación dirigida a un usuario autorizado para informarle de un hecho relevante o una situación que requiere atención.

La regla de propósito es:

> Una notificación ayuda a reconocer y comprender qué necesita atención.

La regla de separación es:

> La notificación sólo comunica; no es el evento, la fuente, el compromiso ni una acción.

La regla de relevancia es:

> No todo evento genera una notificación y el volumen no reemplaza la utilidad.

La regla de autorización es:

> Cada destinatario recibe únicamente el contexto que ya puede consultar.

Conversation conserva conversaciones y mensajes. Commitment conserva compromisos y su ciclo de vida. People conserva identidad y relaciones. Memory conserva información relevante. Events describe hechos ocurridos. Authorization determina quién puede recibir la comunicación. La IA sólo puede sugerir su conveniencia.

Una notificación puede perder vigencia o desaparecer sin alterar el hecho, la historia ni el recurso que la originó.

Su valor consiste en llamar la atención con contexto suficiente para que el usuario pueda recordar, seguir y resolver un asunto sin perder control.
