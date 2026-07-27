# Ping — Modelo Conceptual de Eventos

Este documento define oficialmente el significado de los eventos de negocio de Ping para el MVP.

Un evento expresa un hecho significativo que ya ocurrió. No ordena, predice ni ejecuta algo.

## 1. Propósito

El propósito del modelo de eventos es permitir que Ping describa la evolución real de conversaciones, compromisos, personas, recuerdos y decisiones autorizadas sin perder:

- qué ocurrió;
- dónde ocurrió;
- cuándo ocurrió;
- quién estuvo relacionado;
- qué fuente lo sustenta;
- qué contexto permite comprenderlo;
- qué hechos ocurrieron antes o después;
- qué correcciones posteriores existieron.

Los eventos ayudan a reconstruir la historia relevante de un asunto. No reemplazan los conceptos ni las fuentes de los dominios.

## 2. Qué es un evento

Un evento es la expresión de un hecho significativo del negocio que ya ocurrió.

Ejemplos conceptuales:

- una captura fue registrada;
- un mensaje fue incorporado a una conversación;
- el usuario confirmó una propuesta;
- un compromiso fue creado;
- un responsable fue corregido;
- un seguimiento fue registrado;
- un avance fue registrado;
- un compromiso fue resuelto;
- un resultado fue conservado;
- una representación de persona fue corregida;
- una autorización fue revocada por decisión del usuario.

Un evento debe permitir formular una afirmación en pasado.

El evento no produce el hecho. Describe que el hecho ocurrió.

## 3. Qué no es un evento

No es un evento:

- una intención;
- una orden;
- una solicitud de acción pendiente;
- una acción todavía no realizada;
- una predicción;
- una posibilidad;
- una sugerencia;
- una propuesta de IA;
- una inferencia;
- una respuesta de IA;
- una regla;
- un permiso;
- una fuente original;
- un estado aislado sin cambio conocido;
- una descripción de lo que debería ocurrir.

La distinción conceptual es:

**Acción**

Algo que un actor intenta o realiza. Antes de completarse no demuestra que el resultado ocurrió.

**Intención**

Lo que una persona piensa, expresa o pretende hacer. Puede originar una propuesta, pero no afirma un hecho consumado.

**Propuesta**

Una posibilidad presentada para decisión. Continúa pendiente y no modifica un dominio.

**Decisión**

Elección explícita del usuario. Una vez tomada, la decisión es un hecho y puede expresarse como evento.

**Resultado**

Consecuencia comprensible de un proceso o compromiso. Es información del dominio; el evento expresa que el resultado fue registrado o que el asunto fue resuelto con ese resultado.

**Evento**

Descripción de que una acción, decisión, cambio o resultado significativo ya ocurrió.

## 4. Características de un evento

Todo evento debe:

- representar un hecho ocurrido;
- expresarse de forma comprensible;
- tener un origen identificable;
- tener un momento;
- conservar contexto;
- mantener procedencia;
- relacionarse con el recurso afectado;
- distinguirse de una intención o propuesta;
- respetar autorización;
- conservar su lugar dentro de la secuencia relevante;
- permanecer conceptualmente inmutable.

Un evento puede relacionarse, cuando corresponda, con:

- un usuario;
- una conversación;
- un mensaje;
- una captura;
- un compromiso;
- una persona;
- un recuerdo;
- una decisión explícita;
- un evento anterior;
- una corrección posterior.

Un evento no ejecuta acciones ni concede acceso por existir.

## 5. Origen de los eventos

El origen de un evento es el dominio, recurso y contexto donde ocurrió el hecho.

Los eventos pueden originarse en:

- Conversation, cuando cambia un hecho significativo de una conversación o mensaje;
- Commitment, cuando evoluciona el ciclo de vida de un compromiso;
- People, cuando se confirma o corrige identidad o relación;
- Memory, cuando ocurre una acción relevante sobre información recordada;
- una decisión explícita del usuario sobre una propuesta de IA;
- una decisión autorizada de compartir o revocar acceso.

El origen debe identificar:

- el recurso relacionado;
- la fuente que permite comprobar el contexto;
- el usuario o persona relacionada cuando corresponda;
- el momento del hecho;
- la autorización aplicable para conocerlo.

La IA no origina hechos de negocio por producir una salida.

Authorization determina quién puede conocer un evento, pero no constituye un dominio productor de eventos.

## 6. Tipos de eventos

Los eventos pueden clasificarse conceptualmente según el significado del hecho.

**Eventos de registro**

Expresan que una captura, mensaje, compromiso, seguimiento, avance o resultado fue registrado.

**Eventos de decisión**

Expresan que el usuario confirmó, corrigió, completó o rechazó una propuesta.

**Eventos de relación**

Expresan que una relación entre conversación, compromiso, persona o recuerdo fue confirmada.

**Eventos de cambio**

Expresan que una propiedad comprensible cambió, como responsable, fecha, estado o representación.

**Eventos de seguimiento**

Expresan que ocurrió una intervención relevante para avanzar un asunto.

**Eventos de resolución**

Expresan que un compromiso llegó a un cierre y que su resultado fue conservado.

**Eventos de corrección**

Expresan que información anterior fue corregida sin afirmar que el hecho anterior nunca ocurrió.

**Eventos de eliminación**

Expresan que el usuario realizó una eliminación autorizada cuando corresponde.

**Eventos de compartición o revocación**

Expresan una decisión autorizada del usuario sobre acceso a un recurso.

La clasificación no cambia la responsabilidad del dominio donde ocurrió el hecho.

## 7. Eventos de Conversation

Conversation genera eventos sobre hechos significativos de conversaciones, participantes y mensajes.

Eventos conceptuales del MVP:

**Self-chat disponible**

Ocurrió que la conversación personal quedó disponible para el usuario.

**Captura de texto registrada**

Ocurrió que el usuario registró contenido original dentro de una conversación autorizada.

**Captura de audio registrada**

Ocurrió que el usuario registró una captura de audio vinculada con su conversación de origen.

**Mensaje registrado**

Ocurrió que un mensaje pasó a formar parte de una conversación identificable.

**Participación autorizada confirmada**

Cuando la colaboración aprobada esté habilitada, ocurrió que una persona quedó autorizada como participante.

**Participación autorizada finalizada**

Cuando corresponda según decisiones futuras, ocurrió que una persona dejó de participar con acceso futuro.

**Archivo relacionado**

Cuando la capacidad opcional esté habilitada, ocurrió que un archivo quedó asociado con una conversación o mensaje.

**Mensaje corregido**

Sólo si la edición se aprueba, ocurrió una corrección posterior sin reescribir conceptualmente el registro original.

**Mensaje eliminado**

Sólo si la eliminación se aprueba, ocurrió una eliminación autorizada sin afirmar que el mensaje nunca existió.

No son eventos de Conversation:

- una posible interpretación del mensaje;
- una detección de IA;
- una sugerencia de compromiso;
- una predicción sobre la conversación.

## 8. Eventos de Commitment

Commitment genera eventos sobre el ciclo de vida de un compromiso confirmado.

Eventos conceptuales del MVP:

**Propuesta confirmada por el usuario**

Ocurrió que el usuario decidió aceptar una propuesta como compromiso.

**Propuesta corregida por el usuario**

Ocurrió que el usuario modificó información propuesta antes de confirmar.

**Propuesta completada por el usuario**

Ocurrió que el usuario añadió información necesaria antes de confirmar.

**Propuesta rechazada por el usuario**

Ocurrió que el usuario decidió no crear un compromiso desde la propuesta.

**Compromiso creado**

Ocurrió que nació un compromiso confirmado con propietario, responsable comprensible y procedencia.

**Responsable confirmado o corregido**

Ocurrió que el usuario estableció o cambió quién debía actuar.

**Fecha o plazo confirmado o corregido**

Ocurrió que el usuario estableció o cambió una referencia temporal del compromiso.

**Prioridad confirmada o corregida**

Cuando corresponda, ocurrió que el usuario estableció o cambió la prioridad.

**Estado cambiado**

Ocurrió que el compromiso pasó a una situación distinta y comprensible.

**Seguimiento registrado**

Ocurrió una intervención relevante para avanzar el asunto.

**Respuesta registrada**

Ocurrió que una respuesta relacionada con el compromiso fue conservada.

**Avance registrado**

Ocurrió un cambio o progreso que no implica automáticamente resolución.

**Nuevo mensaje relacionado**

Cuando la capacidad opcional esté habilitada, ocurrió que un mensaje autorizado se vinculó con el compromiso.

**Compromiso resuelto**

Ocurrió que el usuario confirmó un cierre comprensible.

**Resultado registrado**

Ocurrió que se conservó qué pasó finalmente.

**Información del compromiso corregida**

Ocurrió una corrección posterior que conserva la historia previa.

Los estados próximo y atrasado describen condiciones temporales. La decisión sobre si cada transición de condición constituye un evento independiente permanece pendiente.

## 9. Eventos de People

People genera eventos relacionados con decisiones confirmadas sobre identidad y relaciones.

Eventos conceptuales:

**Referencia de persona registrada**

Ocurrió que una fuente autorizada incorporó una referencia a una persona, aunque su identidad permanezca incompleta.

**Representación de persona confirmada**

Ocurrió que el usuario confirmó una forma comprensible de reconocer a la persona.

**Representación de persona corregida**

Ocurrió que el usuario corrigió la representación sin modificar las fuentes originales.

**Relación con una conversación confirmada**

Ocurrió que una persona quedó relacionada con una conversación autorizada dentro de su contexto.

**Relación con un compromiso confirmada**

Ocurrió que una persona quedó vinculada con un compromiso como propietario, responsable o persona relacionada.

**Responsabilidad relacionada con una persona corregida**

Ocurrió que se corrigió qué persona cumplía la función de responsable en un asunto.

**Posible coincidencia confirmada por el usuario**

Sólo si esa capacidad se aprueba, ocurrió que el usuario confirmó que referencias determinadas correspondían a una misma persona.

**Posible coincidencia rechazada por el usuario**

Ocurrió que el usuario decidió mantener separadas referencias que habían sido propuestas como coincidentes.

No son eventos de People:

- una coincidencia propuesta por IA;
- una similitud de nombres;
- una inferencia de identidad;
- un perfil deducido.

## 10. Eventos de Memory

Memory puede registrar hechos relevantes relacionados con la capacidad de recordar y recuperar información.

Eventos conceptuales:

**Información relevante incorporada a la memoria**

Ocurrió que información confirmada y con procedencia pasó a poder recuperarse como recuerdo.

**Recuerdo consultado**

Ocurrió que el usuario recuperó información autorizada para comprender un asunto.

**Fuente de un recuerdo consultada**

Ocurrió que el usuario volvió al origen autorizado de la información.

**Información recordada corregida**

Ocurrió que el usuario corrigió información recordada sin reescribir silenciosamente su fuente.

**Información recordada eliminada**

Ocurrió una eliminación autorizada cuando corresponde.

**Relación entre recuerdos confirmada por el usuario**

Sólo cuando el usuario toma una decisión explícita, ocurrió que una relación propuesta pasó a considerarse confirmada.

**Relación entre recuerdos rechazada por el usuario**

Ocurrió que el usuario rechazó una relación propuesta.

Memory no convierte automáticamente todo evento en recuerdo permanente.

Que un evento haya ocurrido no determina por sí solo:

- su relevancia futura;
- cuánto tiempo debe recuperarse;
- si forma parte de la memoria;
- quién puede conocerlo.

## 11. Eventos relacionados con IA

Una salida de IA no es un evento de negocio.

No son eventos:

- una interpretación generada;
- una detección de posible compromiso;
- una fecha extraída;
- un responsable propuesto;
- un resumen generado;
- una relación sugerida;
- una respuesta producida;
- una inferencia;
- una predicción.

La propuesta permanece fuera de la historia confirmada hasta que el usuario toma una decisión explícita.

Sí pueden ser eventos:

**Propuesta confirmada por el usuario**

Ocurrió una decisión explícita de aceptar la propuesta.

**Propuesta corregida por el usuario**

Ocurrió una decisión explícita que cambió la información propuesta.

**Propuesta completada por el usuario**

Ocurrió que el usuario añadió información antes de confirmar.

**Propuesta rechazada por el usuario**

Ocurrió una decisión explícita de no aceptar la propuesta.

**Relación sugerida confirmada por el usuario**

Ocurrió que el usuario confirmó una relación que antes era sólo derivada.

**Relación sugerida rechazada por el usuario**

Ocurrió que el usuario rechazó la relación derivada.

Estos eventos pertenecen al dominio afectado por la decisión. La IA no se convierte en dominio productor de eventos.

## 12. Eventos de autorización

Authorization controla quién puede conocer un evento, pero no crea eventos.

Las decisiones explícitas de un usuario sobre acceso pueden constituir hechos del negocio:

**Recurso compartido por decisión autorizada**

Ocurrió que el propietario concedió a otra persona un alcance determinado sobre un recurso, cuando la capacidad esté aprobada.

**Alcance de compartición corregido**

Ocurrió que el propietario cambió el alcance autorizado, cuando esa capacidad esté definida.

**Autorización revocada por el usuario**

Ocurrió que el propietario retiró un acceso previamente concedido.

Estos hechos se originan en la decisión del usuario y en el recurso protegido. Authorization:

- determina quién puede conocerlos;
- limita el contexto visible;
- impide accesos futuros después de una revocación;
- no concede permisos mediante el evento;
- no modifica la historia.

Un evento de compartición no comparte otros recursos.

Un evento de revocación no hace desaparecer los hechos anteriores, pero impide que la persona revocada los consulte en el futuro cuando ya no tiene autorización.

## 13. Relaciones entre eventos

Los eventos pueden relacionarse para explicar la evolución de un asunto.

Relaciones conceptuales:

**Evento de origen**

Hecho inicial que aporta contexto, como una captura registrada.

**Evento posterior**

Hecho que ocurrió después y puede ampliar o cambiar la comprensión del asunto.

**Evento derivado de una decisión**

Hecho que sólo pudo ocurrir después de una decisión explícita, como crear un compromiso tras confirmar una propuesta.

**Evento de seguimiento**

Hecho que mantiene relación con un compromiso abierto.

**Evento de corrección**

Hecho posterior que corrige información expresada en un evento anterior.

**Evento de resolución**

Hecho que cierra un compromiso y conserva un resultado.

Una relación entre eventos:

- debe tener contexto;
- debe conservar procedencia;
- no cambia el contenido del evento anterior;
- no fusiona asuntos ambiguos;
- no concede acceso;
- puede permanecer sin resolver si no existe certeza.

La IA puede sugerir una relación, pero esa sugerencia no es un evento ni una relación confirmada.

## 14. Secuencia de eventos

La secuencia expresa el orden en que ocurrieron los hechos relevantes.

Para el flujo principal puede comprenderse como:

1. una captura fue registrada;
2. el usuario revisó una propuesta;
3. el usuario confirmó, corrigió, completó o rechazó;
4. si confirmó, un compromiso fue creado;
5. el compromiso permaneció abierto;
6. se registraron seguimientos, respuestas o avances;
7. se realizaron cambios relevantes;
8. el compromiso fue resuelto;
9. se registró un resultado.

La secuencia debe:

- respetar el momento de cada hecho;
- conservar el origen;
- distinguir hechos simultáneos o cuyo orden sea incierto;
- no reordenarse para producir una narrativa más conveniente;
- incluir correcciones como hechos posteriores;
- permitir reconstruir la evolución relevante.

No toda secuencia comienza con una propuesta de IA. Un usuario puede realizar una creación explícitamente confirmada.

No todo mensaje inicia un compromiso.

No todo avance termina en resolución.

## 15. Procedencia

Todo evento posee procedencia.

La procedencia permite comprender:

- en qué dominio ocurrió;
- qué recurso fue afectado;
- qué fuente sustenta el hecho;
- quién tomó la decisión cuando corresponde;
- qué contexto estaba autorizado;
- qué evento anterior se relaciona;
- si existe una corrección posterior.

La fuente puede ser:

- una conversación;
- un mensaje;
- una captura;
- un compromiso;
- una persona o relación confirmada;
- un recuerdo;
- una decisión explícita del usuario.

El evento no reemplaza la fuente.

“Compromiso creado” no sustituye la conversación o captura de origen.

“Mensaje registrado” no sustituye el mensaje.

“Representación corregida” no sustituye las referencias originales.

“Resultado registrado” no sustituye el resultado conservado por Commitment.

## 16. Temporalidad

Todo evento posee un momento asociado con el hecho ocurrido.

El momento debe permitir:

- situar el hecho dentro de la evolución;
- distinguir qué ocurrió antes y después;
- relacionar origen, seguimiento y resolución;
- reconocer una corrección posterior;
- conservar una cronología comprensible.

El momento del evento no debe confundirse con:

- una fecha futura propuesta;
- un plazo del compromiso;
- una predicción;
- una fecha extraída pero no confirmada.

Una fecha o plazo puede formar parte del contenido de un compromiso. El evento expresa cuándo fue confirmado o corregido ese contenido.

Si el momento exacto no puede conocerse, la incertidumbre debe conservarse y no inventarse precisión.

Las reglas para hechos conocidos después de haber ocurrido y para eventos con igual momento permanecen pendientes.

## 17. Inmutabilidad conceptual

Los eventos son conceptualmente inmutables.

> Un hecho ocurrido no deja de haber ocurrido.

Un evento anterior no se modifica para presentar una historia diferente.

Si existe una corrección:

1. el evento original permanece como hecho histórico;
2. ocurre una decisión o acción correctiva;
3. se genera un nuevo evento de corrección;
4. la lectura actual considera la corrección;
5. la secuencia permite comprender ambos hechos.

Ejemplos:

- un responsable fue confirmado y después corregido;
- una fecha fue registrada y después modificada;
- una representación de persona fue corregida;
- un compromiso fue marcado de una forma y después cambió;
- una relación fue confirmada y posteriormente rectificada.

La inmutabilidad conceptual no significa conservación infinita, acceso permanente ni ausencia de eliminación. La retención, visibilidad y autorización son conceptos distintos.

Una eliminación autorizada se expresa como un hecho posterior. No obliga a mantener visible el contenido eliminado.

Una revocación impide accesos futuros, aunque no convierta los hechos autorizados anteriores en hechos que nunca ocurrieron.

## 18. Reglas e invariantes

1. Un evento representa un hecho que ocurrió.
2. Un evento se expresa en pasado.
3. Todo evento posee procedencia.
4. Todo evento posee un momento.
5. Todo evento posee contexto.
6. Todo evento se relaciona con un origen.
7. Un evento no expresa intención.
8. Un evento no expresa una orden.
9. Un evento no expresa lo que debería ocurrir.
10. Un evento no ejecuta acciones.
11. Un evento no concede permisos.
12. Un evento no reemplaza la fuente.
13. Un evento no toma decisiones.
14. Un evento no modifica por sí mismo otro dominio.
15. Un evento no representa una predicción.
16. Un evento no representa una sugerencia.
17. Un evento no representa una inferencia.
18. Un evento no representa una respuesta de IA.
19. Una propuesta de IA no es un evento.
20. Una decisión explícita del usuario ya tomada puede ser un evento.
21. Un resultado no es una orden; el evento expresa que fue registrado.
22. Conversation genera eventos sobre conversaciones y mensajes.
23. Commitment genera eventos sobre su ciclo de vida.
24. People genera eventos sobre identidad y relaciones confirmadas.
25. Memory puede registrar hechos relevantes.
26. Memory no convierte todo evento en recuerdo permanente.
27. Authorization controla quién puede conocer un evento.
28. Authorization no crea eventos.
29. Conocer un evento requiere autorización.
30. Un evento conserva los límites de sus fuentes.
31. La IA no es un dominio productor de eventos.
32. Los eventos respetan la cronología.
33. La historia no se reescribe conceptualmente.
34. Un evento ocurrido permanece conceptualmente inmutable.
35. Toda corrección genera un nuevo evento.
36. El nuevo evento no modifica el evento anterior.
37. La eliminación es un hecho posterior, no una reescritura.
38. La revocación impide acceso futuro sin negar hechos anteriores.
39. Una relación ambigua entre eventos no se confirma automáticamente.

## 19. Casos de uso del MVP

**Registrar una captura**

El hecho expresa que texto o audio fue incorporado a una conversación autorizada.

**Registrar un mensaje**

El hecho conserva conversación, momento y procedencia.

**Registrar la decisión sobre una propuesta**

El usuario confirma, corrige, completa o rechaza, y la decisión ocurrida puede reconstruirse.

**Crear un compromiso confirmado**

El evento expresa que el compromiso nació después de una decisión válida.

**Corregir responsable, fecha o descripción**

La corrección genera un nuevo evento sin reescribir la historia anterior.

**Registrar seguimiento**

El evento expresa qué intervención ocurrió y a qué compromiso se relaciona.

**Registrar avance**

El evento expresa progreso sin convertirlo automáticamente en resolución.

**Cambiar estado**

El evento expresa qué cambio ocurrió dentro del ciclo del compromiso.

**Resolver un compromiso**

El evento expresa que ocurrió un cierre comprensible.

**Registrar un resultado**

El evento expresa que se conservó qué ocurrió finalmente.

**Corregir una representación de persona**

El evento expresa la decisión posterior sin cambiar las fuentes originales.

**Corregir o eliminar información recordada**

El evento expresa la acción autorizada sin afirmar que la historia anterior nunca existió.

**Compartir o revocar un recurso**

Cuando la capacidad esté aprobada, el evento expresa la decisión autorizada sin conceder acceso por sí mismo.

**Reconstruir la evolución**

El usuario autorizado puede comprender origen, decisiones, cambios, seguimiento y resultado.

## 20. API conceptual del dominio

La API conceptual describe capacidades de negocio y resultados esperados. No define mecanismos técnicos.

**Reconocer un hecho ocurrido**

Resultado esperado: se identifica un hecho significativo expresable en pasado.

**Registrar conceptualmente un evento**

Resultado esperado: el hecho conserva origen, momento, contexto, procedencia y recurso relacionado.

**Consultar un evento autorizado**

Resultado esperado: el actor autorizado comprende el hecho y puede alcanzar su contexto permitido.

**Consultar eventos de un recurso**

Resultado esperado: se obtiene la evolución relevante de una conversación, compromiso, persona o recuerdo autorizado.

**Relacionar eventos**

Resultado esperado: se expresa una relación confirmada sin modificar los hechos relacionados.

**Obtener la secuencia relevante**

Resultado esperado: los hechos aparecen en orden comprensible y respetan su temporalidad.

**Registrar una decisión del usuario**

Resultado esperado: la decisión ya tomada se expresa como hecho del dominio afectado.

**Registrar una corrección**

Resultado esperado: se añade un nuevo evento relacionado con el anterior sin reescribirlo.

**Registrar una resolución**

Resultado esperado: se expresa el cierre y se conserva referencia al resultado.

**Registrar una eliminación**

Resultado esperado: se expresa el hecho posterior dentro de la autorización aplicable.

**Aplicar autorización a la consulta**

Resultado esperado: sólo conoce el evento quien puede consultar el recurso y contexto correspondientes.

**Distinguir una propuesta**

Resultado esperado: una sugerencia o inferencia permanece fuera de la historia confirmada hasta la decisión explícita.

## 21. Criterios de aceptación

El modelo se considera definido correctamente para el MVP cuando:

1. Todo evento representa un hecho ocurrido.
2. Los eventos se expresan en pasado.
3. Evento, acción, intención, propuesta, decisión y resultado se distinguen.
4. Todo evento conserva procedencia.
5. Todo evento conserva momento.
6. Todo evento conserva contexto.
7. Ningún evento ejecuta acciones.
8. Ningún evento concede permisos.
9. Ningún evento sustituye su fuente.
10. Las propuestas de IA no se tratan como eventos.
11. Las respuestas de IA no se tratan como eventos.
12. La decisión explícita del usuario sí puede expresarse como evento.
13. Conversation aporta hechos sobre conversaciones y mensajes.
14. Commitment aporta hechos sobre su ciclo de vida.
15. People aporta hechos sobre identidad y relaciones confirmadas.
16. Memory registra sólo hechos relevantes y no todos los eventos.
17. Authorization controla quién puede conocer un evento sin producirlo.
18. La secuencia respeta la cronología.
19. Una corrección produce un evento posterior.
20. La historia anterior no se reescribe.
21. La inmutabilidad conceptual no obliga a acceso ni conservación infinitos.
22. El modelo permanece dentro del significado del negocio.

## 22. Decisiones pendientes

1. Definir qué hechos de Conversation son suficientemente significativos para tratarse como eventos del MVP.
2. Definir si la disponibilidad inicial del self-chat debe formar parte de la historia relevante.
3. Definir si cada condición temporal próximo o atrasado genera un evento.
4. Definir qué cambios de Commitment deben conservarse en su historial relevante.
5. Definir si una consulta de Memory es un evento relevante y durante cuánto tiempo.
6. Definir cuándo información relevante pasa a formar parte de Memory.
7. Definir qué eventos de People se conservan cuando una identidad permanece incompleta.
8. Definir el tratamiento de una posible coincidencia de personas después de confirmarse o rechazarse.
9. Definir si los eventos de compartición estarán habilitados en la primera beta.
10. Definir qué hechos deben conservarse cuando se revoca una autorización.
11. Definir qué contexto puede conocer una persona después de una revocación.
12. Definir cómo se representa un momento impreciso sin inventar precisión.
13. Definir el orden conceptual de hechos que ocurrieron en el mismo momento.
14. Definir cómo se representa un hecho conocido después del momento en que ocurrió.
15. Definir cómo se relacionan eventos cuando varias conversaciones participan en un mismo asunto.
16. Definir cómo se corrige una relación incorrecta entre eventos.
17. Definir qué información de un evento permanece visible después de eliminar su fuente.
18. Definir cómo se concilian corrección, eliminación, privacidad e historia conceptual.
19. Definir cuáles eventos son necesarios para reconstruir un resultado comprensible.

Hasta resolver estas decisiones, no deben inventarse hechos, secuencias, relaciones, momentos ni permanencia.

## 23. Resumen

Un evento en Ping es un hecho significativo que ya ocurrió.

La regla de significado es:

> Un evento describe lo que ocurrió, nunca lo que debería ocurrir.

La regla de procedencia es:

> Todo evento conserva origen, momento, contexto y fuente.

La regla sobre IA es:

> Una propuesta, inferencia o respuesta de IA no es un evento; la decisión explícita posterior del usuario sí puede serlo.

La regla de historia es:

> Un hecho ocurrido no deja de haber ocurrido; una corrección genera un nuevo evento.

Conversation aporta eventos sobre conversaciones y mensajes. Commitment aporta eventos sobre el ciclo de vida del compromiso. People aporta eventos sobre identidad y relaciones confirmadas. Memory puede conservar hechos relevantes sin convertir toda la historia en memoria permanente. Authorization controla quién puede conocerlos sin producirlos.

Los eventos no ejecutan acciones, no conceden permisos, no modifican otros dominios y no reemplazan fuentes.

Su valor consiste en permitir que el usuario reconstruya qué ocurrió realmente desde la captura hasta la resolución sin perder procedencia, temporalidad, correcciones ni contexto.
