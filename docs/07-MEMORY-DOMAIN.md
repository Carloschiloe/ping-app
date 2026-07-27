# Ping — Dominio Memory

Este documento define oficialmente el dominio conceptual y funcional Memory de Ping para el MVP.

## 1. Propósito del dominio

Memory permite conservar, recuperar y contextualizar información relevante para que el usuario pueda recordar, comprender, seguir y resolver asuntos importantes.

Su propósito es ayudar al usuario a responder, dentro de su autorización:

- qué asunto no debía perder;
- por qué existe;
- dónde y cuándo surgió;
- con quién está relacionado;
- quién quedó responsable;
- qué seguimientos y avances ocurrieron;
- si sigue abierto o ya se resolvió;
- qué resultado se obtuvo.

Memory conecta información autorizada de Conversation, Commitment y People sin sustituir esos dominios ni sus fuentes originales.

## 2. Responsabilidades del dominio

Memory es responsable de:

- reconocer qué información aprobada debe poder recordarse;
- conservar referencias a fuentes identificables;
- mantener contexto suficiente para comprender un asunto;
- recuperar conversaciones y mensajes autorizados cuando resulten relevantes;
- recuperar compromisos confirmados;
- recuperar seguimientos, avances y resultados;
- recuperar relaciones relevantes con personas;
- permitir consultas por persona, fecha o conversación;
- conservar la evolución relevante de un asunto;
- distinguir información original, confirmada, derivada e incierta;
- mantener propiedad y autorización;
- respetar la protección de cada fuente;
- permitir corrección o eliminación cuando corresponda;
- evitar que una inferencia se convierta en hecho permanente sin confirmación;
- reconocer ambigüedad o contradicción;
- ayudar a volver desde un recuerdo hacia su contexto de origen.

Memory organiza la capacidad de recordar. No acumula por defecto todo lo que Ping puede registrar.

## 3. Límites del dominio

Memory no es:

- una copia completa de todas las conversaciones;
- un historial de todo lo ocurrido;
- una cronología infinita;
- un sistema de respaldo;
- un repositorio indiscriminado;
- un data lake;
- una base vectorial;
- un sistema de embeddings;
- un buscador semántico;
- un sistema RAG;
- una tecnología concreta;
- una inteligencia autónoma.

Memory no es responsable de:

- conservar la conversación como fuente original;
- administrar mensajes;
- crear o confirmar compromisos;
- administrar el ciclo de vida de compromisos;
- definir la identidad de las personas;
- decidir qué es verdad;
- inventar hechos;
- corregir automáticamente información histórica;
- fusionar recuerdos ambiguos;
- ampliar permisos;
- reemplazar fuentes por resúmenes;
- ejecutar acciones importantes por el usuario.

Conversation conserva la conversación. Commitment conserva el compromiso. People conserva identidad y relaciones. Memory conserva únicamente aquello que debe poder recordarse y recuperarse con contexto.

## 4. Qué significa recordar en Ping

Recordar significa poder recuperar información relevante y autorizada de forma que el usuario comprenda:

- qué ocurrió;
- por qué importa;
- quién estuvo relacionado;
- cuándo surgió;
- de dónde provino;
- quién quedó responsable;
- qué cambió;
- qué seguimiento hubo;
- cuál es la situación actual;
- qué resultado se alcanzó.

Recordar no se limita a devolver una frase o un elemento aislado.

Un recuerdo útil debe:

- pertenecer a un usuario;
- tener procedencia;
- mantener contexto;
- relacionarse con sus fuentes;
- poder consultarse;
- poder corregirse;
- poder eliminarse cuando corresponda;
- distinguir información confirmada de información derivada;
- respetar autorización.

Recordar es mantener comprensible un asunto a través del tiempo, no conservar el mayor volumen posible de datos.

## 5. Qué no significa recordar

Recordar no significa:

- almacenar absolutamente todo;
- guardar cada evento para siempre;
- duplicar conversaciones completas;
- convertir cada mensaje en recuerdo;
- convertir cada mención en un hecho;
- tratar una sugerencia como confirmación;
- tratar un resumen como fuente;
- completar vacíos con inferencias;
- elegir una versión como verdadera sin evidencia;
- fusionar asuntos sólo porque se parecen;
- exponer información no autorizada;
- conservar datos sin propósito;
- producir respuestas sin contexto;
- reemplazar la responsabilidad de Conversation, Commitment o People;
- usar una tecnología particular.

Una información puede existir en su dominio de origen sin convertirse automáticamente en un recuerdo relevante.

## 6. Entidades y objetos conceptuales

**Memory Item**

Representación conceptual de información relevante que debe poder recuperarse para un usuario con contexto y procedencia.

**Memory Owner**

Usuario al que pertenece el recuerdo y desde cuya autorización puede recuperarse.

**Source Reference**

Relación identificable con la conversación, mensaje, captura, compromiso, evento o persona que sustenta el recuerdo.

**Context Reference**

Relación con la información autorizada necesaria para comprender el asunto sin copiar toda su fuente.

**Remembered Commitment**

Referencia recuperable a un compromiso confirmado y a su evolución relevante.

**Remembered Conversation Origin**

Referencia recuperable a la conversación o mensaje que permite comprender el origen de un asunto.

**Remembered Person Relationship**

Relación recuperable entre una persona y asuntos autorizados del usuario.

**Remembered Commitment Event**

Referencia a un seguimiento, avance, cambio o resultado relevante para comprender la evolución de un compromiso.

**Temporal Context**

Fecha o momento relevante confirmado que ayuda a situar el origen, plazo, seguimiento o resolución.

**Derived Memory Aid**

Resumen, relación o interpretación producida para ayudar a recuperar contexto. Permanece identificada como derivada y no constituye una fuente ni un hecho permanente por sí sola.

**Unresolved Memory Relation**

Posible relación entre recuerdos o fuentes que permanece ambigua hasta que exista confirmación suficiente del usuario.

## 7. Tipos de recuerdos

En el MVP, Memory se forma principalmente a partir de los siguientes tipos conceptuales.

**Recuerdo de compromiso**

Permite recuperar un compromiso confirmado con propietario, responsable, estado, fecha cuando corresponda y contexto.

**Recuerdo de origen conversacional**

Permite volver a la conversación, mensaje o captura que explica por qué existe un asunto.

**Recuerdo de evolución**

Permite comprender seguimientos, avances, cambios relevantes y acciones posteriores de un compromiso.

**Recuerdo de resolución**

Permite recuperar el cierre y el resultado comprensible de un asunto.

**Recuerdo relacionado con una persona**

Permite recuperar asuntos autorizados vinculados con una persona, como promesas, solicitudes, responsabilidades y resultados.

**Recuerdo temporal**

Permite situar un asunto por fecha de origen, fecha o plazo confirmado, seguimiento o resolución.

**Recuerdo de procedencia**

Permite alcanzar la fuente original que sustenta una información recordada.

**Ayuda derivada de memoria**

Permite utilizar un resumen o una relación sugerida para orientar la comprensión, siempre distinguida de la fuente y sujeta a confirmación cuando pretenda convertirse en información permanente.

Estos tipos no implican estructuras físicas ni obligan a duplicar la información conservada por otros dominios.

## 8. Procedencia y contexto

Ningún recuerdo existe sin una procedencia identificable.

La procedencia debe permitir comprender:

- qué fuente sustenta la información;
- en qué dominio se conserva la fuente;
- cuándo surgió;
- qué usuario es propietario;
- qué permisos se aplican;
- si la información es original, confirmada o derivada.

La fuente puede ser:

- una conversación;
- un mensaje;
- una captura;
- un compromiso confirmado;
- un evento relevante del compromiso;
- una persona relacionada dentro de un contexto autorizado.

El contexto debe permitir comprender:

- por qué importa el asunto;
- con quién está relacionado;
- qué se esperaba;
- quién quedó responsable;
- qué ocurrió después;
- cuál es su situación o resultado.

Memory conserva la relación con la fuente. No reemplaza el contenido original ni modifica su significado.

Si el contexto es insuficiente, Memory debe reconocerlo. No puede fabricar la explicación que falta.

## 9. Relevancia y permanencia

La relevancia se determina por la utilidad de la información para comprender, recordar, seguir o resolver un asunto importante.

En el MVP, son principalmente relevantes:

- compromisos confirmados;
- conversaciones y mensajes de origen;
- personas relacionadas;
- fechas y responsables;
- estados;
- seguimientos;
- avances;
- resultados;
- eventos necesarios para reconstruir la evolución.

No son relevantes por defecto:

- todos los mensajes;
- todas las menciones;
- toda actividad;
- toda información disponible;
- toda salida generada por IA;
- todo evento técnico;
- toda relación posible.

Permanencia no significa conservación infinita.

La información recordada:

- puede cambiar cuando cambia su fuente confirmada;
- puede corregirse;
- puede eliminarse cuando corresponda;
- puede dejar de ser necesaria;
- debe conservar procedencia mientras sea recuperable;
- no debe mantenerse sólo por volumen o conveniencia.

Los documentos base no definen reglas definitivas de selección, retención, expiración ni eliminación. Esas decisiones deben permanecer pendientes.

## 10. Recuperación de información

Recuperar significa presentar información autorizada con suficiente contexto para que el usuario pueda reconocer y comprender el asunto.

Memory puede recuperar:

- conversaciones;
- mensajes;
- compromisos;
- seguimientos;
- avances;
- resultados;
- personas y relaciones relevantes;
- contexto autorizado.

El MVP debe permitir recuperar asuntos:

- por persona;
- por fecha;
- por conversación.

La recuperación debe:

- respetar al propietario;
- comprobar la autorización vigente;
- conservar procedencia;
- distinguir fuentes de información derivada;
- mantener incertidumbre cuando exista;
- evitar resultados aislados que pierdan significado;
- permitir volver al origen cuando corresponda.

Recuperar una conversación no significa que Memory la copie. Conversation entrega la fuente autorizada.

Recuperar un compromiso no significa que Memory administre su estado. Commitment entrega su situación confirmada.

Recuperar una persona no significa que Memory defina su identidad. People entrega su representación autorizada.

## 11. Evolución de un recuerdo

Un recuerdo puede evolucionar cuando evoluciona el asunto que representa.

Su ciclo conceptual puede incluir:

1. **Origen:** una captura, conversación o mensaje aporta una fuente.
2. **Interpretación:** Ping puede proponer una relación o un posible compromiso.
3. **Confirmación:** el usuario confirma la información relevante antes de que una inferencia se trate como permanente.
4. **Incorporación:** el compromiso confirmado y su procedencia pasan a poder recuperarse.
5. **Enriquecimiento contextual confirmado:** personas, fechas, responsables o contexto se corrigen o completan.
6. **Seguimiento:** se incorporan eventos relevantes para comprender qué ocurrió.
7. **Avance:** se conserva evolución sin asumir resolución.
8. **Resolución:** se incorpora el resultado comprensible del compromiso.
9. **Consulta posterior:** el usuario recupera el asunto con su contexto.
10. **Corrección o eliminación:** el usuario conserva control sobre la información cuando corresponda.

La evolución de un recuerdo no autoriza:

- reescribir su fuente;
- convertir una inferencia en hecho;
- ocultar contradicciones;
- fusionar asuntos ambiguos;
- conservar un historial infinito.

Los cambios relevantes deben poder comprenderse sin que Memory duplique el historial completo de los dominios de origen.

## 12. Relaciones con personas

Memory permite recuperar información autorizada por persona.

Puede relacionar una persona con:

- conversaciones autorizadas;
- mensajes de origen;
- compromisos;
- promesas;
- solicitudes;
- responsabilidades;
- asuntos abiertos;
- seguimientos;
- resultados.

Una persona no sustituye el contexto del asunto.

Mostrar “Juan” no basta para explicar:

- qué se prometió;
- quién es responsable;
- cuándo surgió;
- qué seguimiento ocurrió;
- qué resultado se obtuvo.

People conserva identidad y relaciones desde la perspectiva del usuario. Memory utiliza esas referencias para recuperar asuntos autorizados.

Una coincidencia ambigua entre personas no permite unir recuerdos. La IA puede sugerir la relación, pero el usuario debe conservar el control.

## 13. Relaciones con conversaciones

Memory permite volver a conversaciones y mensajes que actúan como fuente.

Conversation conserva:

- conversaciones;
- participantes;
- mensajes;
- capturas;
- secuencia;
- archivos o audios asociados cuando corresponda;
- procedencia conversacional.

Memory conserva únicamente:

- la referencia necesaria para recuperar la fuente;
- el contexto relevante para reconocer el asunto;
- la relación autorizada con compromisos y personas.

Una conversación no se convierte completa en memoria permanente por existir.

Un resumen no sustituye la conversación.

Cuando Memory recupera un asunto, el usuario debe poder comprender o alcanzar la conversación y el mensaje de origen si mantiene autorización.

Si la fuente fue eliminada o ya no está autorizada, Memory no puede reconstruirla mediante invención.

## 14. Relaciones con compromisos

Commitment aporta el núcleo principal de memoria del MVP.

Memory puede recuperar:

- descripción confirmada;
- propietario;
- responsable;
- personas relacionadas;
- origen;
- contexto;
- fecha o plazo;
- estado;
- prioridad cuando corresponda;
- seguimientos;
- avances;
- resultado;
- eventos y cambios relevantes.

Un compromiso no sustituye su procedencia.

Memory no:

- crea compromisos;
- confirma propuestas;
- cambia responsables;
- decide estados;
- registra avances por sí sola;
- resuelve asuntos;
- modifica resultados;
- reemplaza el historial confirmado.

Commitment administra el ciclo de vida. Memory permite recuperar su evolución con contexto y procedencia.

## 15. Información derivada por IA

La IA puede ayudar a:

- interpretar lenguaje natural;
- detectar posibles compromisos;
- extraer fechas y responsables;
- resumir contexto;
- sugerir seguimientos;
- sugerir relaciones útiles;
- responder preguntas sobre información autorizada.

Toda información derivada debe:

- identificarse como derivada;
- conservar la fuente utilizada;
- respetar autorización;
- expresar incertidumbre cuando exista;
- permanecer distinguible de la información original o confirmada;
- permitir revisión del usuario cuando pretenda producir un cambio relevante.

Un resumen:

- puede ayudar a comprender;
- no sustituye una conversación;
- no sustituye un mensaje;
- no constituye por sí solo una verdad permanente;
- no puede ocultar contradicciones con la fuente.

Una relación sugerida:

- puede orientar la recuperación;
- no fusiona recuerdos;
- no confirma identidad;
- no crea un hecho permanente sin confirmación.

Memory no decide si una salida de IA es verdadera. La fuente y la información confirmada conservan su papel.

## 16. Control del usuario

El usuario debe conservar control sobre la información recordada que le pertenece.

Debe poder:

- comprender qué se recuerda;
- ver de dónde proviene;
- distinguir lo original de lo derivado;
- corregir información cuando corresponda;
- eliminar información cuando corresponda;
- rechazar sugerencias;
- evitar que una relación ambigua se confirme automáticamente;
- reconocer qué información será utilizada antes de una acción importante.

Una corrección no debe:

- reescribir silenciosamente la fuente;
- ocultar la historia relevante;
- cambiar información de otro usuario;
- tratar una inferencia como confirmación.

Una eliminación debe respetar:

- propiedad;
- autorización;
- procedencia;
- relaciones con fuentes;
- límites entre dominios.

Los efectos exactos de corregir o eliminar información relacionada entre varios dominios no están resueltos por los documentos base.

## 17. Privacidad y autorización

Cada recuerdo pertenece a un usuario.

Memory sólo puede recuperar:

- información que pertenece al usuario;
- información para la cual el usuario mantiene autorización;
- contexto que los dominios de origen pueden entregar legítimamente.

Memory nunca amplía permisos.

Una consulta por persona no autoriza:

- otras conversaciones de esa persona;
- compromisos de otros usuarios;
- mensajes privados;
- archivos o audios no autorizados;
- relaciones ajenas.

Una conversación compartida no convierte todos los recuerdos relacionados en públicos.

La fuente conserva su protección:

- mensajes mantienen los límites de Conversation;
- compromisos mantienen los límites de Commitment;
- personas mantienen los límites de People;
- archivos y audios mantienen controles coherentes con su origen.

La IA recibe únicamente la información que el usuario ya puede consultar. Su uso no concede acceso adicional.

## 18. Reglas e invariantes

1. Memory conserva sólo información relevante para recordar, comprender, seguir o resolver.
2. Memory no almacena absolutamente todo.
3. El volumen no determina relevancia.
4. Todo Memory Item pertenece a un usuario.
5. Ningún recuerdo existe sin procedencia identificable.
6. Todo recuerdo recuperado conserva contexto suficiente para ser comprendido.
7. La fuente original permanece distinguible.
8. La información derivada nunca reemplaza la fuente.
9. Un resumen no sustituye una conversación.
10. Un compromiso no sustituye su procedencia.
11. Una persona no sustituye el contexto de un asunto.
12. Memory no decide qué es verdad.
13. Memory no inventa hechos.
14. Memory no corrige automáticamente información histórica.
15. Memory no fusiona recuerdos ambiguos.
16. La IA sólo puede sugerir relaciones o recuerdos útiles.
17. Una inferencia no se vuelve permanente sin confirmación.
18. La incertidumbre debe permanecer visible.
19. Una contradicción no debe ocultarse.
20. Memory sólo recupera información autorizada.
21. Memory nunca amplía permisos.
22. Una consulta por persona no concede acceso adicional.
23. Una relación compartida no hace pública toda la información.
24. La protección de la fuente se conserva al recuperar.
25. Conversation conserva conversaciones y mensajes.
26. Commitment conserva el ciclo de vida del compromiso.
27. People conserva identidad y relaciones.
28. Memory no duplica las responsabilidades de esos dominios.
29. El usuario puede corregir o eliminar información cuando corresponda.
30. Las correcciones no reescriben silenciosamente la fuente.
31. Las eliminaciones respetan propiedad y autorización.
32. Los cambios relevantes pueden recuperarse sin conservar una cronología infinita.
33. Los resúmenes se identifican como derivados.
34. Memory no es una base vectorial.
35. Memory no es un sistema RAG.
36. Memory no es un sistema de embeddings.
37. Memory no es un data lake.
38. Memory no es un historial completo.
39. Memory no es un sistema de respaldo.
40. Memory no es una inteligencia autónoma.
41. La información sólo se utiliza para comprender, recordar, seguir o resolver asuntos.

## 19. Casos de uso obligatorios del MVP

**Recordar un compromiso confirmado**

El usuario puede recuperar el compromiso con responsable, contexto, estado y procedencia.

**Volver al origen**

El usuario puede alcanzar la conversación, mensaje o captura autorizada que originó un asunto.

**Consultar pendientes por persona**

El usuario recupera asuntos autorizados relacionados con una persona sin ampliar permisos.

**Consultar por fecha**

El usuario recupera compromisos y asuntos desde fechas o plazos confirmados.

**Consultar por conversación**

El usuario recupera compromisos vinculados con una conversación autorizada.

**Recordar seguimientos**

El usuario puede comprender qué acciones, preguntas o respuestas relevantes ocurrieron.

**Recordar avances**

El usuario puede reconocer qué cambió sin confundir avance con resolución.

**Recordar un resultado**

El usuario puede recuperar cómo terminó un compromiso y qué ocurrió finalmente.

**Comprender una relación**

El usuario puede reconocer con quién está relacionado un asunto y por qué.

**Distinguir una ayuda derivada**

El usuario puede reconocer que un resumen o relación sugerida no es la fuente.

**Corregir información recordada**

El usuario conserva control sobre información corregible que le pertenece.

**Eliminar información recordada**

El usuario puede eliminar cuando corresponda sin obtener acceso ni control sobre información ajena.

## 20. Interacción con Conversation

Conversation aporta a Memory:

- conversaciones de origen;
- mensajes de origen;
- capturas de texto o audio;
- contexto conversacional;
- participantes autorizados;
- referencias de procedencia;
- archivos asociados cuando corresponda.

Memory:

- conserva referencias recuperables;
- selecciona sólo contexto relevante;
- solicita la fuente dentro de la autorización vigente;
- permite volver al origen;
- distingue mensajes originales de resúmenes.

Memory no:

- copia toda conversación;
- conserva todos los mensajes como recuerdos;
- modifica contenido;
- altera participantes;
- amplía permisos;
- sustituye una conversación por un resumen;
- inventa contenido cuando la fuente falta.

Conversation conserva la conversación. Memory conserva la capacidad de recordarla cuando es relevante para un asunto.

## 21. Interacción con Commitment

Commitment aporta a Memory:

- compromisos confirmados;
- propietario;
- responsable;
- personas relacionadas;
- contexto;
- procedencia;
- fechas o plazos;
- estados;
- prioridad cuando corresponda;
- seguimientos;
- avances;
- resultados;
- cambios y eventos relevantes.

Memory:

- permite recuperar la situación del asunto;
- conecta evolución con origen;
- permite consultar por persona, fecha o conversación;
- conserva referencias suficientes para comprender el cierre.

Memory no:

- convierte propuestas en compromisos;
- administra estados;
- determina atrasos;
- registra seguimientos o avances por sí sola;
- resuelve compromisos;
- modifica resultados;
- sustituye la procedencia.

Commitment conserva el compromiso. Memory conserva la capacidad de recuperarlo con su contexto relevante.

## 22. Interacción con People

People aporta a Memory:

- identidad comprensible;
- referencias de personas;
- relaciones desde la perspectiva del usuario;
- distinción entre identidad confirmada e incompleta;
- contexto autorizado por persona;
- posibles coincidencias aún no confirmadas.

Memory:

- permite recuperar asuntos por persona;
- mantiene la relación con compromisos y conversaciones autorizadas;
- conserva la ambigüedad cuando existe;
- evita mezclar recuerdos de personas parecidas.

Memory no:

- define identidades;
- confirma coincidencias;
- fusiona personas;
- construye perfiles inferidos;
- transforma una relación en permiso;
- sustituye el contexto por el nombre de una persona.

People conserva identidad. Memory conserva la capacidad de recuperar asuntos autorizados vinculados con ella.

## 23. Información que debe conservarse

Memory debe conservar conceptualmente:

- propietario del recuerdo;
- referencia a la fuente;
- dominio responsable de la fuente;
- procedencia identificable;
- contexto suficiente;
- propósito de recuperación relacionado con el asunto;
- relación con conversación o mensaje de origen;
- relación con compromiso confirmado;
- relación con personas autorizadas;
- fechas relevantes confirmadas;
- responsable confirmado;
- estado recuperable del compromiso;
- seguimientos relevantes;
- avances relevantes;
- resultado;
- cambios necesarios para comprender la evolución;
- distinción entre información original, confirmada, derivada e incierta;
- límites de autorización;
- correcciones o eliminaciones aplicables;
- decisiones del usuario sobre sugerencias relevantes.

Memory debe permitir reconstruir, sin duplicar todas las fuentes:

- cómo nació el asunto;
- por qué importa;
- quién está relacionado;
- quién quedó responsable;
- qué ocurrió después;
- qué permanece abierto;
- qué seguimiento se realizó;
- cómo se resolvió;
- qué resultado se obtuvo;
- dónde puede consultarse la fuente.

## 24. Información que no pertenece al dominio

No pertenece a Memory:

- el contenido completo administrado por Conversation;
- la secuencia total de todos los mensajes;
- todos los eventos ocurridos;
- el ciclo de vida administrado por Commitment;
- la identidad administrada por People;
- perfiles enriquecidos de personas;
- información sin procedencia;
- inferencias tratadas como hechos;
- resúmenes tratados como fuente;
- decisiones autónomas;
- permisos ampliados;
- copias de respaldo;
- cronologías infinitas;
- actividad técnica;
- registros cuyo único propósito sea volumen;
- un índice tecnológico específico;
- vectores;
- embeddings;
- mecanismos de búsqueda concretos;
- componentes de un sistema RAG;
- almacenamiento masivo indiscriminado;
- tecnologías o arquitectura física;
- información utilizada con fines distintos de recordar, comprender, seguir o resolver.

Memory mantiene referencias, relevancia y contexto. Los dominios de origen conservan sus propios conceptos.

## 25. Errores y situaciones ambiguas

**La información no tiene fuente identificable**

No puede convertirse en recuerdo permanente. Debe conservarse como incertidumbre o descartarse según una decisión todavía no definida.

**El contexto es insuficiente**

Memory debe reconocerlo y permitir volver a la fuente si existe autorización. No inventa una explicación.

**La fuente no está autorizada**

No se recupera contenido ni contexto.

**La autorización cambió**

Memory no puede conservar acceso mediante una referencia anterior.

**Un resumen contradice la fuente**

La fuente prevalece. El resumen permanece derivado y la contradicción no debe ocultarse.

**Dos recuerdos parecen referirse al mismo asunto**

No se fusionan automáticamente. La relación puede permanecer ambigua o sugerirse para confirmación.

**Dos personas parecidas aparecen en recuerdos distintos**

People mantiene la ambigüedad y Memory evita mezclar sus asuntos.

**Una inferencia parece útil**

Puede presentarse como sugerencia, pero no se convierte en hecho permanente sin confirmación.

**El usuario corrige información**

La corrección no reescribe silenciosamente la fuente ni borra la distinción entre original y derivado.

**El usuario elimina la fuente**

Debe respetarse su control, pero el tratamiento de referencias, contexto restante y procedencia queda pendiente.

**La fuente fue corregida en su dominio**

Memory debe recuperar la información autorizada vigente sin inventar una reconciliación histórica.

**Un asunto dejó de ser relevante**

Los documentos base no definen cuándo debe dejar de recuperarse ni cuánto tiempo conservar sus referencias.

**La recuperación produce demasiada información**

El volumen no debe sustituir la relevancia. Los criterios de selección y orden permanecen pendientes.

**La información deriva de varios asuntos**

No se asume que todos forman una única memoria. Cada relación debe conservar procedencia.

## 26. API conceptual del dominio

La API conceptual describe capacidades y resultados. No define endpoints, estructuras físicas, algoritmos ni tecnologías.

**Incorporar una referencia recordable**

Resultado esperado: la información relevante queda vinculada con propietario, procedencia, contexto y autorización.

**Obtener un recuerdo autorizado**

Resultado esperado: se entrega información comprensible y su fuente, o se rechaza el acceso.

**Recuperar por persona**

Resultado esperado: se obtienen asuntos autorizados relacionados con una identidad o referencia comprensible.

**Recuperar por fecha**

Resultado esperado: se obtienen asuntos asociados con fechas o plazos confirmados.

**Recuperar por conversación**

Resultado esperado: se obtienen compromisos y contexto vinculados con una conversación autorizada.

**Recuperar un compromiso**

Resultado esperado: se entrega su situación confirmada, evolución relevante, resultado y procedencia.

**Recuperar el origen**

Resultado esperado: se alcanza la conversación, mensaje o captura autorizada conservada por Conversation.

**Recuperar evolución**

Resultado esperado: se comprenden seguimientos, avances, cambios y resolución sin exigir un historial infinito.

**Recuperar contexto por persona**

Resultado esperado: se comprenden promesas, solicitudes, responsabilidades y resultados autorizados.

**Presentar una ayuda derivada**

Resultado esperado: el resumen o relación aparece como derivado, con procedencia y sin reemplazar la fuente.

**Proponer una relación entre recuerdos**

Resultado esperado: la posible relación permanece pendiente de confirmación y no fusiona información.

**Registrar la decisión del usuario**

Resultado esperado: una propuesta se confirma, corrige o rechaza sin convertir silenciosamente una inferencia en hecho.

**Corregir información recordada**

Resultado esperado: se respeta el control del usuario y se mantiene la distinción con la fuente original.

**Eliminar información recordada**

Resultado esperado: se aplica la eliminación autorizada sin ampliar control sobre otras fuentes o usuarios.

**Comprobar autorización de recuperación**

Resultado esperado: sólo se entrega información que el usuario puede consultar en ese momento.

**Entregar contexto a una consulta autorizada**

Resultado esperado: la información recuperada permite comprender el asunto y alcanzar su procedencia.

## 27. Criterios de aceptación

Memory se considera definido correctamente para el MVP cuando:

1. Conserva sólo información relevante para recordar, comprender, seguir o resolver.
2. No convierte todo lo ocurrido en memoria permanente.
3. Todo recuerdo pertenece a un usuario.
4. Todo recuerdo tiene procedencia identificable.
5. Toda recuperación mantiene contexto suficiente.
6. El usuario puede volver a la fuente cuando mantiene autorización.
7. El usuario puede recuperar conversaciones y mensajes relevantes.
8. El usuario puede recuperar compromisos confirmados.
9. El usuario puede recuperar seguimientos, avances y resultados.
10. El usuario puede recuperar relaciones relevantes con personas.
11. El usuario puede consultar por persona, fecha o conversación.
12. Una conversación continúa conservada por Conversation.
13. Un compromiso continúa conservado por Commitment.
14. Una identidad continúa conservada por People.
15. Memory no duplica las responsabilidades de esos dominios.
16. Un resumen permanece distinguible de una conversación.
17. Un compromiso conserva su procedencia.
18. Una persona no sustituye el contexto del asunto.
19. La información derivada no reemplaza la fuente.
20. Memory no decide qué es verdad ni inventa hechos.
21. Los recuerdos ambiguos no se fusionan automáticamente.
22. La IA sólo propone relaciones o ayudas derivadas.
23. Ninguna inferencia se vuelve permanente sin confirmación.
24. Memory nunca amplía permisos.
25. Sólo se recupera información autorizada.
26. El usuario puede corregir o eliminar cuando corresponda.
27. El contexto permite reconstruir un asunto importante.
28. Memory no se define como base vectorial, búsqueda semántica, embeddings, RAG, data lake, historial completo, respaldo, cronología infinita ni inteligencia autónoma.

## 28. Decisiones pendientes

1. Definir qué criterios concretos determinan que una información es relevante para Memory.
2. Definir cuándo una información relevante comienza a poder recuperarse.
3. Definir cuánto tiempo se conserva una referencia recordable.
4. Definir cuándo un recuerdo deja de ser relevante.
5. Definir reglas de retención, expiración y eliminación.
6. Definir qué ocurre con Memory cuando se elimina una conversación o mensaje de origen.
7. Definir qué ocurre cuando se elimina o corrige un compromiso.
8. Definir qué ocurre cuando se corrige o separa una identidad en People.
9. Definir qué información mínima constituye contexto suficiente.
10. Definir qué eventos del compromiso son relevantes para reconstruir su evolución.
11. Definir cómo se ordenan o priorizan resultados recuperados.
12. Definir cómo se comunica que falta contexto o que una fuente ya no está disponible.
13. Definir cómo se presentan contradicciones entre fuente e información derivada.
14. Definir cómo el usuario confirma o rechaza relaciones sugeridas entre recuerdos.
15. Definir si una relación confirmada entre recuerdos puede revertirse.
16. Definir el alcance inicial de las consultas por persona.
17. Definir el período temporal de las consultas por fecha.
18. Definir qué comportamiento cuenta como regreso del usuario a consultar su memoria.
19. Definir los efectos de corregir o eliminar información relacionada entre varios dominios.
20. Definir si los resúmenes de contexto estarán habilitados en la primera beta.

Hasta resolver estas decisiones, Memory debe favorecer procedencia, autorización, contexto y control del usuario sin asumir permanencia ni relaciones silenciosas.

## 29. Resumen del dominio

Memory es la capacidad de Ping para conservar y recuperar información relevante con contexto.

Su núcleo está formado principalmente por compromisos, eventos del compromiso, conversaciones y mensajes de origen, personas relacionadas, fechas, responsables, estados, seguimientos y resultados.

La regla de relevancia es:

> Recordar significa conservar lo necesario para comprender y avanzar, no almacenar todo.

La regla de procedencia es:

> Ningún recuerdo existe sin una fuente identificable.

La regla de recuperación es:

> Toda información recuperada debe mantener contexto y autorización suficientes.

La regla sobre IA es:

> Una ayuda derivada puede orientar; nunca reemplaza la fuente ni se convierte en hecho permanente sin confirmación.

Conversation conserva la conversación. Commitment conserva el compromiso y su ciclo de vida. People conserva identidad y relaciones. Memory conserva únicamente aquello que debe poder recordarse y recuperarse con contexto.

Memory no es una base vectorial, un buscador semántico, un sistema de embeddings, un sistema RAG, un data lake, un historial completo, un sistema de respaldo, una cronología infinita ni una inteligencia autónoma.

Su valor consiste en que un asunto importante pueda recuperarse después sin perder su origen, sus personas, su evolución, su resultado ni los límites que protegen esa información.
