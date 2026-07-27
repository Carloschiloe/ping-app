# Ping — Conversation Domain

Este documento define el dominio conceptual y funcional de Conversation en Ping. Deriva de la visión, el alcance del MVP, los principios de diseño y el modelo mental aprobados.

## 1. Propósito del dominio

Conversation existe para que una persona pueda registrar algo de manera natural y conservar el intercambio que le da sentido.

Su propósito es:

- ofrecer un lugar de captura personal mediante self-chat;
- representar conversaciones disponibles cuando participan otras personas;
- conservar mensajes y capturas;
- mantener participantes y límites de acceso;
- preservar contexto conversacional;
- mantener la procedencia necesaria para comprender compromisos y recuerdos;
- entregar información autorizada a Commitment, People y Memory.

Conversation no busca aumentar la cantidad de mensajes enviados. Su valor está en impedir que los asuntos importantes pierdan su origen y contexto.

## 2. Responsabilidades del dominio

Conversation es responsable de:

- representar una conversación personal o compartida;
- reconocer self-chat como caso principal;
- permitir registrar capturas naturales mediante texto o audio;
- conservar mensajes en un orden comprensible;
- identificar quién originó una captura cuando corresponda;
- representar participantes autorizados;
- conservar la relación entre una captura y su conversación;
- ofrecer contexto conversacional autorizado;
- conservar referencias a archivos asociados cuando la capacidad esté habilitada;
- representar reacciones cuando la capacidad esté habilitada;
- permitir grupos básicos cuando formen parte de la validación aprobada;
- suministrar la fuente de una sugerencia de compromiso;
- conservar la procedencia cuando una sugerencia llega a convertirse en compromiso;
- respetar corrección, eliminación, autorización y privacidad.

## 3. Límites del dominio

Conversation no es responsable de:

- decidir si una sugerencia se convierte en compromiso;
- crear compromisos automáticamente;
- administrar el ciclo de vida de un compromiso confirmado;
- decidir estados, prioridades, seguimiento o resolución de compromisos;
- definir la identidad completa o el historial contextual de una persona;
- decidir qué información constituye memoria relevante;
- tratar resúmenes como verdad primaria;
- ejecutar acciones importantes sugeridas por IA;
- enviar recordatorios;
- gestionar calendarios;
- administrar llamadas o grabaciones;
- gestionar modo Operación, checklists o reportes de turno;
- convertirse en una experiencia de mensajería general;
- exigir colaboración para entregar valor personal.

La conversación conserva la fuente. Commitment gestiona el compromiso. People aporta la comprensión de las personas. Memory permite recuperar información relevante con autorización y trazabilidad.

## 4. Conceptos principales

**Conversación**

Contexto continuo dentro del cual una persona registra o intercambia capturas y mensajes.

**Self-chat**

Conversación personal del usuario consigo mismo. Es un caso principal del MVP y debe ser útil sin otros participantes.

**Conversación compartida**

Conversación en la que puede participar más de una persona autorizada. La colaboración básica es opcional para la primera validación.

**Participante**

Persona autorizada para formar parte de una conversación. Una conversación no presupone varios participantes.

**Captura**

Información registrada naturalmente por el usuario antes de que se pierda. Puede expresarse mediante texto o audio.

**Mensaje**

Registro conversacional que conserva contenido, origen y posición comprensible dentro de una conversación.

**Contexto conversacional**

Información necesaria para comprender qué se dijo, quién estuvo relacionado, cuándo ocurrió y qué intercambios cercanos dan sentido al asunto.

**Procedencia**

Relación verificable entre una información derivada y la conversación o mensaje que la originó.

**Sugerencia de compromiso**

Interpretación derivada de una captura que podría representar un compromiso. Continúa siendo una propuesta hasta que el usuario la confirme.

**Archivo asociado**

Referencia opcional a un archivo vinculado con la conversación o con una captura, sujeta a la misma autorización y privacidad.

**Reacción**

Expresión opcional asociada a un mensaje. No forma parte de los casos obligatorios para terminar el MVP.

## 5. Entidades y objetos conceptuales

**Conversation**

Entidad que mantiene identidad conceptual, tipo personal o compartido, participantes, mensajes y contexto.

**Self Conversation**

Forma de Conversation destinada a la captura personal. Tiene al usuario como participante necesario y no depende de agregar otras personas.

**Participant Relationship**

Relación que expresa que una persona está autorizada para participar en una conversación. No convierte la información de esa persona ni de la conversación en pública.

**Message**

Entidad que representa una captura o intervención registrada dentro de una conversación y que puede actuar como fuente.

**Message Content**

Contenido expresado por el usuario, incluyendo texto o una captura de audio, sin asumir que toda interpretación derivada es parte del contenido original.

**Source Reference**

Objeto conceptual que permite volver desde un compromiso, recuerdo o resumen hacia la conversación y el mensaje de origen.

**Conversational Context**

Objeto conceptual compuesto por la información autorizada necesaria para comprender un mensaje o asunto dentro de su conversación.

**Commitment Suggestion**

Objeto derivado que expresa una posible interpretación. Puede contener información propuesta, pero no representa un compromiso confirmado.

**Associated File Reference**

Objeto opcional que conserva la relación con un archivo sin cambiar sus límites de acceso.

**Reaction**

Objeto opcional relacionado con un mensaje y con la persona que reaccionó.

## 6. Relaciones entre conceptos

- una Conversation tiene uno o más participantes autorizados;
- un self-chat puede tener un único participante;
- una conversación compartida puede tener varios participantes;
- un participante representa una relación autorizada con una conversación;
- una Conversation contiene mensajes y capturas;
- cada Message pertenece a una Conversation;
- un Message puede identificar a la persona que lo originó;
- un Message puede actuar como fuente de una sugerencia de compromiso;
- una Commitment Suggestion debe conservar su Source Reference;
- un compromiso confirmado puede mantener una relación con la Conversation y el Message de origen;
- el Conversational Context se obtiene desde mensajes y relaciones autorizadas;
- una persona puede relacionarse con varias conversaciones;
- Memory puede recuperar Conversation, Message y Source Reference cuando existe autorización;
- un archivo asociado mantiene relación con una conversación o mensaje;
- una reacción mantiene relación con un mensaje y una persona.

Estas relaciones deben permitir comprender el origen sin convertir Conversation en propietario de todos los conceptos relacionados.

## 7. Estados y ciclo de vida

Los documentos base no definen estados formales de almacenamiento para una conversación. El ciclo conceptual mínimo es:

1. **Disponibilidad:** el usuario puede abrir su self-chat o una conversación para la cual está autorizado.
2. **Captura:** se registra texto o audio dentro de la conversación.
3. **Continuidad:** nuevos mensajes pueden aportar contexto al intercambio.
4. **Interpretación:** Ping puede identificar una posible sugerencia de compromiso.
5. **Decisión del usuario:** la sugerencia puede confirmarse, corregirse, completarse o rechazarse.
6. **Procedencia activa:** si se confirma un compromiso, la conversación y el mensaje permanecen como fuente.
7. **Consulta posterior:** el contexto puede recuperarse para comprender el compromiso, la persona o el recuerdo.

Una conversación no se considera resuelta porque un compromiso asociado se resuelva. Tampoco todo mensaje inicia un compromiso.

No se define todavía un estado oficial de cierre, archivo o eliminación de conversaciones.

La sugerencia de compromiso tiene como estados conceptuales:

- propuesta;
- corregida o completada por el usuario;
- confirmada;
- rechazada.

Sólo después de la confirmación comienza el ciclo de vida gestionado por Commitment.

## 8. Eventos relevantes del dominio

Los siguientes hechos son relevantes conceptualmente para Conversation:

- un self-chat queda disponible para el usuario;
- una conversación autorizada queda disponible;
- se registra una captura;
- se registra un mensaje;
- se relaciona una captura de audio con su origen;
- una persona participa en una conversación;
- se conserva un archivo asociado, cuando la capacidad está habilitada;
- se registra una reacción, cuando la capacidad está habilitada;
- se identifica una posible sugerencia de compromiso;
- el usuario corrige o completa la sugerencia;
- el usuario rechaza la sugerencia;
- el usuario confirma la sugerencia;
- una conversación o mensaje queda vinculado como fuente de un compromiso;
- otro dominio solicita contexto autorizado;
- se corrige o elimina información cuando corresponde.

Estos eventos describen hechos del dominio. No prescriben mecanismos técnicos ni implican que todos deban almacenarse de la misma forma.

## 9. Reglas e invariantes

1. Self-chat es una conversación válida y principal.
2. Una conversación no requiere varios participantes.
3. Una conversación compartida sólo puede ser consultada por personas autorizadas.
4. La colaboración no convierte la conversación en pública.
5. Todo mensaje pertenece a una conversación identificable.
6. El origen de un mensaje debe poder distinguirse cuando corresponda.
7. La secuencia del intercambio debe conservarse de forma comprensible.
8. Una captura no se convierte automáticamente en compromiso.
9. Una sugerencia de IA sigue siendo una propuesta hasta la confirmación del usuario.
10. Rechazar una sugerencia no debe crear un compromiso.
11. Corregir una sugerencia no altera silenciosamente la fuente original.
12. Un compromiso confirmado debe poder conservar una referencia a su conversación y mensaje de origen.
13. Un resumen no sustituye mensajes ni conversación como fuente primaria.
14. El contexto sólo puede obtenerse dentro de la autorización del usuario.
15. La IA no recibe acceso adicional por participar en la interpretación.
16. Archivos y audios conservan límites de acceso coherentes con su origen.
17. Conversation no decide estados, seguimiento ni resolución de compromisos.
18. Las capacidades opcionales no pueden bloquear self-chat y captura rápida.
19. Grupos avanzados, presencia avanzada, llamadas y reportes quedan fuera del MVP.
20. La corrección o eliminación debe respetar propiedad, procedencia y contexto.

## 10. Casos de uso obligatorios del MVP

**Abrir el self-chat**

El usuario puede acceder a una conversación personal sin depender de otros participantes.

**Abrir una conversación disponible**

Cuando exista colaboración aprobada, el usuario puede acceder sólo a conversaciones para las cuales está autorizado.

**Registrar una captura de texto**

El usuario registra información natural dentro de una conversación.

**Registrar una captura de audio**

El usuario graba una captura que conserva relación con su origen conversacional.

**Conservar el mensaje de origen**

La captura registrada puede actuar como fuente identificable.

**Solicitar interpretación**

La información autorizada puede utilizarse para detectar un posible compromiso.

**Presentar una sugerencia**

La detección se conserva como propuesta y permite confirmar, corregir, completar o rechazar.

**Vincular una fuente confirmada**

Cuando el usuario confirma, Commitment puede conservar la referencia a Conversation y Message.

**Recuperar contexto**

El usuario puede volver al origen para comprender por qué existe un compromiso.

**Consultar por conversación**

Los compromisos relacionados pueden consultarse desde la relación autorizada con la conversación, sin trasladar su ciclo de vida a Conversation.

## 11. Interacción con Commitment

Conversation entrega a Commitment:

- la captura o mensaje autorizado;
- la conversación de origen;
- la referencia de procedencia;
- el contexto necesario y autorizado;
- las personas identificables dentro del intercambio cuando corresponda;
- una sugerencia derivada pendiente de decisión.

Commitment es responsable de:

- crear el compromiso sólo después de confirmación;
- conservar propietario y responsable;
- administrar estados;
- administrar prioridad;
- registrar eventos;
- realizar seguimiento;
- registrar resolución y resultado.

Conversation no debe:

- crear un compromiso al registrar un mensaje;
- tratar una fecha detectada como confirmación;
- asumir que todo mensaje es accionable;
- cambiar el estado de un compromiso;
- marcar un asunto como resuelto.

Cuando Commitment confirma una creación, debe conservar una referencia comprensible a la fuente conversacional.

## 12. Interacción con People

Conversation entrega a People relaciones contextuales autorizadas:

- quién participa en una conversación;
- quién originó un mensaje cuando corresponda;
- qué conversación relaciona a una persona con un asunto;
- qué fuente ayuda a comprender una solicitud o promesa.

People aporta a Conversation una representación comprensible de las personas relacionadas.

Conversation no define:

- la identidad completa de una persona;
- todas sus relaciones;
- sus organizaciones;
- el conjunto total de compromisos asociados;
- las respuestas agregadas a preguntas como “¿Qué tengo pendiente con esta persona?”.

Una persona puede aparecer en varias conversaciones, pero no debe confundirse con una conversación ni reducirse a un identificador.

## 13. Interacción con Memory

Conversation aporta a Memory:

- conversaciones de origen;
- mensajes de origen;
- contexto conversacional;
- referencias de procedencia;
- relaciones autorizadas con personas;
- archivos o audios asociados cuando corresponda.

Memory decide qué información relevante puede recuperarse junto con Commitment y People, siempre dentro de la autorización aplicable.

Conversation no convierte todo el historial en memoria permanente.

Memory no debe:

- perder la fuente conversacional;
- presentar información derivada como fuente original;
- ampliar el acceso del usuario;
- conservar hechos permanentes sin procedencia;
- sustituir mensajes originales por resúmenes.

Cuando Memory recupera un asunto, el usuario debe poder comprender o alcanzar su contexto de origen.

## 14. Información que debe conservarse

Conversation debe conservar conceptualmente:

- identidad de la conversación;
- carácter personal o compartido;
- participantes autorizados;
- relación de cada mensaje con su conversación;
- autor u origen del mensaje cuando corresponda;
- contenido original de la captura;
- forma de captura relevante, como texto o audio;
- secuencia comprensible de mensajes;
- momento de origen necesario para el contexto;
- referencia al mensaje original;
- relación con archivos o audios asociados;
- contexto suficiente para comprender el intercambio;
- procedencia de sugerencias y compromisos derivados;
- decisiones del usuario sobre una sugerencia cuando sean necesarias para distinguir propuesta y confirmación;
- límites de autorización;
- correcciones o eliminaciones aplicables sin falsificar la fuente.

La información derivada debe poder distinguirse del contenido original.

## 15. Información que no pertenece al dominio

No pertenece a Conversation:

- el estado operativo de un compromiso;
- la prioridad final de un compromiso;
- el seguimiento del compromiso;
- la resolución y resultado del compromiso;
- el historial completo de eventos del compromiso;
- la identidad contextual completa de una persona;
- las relaciones agregadas del People Domain;
- la selección de qué constituye memoria relevante;
- la verdad permanente derivada de resúmenes;
- decisiones autónomas de IA;
- recordatorios y programación;
- calendarios;
- llamadas y grabaciones;
- modo Operación;
- checklists;
- reportes de turno;
- insights avanzados;
- reglas financieras, legales o personales;
- interfaces futuras fuera del producto móvil validado.

Conversation puede aportar contexto a otros dominios sin asumir sus responsabilidades.

## 16. Errores y situaciones ambiguas

**No se puede determinar si existe un compromiso**

Debe mantenerse como incertidumbre o ausencia de sugerencia. No se crea un compromiso.

**La fecha o el responsable son ambiguos**

La sugerencia debe expresar la información incompleta para que el usuario la corrija o complete.

**El usuario rechaza la sugerencia**

La captura permanece como fuente conversacional cuando corresponda, pero no nace un compromiso.

**La captura no contiene un compromiso**

Puede permanecer como mensaje o captura sin forzar una acción.

**La fuente no está autorizada**

No se entrega contenido ni contexto a otros dominios o a la IA.

**La persona mencionada no puede identificarse con certeza**

No se debe asignar silenciosamente una identidad.

**La captura de audio no puede interpretarse**

Debe conservarse la diferencia entre el audio de origen y cualquier interpretación incompleta. No se inventa contenido.

**El contexto disponible es insuficiente**

Debe reconocerse la falta de contexto en vez de fabricar una explicación.

**Un resumen contradice la fuente**

La fuente original prevalece y el resumen sigue siendo información derivada.

**Una conversación contiene varios asuntos**

No se asume que toda la conversación corresponde a un único compromiso.

Las políticas definitivas de edición de mensajes, eliminación de conversaciones, archivo y retención no están resueltas por los documentos base.

## 17. API conceptual del dominio

La API conceptual expresa capacidades del dominio, no endpoints ni decisiones técnicas.

**Hacer disponible la conversación personal**

Resultado esperado: el usuario puede utilizar un self-chat autorizado para capturar información.

**Obtener una conversación autorizada**

Resultado esperado: se entrega la conversación y el contexto permitido, o se rechaza el acceso.

**Registrar una captura**

Entrada conceptual: conversación autorizada, usuario, contenido natural y forma de captura.

Resultado esperado: mensaje con origen y procedencia dentro de la conversación.

**Recuperar mensajes autorizados**

Resultado esperado: secuencia comprensible de mensajes que el usuario puede consultar.

**Obtener contexto para una fuente**

Resultado esperado: contexto suficiente y autorizado para comprender un mensaje o asunto.

**Proponer una interpretación de compromiso**

Resultado esperado: sugerencia identificada como propuesta, vinculada a su fuente y pendiente de confirmación.

**Registrar la decisión sobre una sugerencia**

Resultado esperado: distinción clara entre confirmación, corrección, complemento o rechazo, sin creación automática.

**Entregar procedencia a Commitment**

Resultado esperado: referencia comprensible a conversación y mensaje de origen después de la confirmación.

**Entregar contexto autorizado a People o Memory**

Resultado esperado: información limitada al propósito y a los permisos del usuario.

**Relacionar un archivo o reacción opcional**

Resultado esperado: asociación con la conversación o mensaje sin alterar privacidad ni bloquear el flujo principal.

## 18. Criterios de aceptación

Conversation se considera definido correctamente para el MVP cuando:

1. Self-chat funciona conceptualmente como caso principal y no como excepción.
2. Una conversación puede tener uno o varios participantes sin asumir colaboración obligatoria.
3. El usuario puede registrar capturas de texto y audio.
4. Cada mensaje conserva una conversación de origen.
5. El contexto y la procedencia pueden recuperarse con autorización.
6. Una captura puede existir sin producir un compromiso.
7. Una detección se presenta como sugerencia.
8. La sugerencia puede confirmarse, corregirse, completarse o rechazarse.
9. No se crea un compromiso sin confirmación.
10. Un compromiso confirmado puede conservar conversación y mensaje de origen.
11. Conversation no administra seguimiento ni resolución de compromisos.
12. People puede comprender relaciones contextuales sin que Conversation asuma la identidad completa.
13. Memory puede recuperar la fuente sin tratar todo el historial como memoria permanente.
14. La información derivada se distingue de la fuente original.
15. Los límites de acceso se mantienen en mensajes, archivos, audios y contexto.
16. Las capacidades opcionales no son necesarias para completar la captura personal.
17. El dominio no se convierte en mensajería general ni mide valor por volumen de mensajes.

## 19. Decisiones pendientes

1. Definir si la primera validación será exclusivamente personal o incluirá colaboración básica.
2. Determinar si grupos básicos estarán visibles en la primera beta.
3. Determinar si reacciones estarán visibles en la primera beta.
4. Determinar si archivos asociados estarán habilitados en la primera beta.
5. Definir el comportamiento conceptual de edición de mensajes originales.
6. Definir el comportamiento conceptual de eliminación de mensajes.
7. Definir si una conversación puede cerrarse o archivarse y qué significa cada acción.
8. Definir las reglas de retención y eliminación de conversaciones y capturas.
9. Definir cuánto contexto conversacional es suficiente para interpretar una captura.
10. Definir cómo se distingue para el usuario el audio original de su interpretación.
11. Definir el alcance inicial de las consultas por persona cuando existan contactos y usuarios registrados.
12. Definir qué ocurre con referencias de procedencia cuando el usuario elimina la fuente.

Hasta resolverlas, ninguna de estas decisiones debe asumirse silenciosamente.

## 20. Resumen del dominio

Conversation es el dominio que permite capturar y conservar intercambios con contexto.

Su caso principal es el self-chat: una persona registra algo importante de manera natural sin depender de colaboración.

Una conversación puede ser personal o compartida. Conserva participantes autorizados, mensajes, capturas, contexto y procedencia.

Conversation permite que Ping interprete una captura, pero no confirma ni crea compromisos por sí sola.

La regla central es:

> Una captura puede originar una sugerencia. Sólo la confirmación del usuario puede originar un compromiso.

Conversation entrega la fuente a Commitment, relaciones contextuales a People e información autorizada a Memory.

No administra el ciclo de vida del compromiso, no convierte todo el historial en memoria y no busca ser una copia de WhatsApp.

Su valor consiste en que un asunto importante nunca pierda la conversación, el mensaje, la persona y el contexto que permiten comprenderlo.
