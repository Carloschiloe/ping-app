# Ping — Autorización y Permisos

Este documento define oficialmente el modelo conceptual de autorización y permisos de Ping para el MVP.

La autorización es un concepto de negocio que determina quién puede realizar una acción sobre información protegida. Este documento no prescribe mecanismos de implementación.

## 1. Propósito

El propósito del modelo de autorización es asegurar que cada persona pueda acceder, consultar, crear, confirmar, modificar, compartir o eliminar únicamente la información para la cual tiene permiso.

La autorización debe proteger:

- propiedad;
- privacidad;
- contexto;
- procedencia;
- decisiones del usuario;
- límites entre información personal y compartida;
- límites entre Conversation, Commitment, People y Memory;
- el alcance de la información utilizada por la IA.

El modelo debe permitir que Ping ayude a recordar, seguir y resolver asuntos sin exponer información ajena ni ampliar permisos por inferencia.

## 2. Alcance

Este documento cubre conceptualmente:

- actores que pueden solicitar acciones;
- recursos protegidos;
- acciones que requieren autorización;
- propiedad de la información;
- compartición;
- autorización por dominio;
- acceso de la IA;
- delegación;
- revocación;
- privacidad;
- decisiones pendientes del MVP.

El modelo responde:

- quién solicita una acción;
- sobre qué recurso;
- para qué acción;
- desde qué relación o propiedad;
- con qué alcance;
- si el permiso continúa vigente.

No define cómo se comprueba técnicamente la identidad ni cómo se implementan los controles.

## 3. Principios de autorización

**Mínimo privilegio**

Cada actor recibe únicamente el acceso necesario para la acción y el propósito autorizados.

**Autorización explícita**

Un acceso no nace de una suposición, coincidencia, relación o inferencia.

**Propiedad antes que conveniencia**

La información pertenece a alguien. La facilidad de uso no justifica exponerla.

**Autorización por recurso**

Poder consultar un recurso no concede acceso automático a otros recursos relacionados.

**Autorización por acción**

Poder consultar no implica poder modificar, confirmar, compartir o eliminar.

**Autorización vigente**

Cada consulta y acción debe respetar el permiso aplicable en ese momento.

**Compartición limitada**

Compartir una parte no comparte automáticamente todo el contexto del usuario.

**La relación no es permiso**

Ser mencionado, participante, responsable o persona relacionada no concede acceso fuera del alcance autorizado.

**La IA no amplía permisos**

La IA sólo utiliza la información que el usuario puede consultar para el propósito aprobado.

**Revocación efectiva**

Al revocar un permiso deben cesar los accesos futuros sin falsificar lo que ocurrió mientras el acceso estaba autorizado.

## 4. Actores

**Usuario propietario**

Persona a la que pertenece la información personal o el recuerdo y que conserva control sobre ella dentro de los límites aplicables.

**Participante autorizado**

Persona que puede acceder a una conversación compartida dentro del alcance de esa conversación.

**Persona relacionada**

Persona mencionada o vinculada con una conversación, compromiso o recuerdo. La relación no concede acceso por sí sola.

**Responsable de un compromiso**

Persona de quien se espera una acción, respuesta, revisión o decisión. Ser responsable no concede automáticamente permiso para consultar todo el compromiso ni su fuente.

**Usuario con quien se comparte un recurso**

Persona que recibe permiso explícito sobre un recurso determinado cuando la colaboración aprobada lo permita.

**Usuario que actúa sobre su propia información**

Actor principal del MVP, especialmente mediante self-chat, captura personal, compromisos propios y memoria personal.

**Inteligencia Artificial**

Capacidad transversal que procesa información en nombre de una solicitud autorizada. No es propietaria, no concede permisos y no actúa como autoridad independiente.

Los documentos base no definen actores administrativos, organizacionales ni externos para el MVP.

## 5. Recursos protegidos

Son recursos protegidos:

- conversaciones;
- self-chat;
- mensajes;
- capturas de texto;
- capturas de audio;
- archivos asociados cuando la capacidad esté habilitada;
- participantes;
- contexto conversacional;
- compromisos;
- propuestas de compromiso;
- propietarios;
- responsables;
- fechas y prioridades;
- estados;
- seguimientos;
- avances;
- resultados;
- historial relevante del compromiso;
- personas;
- referencias de personas;
- relaciones;
- contexto por persona;
- recuerdos;
- referencias de procedencia;
- contexto recuperado;
- información derivada por IA;
- resúmenes;
- relaciones sugeridas.

Cada recurso conserva los límites de su dominio de origen.

Una referencia hacia un recurso protegido no elimina la protección del recurso referido.

## 6. Acciones protegidas

Requieren autorización:

- acceder;
- consultar;
- recuperar;
- ver contexto;
- volver a una fuente;
- crear información confirmada;
- confirmar una propuesta;
- corregir;
- modificar;
- completar;
- relacionar;
- asignar un responsable;
- cambiar un estado;
- registrar seguimiento;
- registrar avance;
- resolver;
- registrar un resultado;
- compartir;
- revocar compartición;
- eliminar;
- utilizar información mediante IA;
- resumir;
- sugerir relaciones;
- responder preguntas con información protegida.

Cada acción se autoriza por separado según:

- actor;
- recurso;
- propiedad;
- relación autorizada;
- alcance;
- propósito;
- vigencia.

Tener permiso de lectura no implica permiso de modificación.

Tener permiso de modificación no implica permiso para compartir o eliminar.

Estar autorizado para recibir una sugerencia no significa que la sugerencia esté confirmada.

## 7. Propiedad de la información

La propiedad expresa a quién pertenece la información dentro de Ping.

**Conversación personal**

El self-chat y sus capturas pertenecen al usuario que lo utiliza.

**Conversación compartida**

Los documentos base reconocen participantes autorizados, pero no definen todavía una regla completa de propiedad sobre la conversación, cada mensaje o sus archivos.

**Compromiso**

Todo compromiso tiene un propietario. El responsable puede coincidir con el propietario o ser otra persona relacionada.

**Persona y relación**

La representación y la relación se entienden desde la perspectiva del usuario. Que dos usuarios conozcan a la misma persona no convierte sus contextos en información común.

**Recuerdo**

Todo recuerdo pertenece a un usuario y sólo puede utilizarse dentro de sus permisos.

**Información derivada**

Una salida de IA no adquiere permisos propios. Conserva la propiedad, procedencia y límites de las fuentes utilizadas.

La propiedad no debe inferirse desde:

- una mención;
- una responsabilidad;
- una coincidencia de identidad;
- una participación anterior;
- una relación personal;
- una sugerencia de IA.

## 8. Compartición de información

Compartir significa conceder a otra persona un alcance explícito sobre un recurso determinado.

La compartición debe indicar conceptualmente:

- qué recurso se comparte;
- con quién;
- para qué acciones;
- con qué contexto;
- durante qué vigencia;
- qué fuentes permanecen protegidas.

Compartir una conversación no implica compartir:

- toda la memoria del usuario;
- todos sus compromisos;
- otras conversaciones;
- todas sus relaciones con personas;
- recuerdos no relacionados;
- información privada obtenida desde otras fuentes.

Compartir un compromiso no implica compartir:

- conversaciones privadas no relacionadas;
- el contenido completo de la conversación de origen;
- otros compromisos;
- toda la memoria del propietario;
- todas las relaciones de las personas involucradas.

Si un compromiso compartido se origina en una conversación privada, la referencia a esa conversación no concede acceso automático a la fuente. El contexto que pueda mostrarse debe limitarse a lo autorizado.

La colaboración básica es opcional para el MVP. Sus reglas detalladas de compartición permanecen pendientes y no deben asumirse.

## 9. Autorización sobre conversaciones

Conversation administra conceptualmente el alcance de conversaciones, participantes y mensajes.

**Self-chat**

- el usuario propietario puede acceder a su conversación personal;
- no depende de otros participantes;
- no se comparte por inferencia;
- una persona mencionada no obtiene acceso.

**Conversación compartida**

- sólo pueden consultarla participantes autorizados;
- cada participante accede dentro del alcance concedido;
- participar no hace pública la conversación;
- la participación no concede acceso a otras conversaciones;
- la participación no concede acceso a toda la memoria de otros usuarios.

**Mensajes y capturas**

- conservan la protección de la conversación;
- una referencia desde Commitment o Memory no amplía el permiso;
- un archivo o audio mantiene controles coherentes con su origen;
- la IA sólo puede interpretarlos cuando la solicitud está autorizada.

Conversation no debe entregar contexto a Commitment, People, Memory o IA cuando la fuente no está autorizada.

Las reglas de edición, eliminación, incorporación o salida de participantes y compartición de archivos no están completamente definidas por los documentos base.

## 10. Autorización sobre compromisos

Commitment administra el ciclo de vida del compromiso dentro del alcance del propietario.

El propietario puede, cuando corresponda:

- consultar el compromiso;
- confirmar una propuesta;
- corregir información;
- asignar o corregir responsable;
- registrar seguimiento;
- registrar avances;
- cambiar estado;
- resolver;
- conservar un resultado;
- eliminar información que le pertenece.

Un responsable distinto del propietario:

- no obtiene acceso automático por ser responsable;
- no obtiene acceso a la conversación de origen;
- no obtiene acceso a la memoria completa del propietario;
- sólo puede actuar si existe una autorización explícita aprobada.

Una persona relacionada:

- no obtiene acceso por la relación;
- no puede modificar el compromiso por inferencia;
- no puede consultar fuentes privadas no relacionadas.

Compartir un compromiso debe limitarse al compromiso y contexto autorizado. La procedencia puede conservarse sin exponer el contenido protegido de la fuente.

La colaboración sobre compromisos y las acciones permitidas para personas distintas del propietario son decisiones pendientes.

## 11. Autorización sobre personas

People conserva identidad y relaciones desde la perspectiva del usuario.

El usuario puede consultar:

- representaciones que le pertenecen;
- relaciones que le pertenecen;
- contexto procedente de conversaciones autorizadas;
- contexto procedente de compromisos autorizados;
- asuntos recuperables dentro de Memory autorizada.

Una persona:

- no obtiene acceso por estar representada;
- no obtiene acceso por ser mencionada;
- no obtiene acceso por ser posible responsable;
- no obtiene acceso por ser participante en otra conversación;
- no obtiene acceso por coincidir con una identidad registrada.

Consultar por persona no amplía permisos. Sólo reúne recursos que el usuario ya puede consultar.

Una representación compartida no convierte toda la información de esa persona en pública.

Una posible coincidencia sugerida por IA no combina permisos, relaciones ni contextos.

## 12. Autorización sobre memoria

Memory sólo recupera información que el usuario ya está autorizado a consultar.

Cada recuerdo:

- pertenece a un usuario;
- conserva procedencia;
- conserva contexto;
- mantiene los permisos de sus fuentes;
- se evalúa dentro de la autorización vigente.

Consultar memoria por persona, fecha o conversación no concede acceso a:

- fuentes privadas;
- recursos revocados;
- información de otros usuarios;
- recuerdos no relacionados;
- contexto que el dominio de origen no puede entregar.

Memory no puede:

- utilizar una referencia antigua para evitar una revocación;
- recuperar contenido de una fuente no autorizada;
- mezclar recuerdos entre usuarios;
- hacer pública una relación compartida;
- ampliar permisos mediante relevancia o similitud.

Una referencia puede seguir formando parte de un historial autorizado sin permitir recuperar contenido cuya consulta futura fue revocada.

## 13. Autorización para la IA

La IA no posee permisos propios.

Sólo puede utilizar:

- información que el usuario solicitante puede consultar;
- información necesaria para la ayuda solicitada;
- contexto autorizado para ese propósito;
- fuentes cuya protección permita el uso.

La IA no puede:

- buscar información adicional fuera del alcance;
- acceder a conversaciones no autorizadas;
- consultar compromisos ajenos;
- incorporar relaciones privadas;
- acceder a recuerdos de otros usuarios;
- usar una relación para ampliar acceso;
- conservar hechos permanentes sin procedencia y confirmación;
- ejecutar cambios por iniciativa propia.

Una autorización para interpretar no es autorización para modificar.

Una autorización para resumir no es autorización para compartir.

Una autorización para sugerir no es autorización para confirmar.

Toda salida derivada conserva los límites de las fuentes utilizadas.

## 14. Delegación

Delegar significaría permitir que otra persona realice determinadas acciones sobre un recurso en nombre o dentro del alcance autorizado por su propietario.

Los documentos base no aprueban una capacidad general de delegación para el MVP.

No constituyen delegación:

- mencionar a una persona;
- relacionarla con un asunto;
- marcarla como responsable;
- incluirla como participante de una conversación;
- compartir una conversación;
- sugerir una acción mediante IA.

Mientras no exista una decisión explícita:

- nadie puede actuar sobre información ajena por inferencia;
- un responsable no puede modificar un compromiso sólo por ser responsable;
- un participante no puede administrar toda una conversación sólo por participar;
- la IA no puede actuar en nombre del usuario;
- People no puede trasladar permisos entre identidades.

Si la delegación se aprueba en el futuro, deberá definir recurso, acciones, alcance, vigencia, revocación y límites de propagación. Esos elementos no se establecen como funcionalidad del MVP en este documento.

## 15. Revocación

Revocar significa retirar una autorización previamente concedida.

La revocación debe:

- impedir accesos futuros;
- impedir nuevas consultas;
- impedir nuevas modificaciones;
- impedir nuevo uso por IA;
- impedir recuperación futura mediante Memory;
- aplicarse al recurso y acciones revocados;
- evitar accesos indirectos desde referencias o relaciones.

La revocación no debe:

- falsificar el historial de acciones que fueron autorizadas;
- borrar silenciosamente hechos del compromiso;
- modificar mensajes originales;
- presentar como no ocurrido un evento legítimo anterior;
- conceder acceso residual mediante información derivada.

El historial puede conservar que una acción ocurrió cuando estaba autorizada, sin mantener para la persona revocada acceso futuro al contenido protegido.

Los efectos exactos sobre copias visibles anteriormente, información derivada, archivos, relaciones y referencias no están resueltos por los documentos base.

## 16. Privacidad

La privacidad forma parte del comportamiento esperado de todos los dominios.

Ping debe asegurar conceptualmente:

- acceso mínimo y explícito;
- propiedad comprensible;
- compartición limitada;
- protección coherente de fuentes;
- corrección y eliminación cuando corresponda;
- uso limitado al propósito del producto;
- límites comprensibles para el usuario;
- ausencia de vigilancia;
- ausencia de perfiles inferidos no confirmados;
- ausencia de reutilización para fines ajenos.

La colaboración no elimina la propiedad.

Compartir un recurso no convierte la información relacionada en pública.

Las personas sólo deben acceder a información que les pertenece o para la cual tienen autorización.

La IA respeta exactamente los mismos límites y no obtiene excepciones por su función.

## 17. Reglas e invariantes

1. Toda consulta requiere autorización.
2. Toda acción importante requiere autorización.
3. Toda modificación requiere autorización.
4. Toda confirmación requiere autorización y decisión explícita del usuario.
5. Toda eliminación requiere autorización.
6. Toda compartición requiere autorización.
7. El permiso se evalúa para un actor, recurso y acción.
8. El acceso se limita al propósito autorizado.
9. Los permisos siguen el principio de mínimo privilegio.
10. La autorización nunca se amplía por inferencia.
11. Una relación no concede acceso.
12. Una mención no concede acceso.
13. Una responsabilidad no concede acceso.
14. Una coincidencia de identidad no concede acceso.
15. Una referencia no evita la protección de su fuente.
16. Poder consultar no implica poder modificar.
17. Poder modificar no implica poder compartir.
18. Poder compartir no implica poder eliminar.
19. Compartir una conversación no comparte toda la memoria.
20. Compartir un compromiso no comparte conversaciones privadas no relacionadas.
21. Compartir una persona no comparte todos sus contextos.
22. Cada recuerdo pertenece a un usuario.
23. Cada recurso conserva la protección de su dominio.
24. Conversation protege conversaciones y mensajes.
25. Commitment protege compromisos y su ciclo de vida.
26. People protege identidad y relaciones.
27. Memory sólo recupera información autorizada.
28. La IA sólo utiliza información autorizada.
29. La IA nunca amplía permisos.
30. La IA no confirma ni ejecuta decisiones importantes.
31. La información derivada conserva los permisos de sus fuentes.
32. La colaboración no convierte información en pública.
33. El self-chat no requiere colaboración.
34. Un responsable no es automáticamente un delegado.
35. No existe delegación general aprobada para el MVP.
36. La revocación impide accesos futuros.
37. La revocación no falsifica el historial autorizado.
38. Un permiso revocado no puede recuperarse mediante Memory o IA.
39. La información se usa sólo para recordar, comprender, seguir o resolver asuntos.

## 18. Casos de uso del MVP

**Consultar el self-chat**

El usuario accede a su conversación personal sin depender de colaboración.

**Registrar una captura propia**

El usuario crea texto o audio dentro de una conversación autorizada.

**Consultar una conversación compartida**

Cuando la colaboración básica esté habilitada, sólo los participantes autorizados acceden al alcance compartido.

**Interpretar una captura con IA**

La IA utiliza únicamente la captura y el contexto que el usuario puede consultar.

**Confirmar un compromiso sugerido**

Sólo un usuario autorizado puede confirmar, corregir, completar o rechazar la propuesta.

**Consultar un compromiso**

El propietario accede al compromiso y a su contexto autorizado.

**Modificar el ciclo de vida**

Las acciones de seguimiento, avance, cambio de estado y resolución requieren permiso sobre el compromiso.

**Consultar por persona**

El usuario recupera únicamente asuntos que ya puede consultar.

**Consultar por fecha**

El usuario recupera únicamente compromisos autorizados.

**Consultar por conversación**

El usuario recupera compromisos relacionados sin ampliar el permiso sobre otras fuentes.

**Corregir información propia**

El usuario modifica información corregible que le pertenece.

**Eliminar información propia**

El usuario elimina información cuando corresponde y dentro de sus límites.

**Compartir un recurso**

Cuando la capacidad aprobada lo permita, el usuario concede un alcance específico sin compartir recursos no relacionados.

**Revocar un acceso**

La persona revocada deja de poder realizar consultas o acciones futuras sobre el alcance retirado.

## 19. API conceptual

La API conceptual describe decisiones de negocio y resultados esperados. No define mecanismos ni interfaces técnicas.

**Evaluar una consulta**

Resultado esperado: se permite únicamente si el actor puede consultar el recurso en ese momento.

**Evaluar una acción**

Resultado esperado: se permite únicamente la acción autorizada sobre el recurso indicado.

**Obtener alcance autorizado**

Resultado esperado: se determina qué información y contexto puede utilizarse para el propósito solicitado.

**Consultar una conversación**

Resultado esperado: sólo un participante autorizado recibe conversación, mensajes y contexto permitido.

**Consultar un compromiso**

Resultado esperado: sólo un actor autorizado recibe el asunto y su contexto permitido.

**Consultar por persona**

Resultado esperado: se reúnen únicamente recursos que el usuario ya puede consultar.

**Recuperar memoria**

Resultado esperado: Memory devuelve información autorizada con procedencia sin ampliar acceso.

**Autorizar uso por IA**

Resultado esperado: la IA recibe sólo la información necesaria y permitida para la ayuda solicitada.

**Confirmar una propuesta**

Resultado esperado: la decisión se acepta únicamente del usuario autorizado y no de la IA.

**Modificar un recurso**

Resultado esperado: el cambio ocurre sólo si la acción y el recurso están dentro del permiso.

**Compartir un recurso**

Resultado esperado: se concede un alcance explícito sin propagación automática a recursos relacionados.

**Revocar una autorización**

Resultado esperado: cesan los accesos futuros dentro del alcance retirado.

**Corregir información**

Resultado esperado: el actor autorizado corrige sin alterar fuentes ajenas.

**Eliminar información**

Resultado esperado: el actor autorizado elimina lo permitido sin adquirir control sobre recursos relacionados.

## 20. Criterios de aceptación

El modelo se considera definido correctamente para el MVP cuando:

1. La autorización se expresa como concepto de negocio.
2. Todo acceso requiere permiso.
3. Toda consulta requiere permiso.
4. Toda acción importante requiere permiso.
5. Consultar, modificar, confirmar, compartir y eliminar se distinguen.
6. Los permisos aplican mínimo privilegio.
7. La propiedad de conversaciones personales, compromisos, relaciones y recuerdos es comprensible.
8. Una relación no concede acceso automático.
9. Un responsable no recibe acceso automático.
10. Un participante sólo accede a conversaciones autorizadas.
11. Compartir una conversación no comparte toda la memoria.
12. Compartir un compromiso no comparte conversaciones privadas no relacionadas.
13. Consultar por persona no amplía permisos.
14. Memory sólo recupera información autorizada.
15. La IA sólo utiliza información autorizada.
16. La IA no posee ni concede permisos.
17. La información derivada conserva límites de sus fuentes.
18. No existe delegación por inferencia.
19. La revocación impide accesos futuros.
20. La revocación no falsifica el historial autorizado.
21. Las fuentes mantienen su protección al relacionarse.
22. La colaboración no convierte información en pública.
23. El usuario conserva control sobre corrección y eliminación cuando corresponda.
24. El documento se limita al modelo conceptual de negocio.

## 21. Decisiones pendientes

1. Definir si la primera validación será exclusivamente personal o incluirá colaboración básica.
2. Definir qué recursos podrán compartirse durante la primera beta.
3. Definir la propiedad conceptual de una conversación compartida.
4. Definir la propiedad conceptual de cada mensaje dentro de una conversación compartida.
5. Definir qué acciones puede realizar cada participante de una conversación compartida.
6. Definir cómo se incorpora o retira un participante.
7. Definir qué ocurre con el acceso a mensajes anteriores al incorporar un participante.
8. Definir si un compromiso podrá compartirse en el MVP.
9. Definir qué acciones puede realizar una persona distinta del propietario sobre un compromiso compartido.
10. Definir si un responsable distinto del propietario puede recibir acceso y bajo qué alcance.
11. Definir qué contexto puede mostrarse cuando un compromiso compartido proviene de una conversación privada.
12. Definir si existirá delegación en una versión posterior al MVP.
13. Definir qué acciones, recursos y vigencia permitiría una eventual delegación.
14. Definir el efecto de revocar acceso a una conversación sobre compromisos derivados.
15. Definir el efecto de revocar acceso a un compromiso sobre recuerdos y referencias.
16. Definir el tratamiento de información derivada creada durante un acceso posteriormente revocado.
17. Definir qué ocurre con archivos o audios después de una revocación.
18. Definir cómo se conserva el historial autorizado sin exponer contenido tras la revocación.
19. Definir la relación entre corrección, eliminación, procedencia e historial compartido.
20. Definir qué actor puede eliminar recursos compartidos.
21. Definir el alcance inicial de consultas por persona cuando existan contactos y usuarios registrados.

Hasta resolver estas decisiones, ningún acceso, compartición, delegación o propagación de permisos debe asumirse silenciosamente.

## 22. Resumen

La autorización en Ping determina quién puede realizar una acción sobre un recurso protegido.

Se basa en propiedad, mínimo privilegio, alcance explícito, propósito y vigencia.

La regla de acceso es:

> Toda consulta y toda acción importante requieren autorización.

La regla de compartición es:

> Compartir un recurso no comparte automáticamente los recursos relacionados.

La regla de inferencia es:

> Una relación, responsabilidad, coincidencia o sugerencia nunca amplía permisos.

La regla de revocación es:

> Revocar impide accesos futuros sin falsificar el historial que fue autorizado.

Conversation protege conversaciones y mensajes. Commitment protege compromisos y su ciclo de vida. People protege identidad y relaciones. Memory recupera sólo información autorizada. La IA utiliza únicamente el alcance que el usuario ya puede consultar.

El modelo no concede delegación por inferencia ni convierte colaboración en información pública.

Su valor consiste en que Ping pueda conectar conversación, persona, compromiso y memoria sin perder propiedad, privacidad ni control del usuario.
