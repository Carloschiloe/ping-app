# Ping — Dominio People

Este documento define oficialmente el dominio conceptual y funcional People de Ping para el MVP.

## 1. Propósito del dominio

People permite que Ping represente quién es una persona para el usuario y cómo se relaciona con sus conversaciones, compromisos y asuntos importantes.

Su propósito es conservar una comprensión contextual que permita responder, dentro de la autorización aplicable:

- qué tiene pendiente el usuario con una persona;
- qué prometió el usuario;
- qué espera recibir de otra persona;
- quién quedó responsable;
- cuándo hablaron de un asunto;
- qué compromisos siguen abiertos;
- qué ocurrió finalmente.

People conecta identidad y relaciones sin reducir a una persona a un identificador técnico, una ficha de contacto o un perfil inferido.

## 2. Responsabilidades del dominio

People es responsable de:

- representar al propio usuario como persona;
- representar personas conocidas por el usuario;
- representar participantes autorizados;
- representar responsables y personas relacionadas con compromisos;
- representar referencias incompletas que todavía no pueden resolverse;
- mantener una identidad conceptual distinguible;
- conservar referencias comprensibles y corregibles;
- expresar la relación de cada persona desde la perspectiva del usuario;
- relacionar personas con conversaciones autorizadas;
- relacionar personas con compromisos autorizados;
- aportar identidad y relaciones comprensibles a Conversation y Commitment;
- permitir consultas contextuales por persona;
- reconocer y conservar ambigüedad;
- permitir corrección de representaciones y relaciones;
- evitar fusiones automáticas;
- respetar propiedad, autorización y privacidad;
- aportar a Memory contexto autorizado por persona.

People no busca completar perfiles. Busca impedir que el usuario pierda con quién se relaciona cada asunto y qué significa esa relación.

## 3. Límites del dominio

People no es responsable de:

- conservar el contenido completo de conversaciones;
- administrar mensajes o capturas;
- administrar participantes como permisos de conversación;
- crear o confirmar compromisos;
- administrar estados, seguimiento o resolución de compromisos;
- decidir qué información constituye memoria permanente;
- ampliar permisos mediante una relación;
- descubrir personas en un directorio global;
- construir una red social;
- gestionar relaciones comerciales como un CRM;
- mantener una libreta de direcciones genérica;
- crear perfiles enriquecidos mediante inferencias;
- asignar reputación, influencia o valor a una persona;
- vigilar actividad o comportamiento;
- exigir email, teléfono u otro identificador completo;
- exigir que cada persona sea usuaria registrada de Ping;
- fusionar identidades por similitud;
- utilizar información para fines distintos de recordar, seguir y resolver asuntos.

People administra identidad contextual y relaciones. No duplica Conversation, Commitment ni Memory.

## 4. Qué significa una persona en Ping

Una persona en Ping es alguien que el usuario puede reconocer dentro del contexto de sus asuntos.

Puede ser:

- el propio usuario;
- un contacto conocido;
- un participante autorizado de una conversación;
- el responsable de un compromiso;
- una persona relacionada con una promesa, solicitud o resultado;
- una referencia mencionada en una captura;
- una referencia incompleta cuya identidad todavía no está resuelta;
- una persona que usa Ping;
- una persona que no usa Ping.

Para el usuario, la persona adquiere significado por relaciones comprensibles:

- conversaciones compartidas;
- compromisos;
- solicitudes;
- promesas;
- asuntos abiertos;
- resultados;
- roles cuando corresponda.

Una persona puede existir conceptualmente aunque sólo se conozca un nombre parcial, una referencia contextual o la función que cumple en un asunto.

## 5. Qué no significa una persona

Una persona no significa:

- un registro técnico;
- un número de teléfono;
- una dirección de email;
- una cuenta obligatoria de Ping;
- una entrada importada de una agenda;
- un perfil público;
- una colección exhaustiva de datos personales;
- una posición dentro de una red social;
- un cliente o prospecto de CRM;
- una puntuación o reputación;
- una identidad confirmada sólo por similitud;
- todas las menciones que tengan el mismo nombre;
- un resumen automático de comportamiento;
- una autorización para consultar toda la información relacionada;
- un sustituto de la conversación o del compromiso.

People representa sólo lo necesario y autorizado para comprender la relación del usuario con sus asuntos importantes.

## 6. Entidades y objetos conceptuales

**Person**

Entidad conceptual que mantiene una identidad distinguible para el usuario, incluso cuando su información es incompleta.

**Self Person**

Representación del propio usuario como persona dentro de conversaciones, compromisos y relaciones.

**Registered Person**

Persona que puede relacionarse con una identidad registrada de Ping, sin que ese registro defina por sí solo todo lo que el usuario sabe de ella.

**Unregistered Person**

Persona que no usa Ping o cuya relación con una identidad registrada no se conoce. Puede participar conceptualmente en asuntos y compromisos.

**Unresolved Person Reference**

Referencia incompleta o ambigua que señala a alguien sin afirmar todavía una identidad determinada.

**Person Reference**

Forma en que Conversation, Commitment o Memory señalan a una Person o a una referencia todavía no resuelta.

**Person Representation**

Expresión comprensible y corregible con la que el usuario reconoce a una persona dentro de un contexto autorizado.

**User-Person Relationship**

Relación contextual que expresa qué significa una persona para el usuario.

**Conversation Participation Reference**

Relación con una conversación en la que la persona aparece como participante autorizado o como origen identificable de un mensaje.

**Commitment Role**

Función confirmada de una persona dentro de un compromiso, como propietario, responsable o persona relacionada.

**Relationship Context**

Información autorizada que permite comprender por qué una persona está asociada con una conversación, compromiso o asunto.

**Possible Identity Match**

Sugerencia de que dos referencias podrían representar a la misma persona. Continúa siendo una propuesta hasta la decisión del usuario.

## 7. Identidad, referencia y representación

La identidad responde a quién es la persona dentro del contexto del usuario.

Una referencia señala a esa persona desde:

- una conversación;
- un mensaje;
- una captura;
- un compromiso;
- una responsabilidad;
- un seguimiento;
- un resultado.

La representación permite al usuario reconocerla de forma comprensible. Puede apoyarse en la información confirmada disponible, sin exigir datos completos.

Identidad, referencia y representación deben distinguirse:

- varias referencias pueden apuntar a una misma persona, pero sólo cuando la relación está confirmada;
- referencias parecidas pueden corresponder a personas distintas;
- una referencia incompleta puede existir sin identidad resuelta;
- una representación visible no equivale a un perfil exhaustivo;
- un identificador técnico no debe ser el concepto que el usuario necesita comprender;
- corregir una representación no debe reescribir silenciosamente las fuentes originales.

Cuando Ping sospecha una coincidencia, puede sugerirla. La sugerencia no confirma identidad, no fusiona personas y no amplía permisos.

## 8. Tipos de relación

People debe representar relaciones desde la perspectiva del usuario y dentro de un contexto identificable.

**Relación consigo mismo**

El usuario aparece como persona en su self-chat, como propietario y, cuando corresponda, como responsable de sus compromisos.

**Contacto conocido**

Persona que el usuario reconoce, aunque no sea usuaria registrada de Ping ni tenga identificadores completos.

**Participante autorizado**

Persona relacionada con una conversación compartida dentro de los límites de autorización de esa conversación.

**Responsable de un compromiso**

Persona de quien se espera una acción, respuesta, revisión o decisión confirmada.

**Persona relacionada con un compromiso**

Persona que aporta contexto como solicitante, participante o parte del asunto sin ser necesariamente responsable.

**Referencia mencionada**

Persona aludida en una captura, mensaje o contexto, cuya identidad puede estar confirmada, incompleta o ser ambigua.

**Relación por promesa o solicitud**

Relación contextual que permite comprender qué prometió el usuario, qué solicitó o qué espera recibir.

**Relación por asunto abierto o resultado**

Relación derivada de compromisos autorizados que permite reconocer pendientes y resultados compartidos.

Estos tipos no forman una clasificación social ni una jerarquía de valor. Una persona puede mantener varios tipos de relación según los asuntos confirmados.

## 9. Relaciones entre personas, conversaciones y compromisos

- una Person puede relacionarse con varias conversaciones autorizadas;
- una conversación puede tener uno o más participantes;
- el self-chat puede tener únicamente al propio usuario;
- una persona puede originar un mensaje cuando esa procedencia es identificable;
- una persona mencionada no se convierte automáticamente en participante;
- una Person puede relacionarse con varios compromisos;
- un compromiso pertenece a un usuario propietario;
- un compromiso tiene un responsable comprensible;
- propietario y responsable pueden ser la misma persona;
- el responsable puede ser otra persona relacionada según el contexto confirmado;
- una persona puede relacionarse con un compromiso sin ser responsable;
- una conversación o mensaje puede aportar la referencia que identifica a una persona;
- un compromiso puede aportar el significado de la relación con una persona;
- un resultado puede conservar qué personas estuvieron relacionadas;
- Memory puede recuperar asuntos por persona dentro de la autorización aplicable.

People mantiene las conexiones conceptuales. Conversation conserva el contenido y los participantes autorizados. Commitment conserva la función de cada persona dentro del asunto.

## 10. Propiedad y autorización

Toda relación en People se comprende desde la perspectiva de un usuario.

El usuario sólo puede consultar:

- información que le pertenece;
- relaciones que le pertenecen;
- conversaciones para las que tiene autorización;
- compromisos que puede consultar;
- contexto que los dominios de origen pueden entregar legítimamente.

Relacionar una persona con un asunto no amplía el acceso a:

- otras conversaciones de esa persona;
- otros compromisos;
- otros usuarios;
- mensajes privados;
- archivos o audios;
- recuerdos pertenecientes a terceros.

Una conversación compartida no convierte toda la información de sus participantes en pública.

Una persona relacionada con un compromiso no recibe acceso automático a ese compromiso.

La misma persona puede tener representaciones y relaciones diferentes para usuarios distintos, porque cada una se construye desde contexto, propiedad y autorización propios.

People debe entregar sólo la información necesaria y permitida para recordar, seguir o resolver el asunto consultado.

## 11. Personas registradas y no registradas

People debe representar personas sin exigir que utilicen Ping.

Una persona registrada:

- puede tener una relación confirmada con una identidad de Ping;
- puede participar en una conversación autorizada cuando la colaboración esté habilitada;
- sigue estando sujeta a los límites de cada conversación y compromiso;
- no se convierte en un perfil global visible.

Una persona no registrada:

- puede ser mencionada en una captura;
- puede ser un contacto conocido;
- puede ser responsable de un compromiso confirmado;
- puede estar relacionada con una promesa, solicitud o resultado;
- puede carecer de email, teléfono u otro identificador completo;
- no necesita una cuenta para existir conceptualmente en People.

La condición de registrada o no registrada no determina la importancia de una persona ni la validez del asunto.

Los documentos base no definen cómo una persona no registrada pasa a relacionarse con una identidad registrada. Esa transición no debe asumirse automáticamente.

## 12. Ambigüedad e identidad incompleta

People debe aceptar que la identidad puede estar incompleta.

Existe ambigüedad cuando:

- sólo se conoce un nombre parcial;
- varias personas comparten un nombre parecido;
- una captura utiliza un pronombre o una referencia indirecta;
- se menciona un rol sin identificar a la persona;
- la misma persona aparece con representaciones distintas;
- no existe información suficiente para saber si dos referencias coinciden;
- una identidad registrada parece similar a un contacto conocido, pero no existe confirmación.

Ante la ambigüedad:

- debe conservarse una Unresolved Person Reference;
- no se debe inventar un identificador;
- no se debe asignar una responsabilidad silenciosamente;
- no se deben fusionar personas;
- no se deben trasladar relaciones o asuntos;
- no se deben ampliar permisos;
- la incertidumbre debe ser comprensible para el usuario;
- el usuario debe poder corregir o confirmar cuando corresponda.

La IA puede proponer una Possible Identity Match. La propuesta no constituye una decisión.

Una identidad incompleta es preferible a una identidad falsa.

## 13. Evolución de una relación

Una relación puede adquirir contexto a medida que el usuario confirma información relevante.

Su evolución puede incluir:

1. una persona es mencionada mediante una referencia incompleta;
2. el usuario reconoce o corrige su representación;
3. una conversación autorizada aporta participación o procedencia;
4. un compromiso confirmado aporta una función, como responsable o persona relacionada;
5. un seguimiento registra nueva relación con el asunto;
6. una resolución conserva el resultado relacionado con esa persona;
7. Memory permite recuperar posteriormente ese contexto autorizado.

La evolución debe:

- conservar la procedencia de cada relación;
- distinguir hechos confirmados de inferencias;
- permitir correcciones;
- evitar perfiles automáticos;
- evitar conclusiones sobre comportamiento o reputación;
- mantener límites de autorización;
- conservar la perspectiva del usuario.

Una relación no se vuelve más pública ni más cierta por acumular referencias.

Los documentos base no definen estados formales para una relación ni reglas de fusión, separación o eliminación. Esas decisiones permanecen pendientes.

## 14. Contexto asociado a una persona

El contexto por persona permite comprender asuntos autorizados sin convertir todo lo relacionado en un perfil permanente.

Puede incluir:

- conversaciones autorizadas en las que participa;
- mensajes de origen cuando existe autorización;
- compromisos relacionados;
- responsabilidades confirmadas;
- promesas del usuario;
- solicitudes realizadas o recibidas;
- asuntos abiertos;
- seguimientos;
- resultados;
- fechas relevantes del asunto;
- roles cuando corresponda;
- procedencia de cada relación.

El contexto debe ayudar a responder preguntas como:

- ¿Qué tengo pendiente con esta persona?
- ¿Qué me prometió?
- ¿Qué le prometí?
- ¿Cuándo hablamos de este asunto?
- ¿Qué compromisos siguen abiertos?
- ¿Qué ocurrió finalmente?

People no conserva por sí solo el contenido completo que responde esas preguntas. Coordina referencias autorizadas hacia Conversation, Commitment y Memory.

No todo dato asociado a una persona debe convertirse en contexto visible ni en memoria permanente. Debe ser relevante para comprender, seguir o resolver asuntos.

## 15. Reglas e invariantes

1. Una persona puede ser el propio usuario.
2. Una persona no necesita usar Ping para ser representada.
3. Una persona no necesita email, teléfono ni identificador completo.
4. Una referencia incompleta puede existir sin identidad resuelta.
5. Dos referencias parecidas no representan automáticamente a la misma persona.
6. La similitud de nombre no autoriza una fusión.
7. La IA puede sugerir coincidencias, pero no confirmarlas.
8. Ninguna identidad se fusiona sin control del usuario.
9. Ninguna inferencia crea un perfil enriquecido no confirmado.
10. Toda relación se entiende desde la perspectiva de un usuario.
11. Toda relación relevante debe conservar contexto o procedencia.
12. Una mención no convierte automáticamente a una persona en participante.
13. Una mención no convierte automáticamente a una persona en responsable.
14. Un participante de una conversación no es responsable de todos sus compromisos.
15. Una persona relacionada con un compromiso no es necesariamente responsable.
16. El responsable confirmado se conserva dentro de Commitment.
17. Conversation conserva participantes, mensajes y procedencia.
18. People no modifica el contenido original de Conversation.
19. People no administra el ciclo de vida de Commitment.
20. People no convierte todas las relaciones en memoria permanente.
21. Consultar por persona no amplía permisos.
22. Una relación compartida no hace pública toda la información.
23. Una identidad registrada no implica acceso global.
24. Una persona no registrada puede relacionarse con compromisos válidos.
25. La representación visible debe ser comprensible.
26. La representación visible debe ser corregible.
27. La identidad técnica no debe ser el modelo mental del usuario.
28. Las correcciones no deben falsificar silenciosamente la fuente.
29. La incertidumbre debe permanecer visible.
30. La información derivada debe distinguirse de la confirmada.
31. La información sólo puede usarse para recordar, seguir y resolver asuntos.
32. People no asigna reputación ni evalúa personas.
33. People no funciona como directorio global.
34. People no duplica Conversation, Commitment ni Memory.

## 16. Casos de uso obligatorios del MVP

**Representar al propio usuario**

El usuario puede aparecer como persona en self-chat y como propietario o responsable de compromisos.

**Representar una persona mencionada**

Una captura o compromiso puede mantener una referencia a alguien aunque no use Ping.

**Conservar una referencia incompleta**

Cuando no existe certeza, People mantiene la ambigüedad sin inventar identidad.

**Reconocer una persona conocida**

El usuario puede comprender a quién se refiere una relación con la información confirmada disponible.

**Relacionar un participante autorizado**

Cuando exista una conversación compartida habilitada, People puede representar al participante dentro de sus límites de acceso.

**Relacionar un responsable**

Commitment puede vincular a una persona como responsable sólo según la información confirmada.

**Relacionar otras personas con un compromiso**

El compromiso puede conservar personas contextualmente relevantes sin asignarles responsabilidad automática.

**Consultar pendientes por persona**

El usuario puede recuperar asuntos autorizados relacionados con una persona.

**Comprender promesas y solicitudes**

El usuario puede distinguir qué prometió, qué solicitó y qué espera recibir según los compromisos confirmados.

**Volver al contexto**

El usuario puede alcanzar la conversación, mensaje o compromiso autorizado que explica la relación.

**Corregir una representación**

El usuario puede corregir información comprensible de una persona sin reescribir la fuente.

**Evitar una coincidencia incorrecta**

Una sugerencia ambigua permanece como propuesta y no fusiona identidades.

## 17. Interacción con Conversation

Conversation aporta a People:

- participantes autorizados;
- autor u origen de un mensaje cuando corresponde;
- personas mencionadas;
- conversación y mensaje de procedencia;
- contexto conversacional autorizado;
- referencias incompletas detectadas en capturas.

People aporta a Conversation:

- una representación comprensible de las personas;
- referencias de identidad confirmadas;
- referencias incompletas cuando no existe certeza;
- relaciones contextuales autorizadas.

People no:

- conserva la secuencia completa de mensajes;
- decide quién puede acceder a una conversación;
- convierte una mención en participante;
- reescribe el autor de un mensaje;
- hace pública la información de un participante;
- asume que toda conversación tiene varias personas.

El self-chat mantiene al usuario como persona principal y no depende de People para introducir colaboración.

## 18. Interacción con Commitment

Commitment aporta a People:

- propietario;
- responsable confirmado;
- personas relacionadas;
- promesas;
- solicitudes;
- asuntos abiertos;
- seguimientos;
- resultados;
- contexto y procedencia autorizados.

People aporta a Commitment:

- identidad comprensible del propietario;
- identidad o referencia del responsable;
- referencias de personas relacionadas;
- ambigüedad visible cuando una persona no está resuelta;
- relaciones contextuales confirmadas.

People no:

- confirma la creación de un compromiso;
- decide quién es responsable sin confirmación;
- cambia el estado del compromiso;
- registra seguimientos como propios;
- resuelve compromisos;
- modifica la fuente;
- traslada automáticamente asuntos entre personas ante una posible coincidencia.

Commitment conserva la función de cada persona dentro del asunto. People administra la identidad y la relación general desde la perspectiva del usuario.

## 19. Interacción con Memory

People aporta a Memory:

- personas y referencias autorizadas;
- representaciones comprensibles;
- relaciones con conversaciones;
- relaciones con compromisos;
- contexto por persona;
- procedencia;
- distinción entre información confirmada, incompleta y derivada.

Memory permite recuperar:

- asuntos pendientes por persona;
- compromisos autorizados;
- conversaciones de origen autorizadas;
- promesas, solicitudes y resultados relacionados;
- contexto necesario para comprender la relación.

Memory no debe:

- convertir todas las menciones en memoria permanente;
- consolidar identidades ambiguas;
- construir perfiles inferidos;
- mezclar relaciones entre usuarios;
- ampliar permisos;
- presentar una coincidencia sugerida como identidad confirmada.

People no decide por sí solo qué información debe recordarse de manera permanente. Memory recupera sólo contexto relevante, autorizado y con procedencia.

## 20. Información que debe conservarse

People debe conservar conceptualmente:

- identidad conceptual distinguible;
- relación con el usuario propietario;
- indicación de que representa al propio usuario cuando corresponda;
- representación comprensible confirmada;
- condición de referencia resuelta o incompleta;
- relación con una identidad registrada cuando esté confirmada;
- posibilidad de representar una persona no registrada;
- tipos de relación contextual confirmados;
- referencias autorizadas a conversaciones;
- referencias autorizadas a compromisos;
- funciones confirmadas dentro de compromisos;
- procedencia de menciones y relaciones;
- contexto necesario para comprender la relación;
- distinción entre información confirmada, propuesta e incierta;
- correcciones relevantes;
- límites de propiedad y autorización;
- decisiones del usuario sobre posibles coincidencias cuando corresponda.

People debe permitir reconstruir:

- por qué la persona aparece en Ping;
- desde qué fuente se la relacionó;
- qué significado tiene para el usuario;
- en qué asuntos autorizados participa;
- qué responsabilidades fueron confirmadas;
- qué ambigüedades permanecen sin resolver.

## 21. Información que no pertenece al dominio

No pertenece a People:

- el contenido completo de conversaciones;
- la secuencia completa de mensajes;
- archivos y audios originales;
- permisos administrados por Conversation;
- descripción, estado, prioridad y ciclo de vida de compromisos;
- seguimientos y resultados administrados por Commitment;
- la selección general de memoria relevante;
- historiales completos duplicados desde otros dominios;
- perfiles públicos;
- directorios globales;
- agendas de contactos genéricas;
- libretas de direcciones;
- datos de CRM;
- actividad social;
- reputación o puntuaciones;
- inferencias de personalidad;
- evaluaciones de comportamiento;
- perfiles enriquecidos no confirmados;
- información obtenida para vigilancia;
- datos sin relación con recordar, seguir o resolver asuntos;
- integraciones o capacidades fuera del MVP.

People conserva referencias y relaciones suficientes para colaborar con otros dominios, no copias completas de su información.

## 22. Errores y situaciones ambiguas

**Sólo existe una mención parcial**

Se conserva como referencia incompleta. No se inventan datos.

**Dos personas tienen nombres parecidos**

Se mantienen separadas mientras no exista confirmación suficiente.

**Dos referencias podrían ser la misma persona**

Puede presentarse una sugerencia de coincidencia, pero no se fusionan automáticamente.

**Una referencia parece corresponder a una persona registrada**

La similitud no confirma identidad ni habilita acceso adicional.

**La persona no utiliza Ping**

Puede representarse y relacionarse con asuntos sin crear una cuenta ficticia.

**No existe email o teléfono**

La persona puede seguir siendo válida dentro del contexto conocido.

**Una persona mencionada parece responsable**

Commitment debe mantener la asignación como ambigua o propuesta hasta la confirmación del usuario.

**La misma persona aparece con representaciones distintas**

No se asume identidad común. La posible coincidencia queda pendiente de confirmación.

**Una representación fue corregida**

La corrección no reescribe silenciosamente mensajes ni capturas de origen.

**Una relación proviene de información no autorizada**

No se expone ni se incorpora al contexto disponible.

**Una persona participa en una conversación compartida**

Su participación no hace públicos otros asuntos, compromisos o relaciones.

**Un compromiso cambia de responsable**

Commitment conserva el cambio y People refleja sólo la relación autorizada; las reglas detalladas de evolución permanecen en Commitment.

**La fuente original se elimina**

Debe respetarse el control del usuario, pero el tratamiento de la referencia y la procedencia no está resuelto por los documentos base.

**Una fusión confirmada resultaría incorrecta**

Los documentos base no definen todavía cómo separar identidades ni reparar relaciones trasladadas.

## 23. API conceptual del dominio

La API conceptual expresa capacidades y resultados del dominio. No define endpoints, estructuras físicas ni tecnologías.

**Representar al propio usuario**

Resultado esperado: existe una referencia comprensible al usuario dentro de sus asuntos autorizados.

**Representar una persona**

Resultado esperado: la persona puede reconocerse con la información confirmada disponible, aunque no use Ping.

**Registrar una referencia incompleta**

Resultado esperado: se conserva la mención y su procedencia sin afirmar identidad.

**Obtener una persona autorizada**

Resultado esperado: se entrega su representación y contexto permitido o se rechaza el acceso.

**Relacionar una persona con una conversación**

Resultado esperado: queda una referencia contextual sin copiar el contenido ni ampliar permisos.

**Relacionar una persona con un compromiso**

Resultado esperado: se conserva su función confirmada como propietario, responsable o persona relacionada.

**Proponer una posible coincidencia**

Resultado esperado: se presenta una sugerencia explícitamente pendiente de decisión.

**Confirmar o rechazar una coincidencia**

Resultado esperado: el usuario controla la decisión; el rechazo mantiene identidades separadas.

**Corregir una representación**

Resultado esperado: la persona vuelve a ser comprensible sin alterar silenciosamente las fuentes.

**Consultar contexto por persona**

Resultado esperado: se recuperan sólo conversaciones, compromisos y recuerdos autorizados.

**Consultar pendientes por persona**

Resultado esperado: se obtienen asuntos autorizados conservando responsable, procedencia y contexto.

**Entregar identidad a Conversation**

Resultado esperado: Conversation recibe una representación comprensible sin transferir el control de acceso.

**Entregar identidad a Commitment**

Resultado esperado: Commitment puede expresar propietario, responsable y personas relacionadas sin que People administre el ciclo del asunto.

**Entregar contexto a Memory**

Resultado esperado: Memory puede recuperar relaciones autorizadas con procedencia y ambigüedad visible.

**Corregir o eliminar información propia**

Resultado esperado: el usuario conserva control dentro de reglas que no falsifiquen silenciosamente las fuentes.

## 24. Criterios de aceptación

People se considera definido correctamente para el MVP cuando:

1. El propio usuario puede representarse como persona.
2. Una persona puede existir sin ser usuaria registrada de Ping.
3. Una persona puede existir sin email, teléfono ni identificador completo.
4. Una referencia incompleta puede conservarse sin inventar identidad.
5. Dos referencias parecidas no se fusionan automáticamente.
6. La IA sólo puede sugerir una coincidencia.
7. El usuario conserva control sobre la confirmación de identidad.
8. Las representaciones son comprensibles y corregibles.
9. La identidad técnica no se presenta como modelo mental.
10. Toda relación se contextualiza desde la perspectiva del usuario.
11. Una persona puede ser participante autorizado sin que toda su información sea pública.
12. Una persona puede ser responsable o estar relacionada con un compromiso.
13. Una mención no asigna responsabilidad automáticamente.
14. El usuario puede consultar pendientes autorizados por persona.
15. El usuario puede comprender promesas, solicitudes y resultados relacionados.
16. Conversation conserva mensajes, participantes y procedencia.
17. Commitment conserva responsables y ciclo de vida.
18. Memory recupera contexto autorizado sin consolidar identidades ambiguas.
19. Consultar por persona no amplía permisos.
20. La información derivada se distingue de la confirmada.
21. No se construyen perfiles enriquecidos mediante inferencias.
22. La información sólo se utiliza para recordar, seguir y resolver asuntos.
23. People no se convierte en agenda, libreta de direcciones, CRM, red social, reputación, directorio o vigilancia.
24. People no duplica Conversation ni Commitment.

## 25. Decisiones pendientes

1. Definir el alcance inicial de las consultas por persona cuando existan contactos y usuarios registrados.
2. Definir si la primera validación será exclusivamente personal o incluirá colaboración básica.
3. Definir si responsables distintos del usuario estarán habilitados en la primera beta.
4. Definir qué información mínima hace comprensible una representación de persona.
5. Definir cómo el usuario confirma o rechaza posibles coincidencias.
6. Definir si dos referencias confirmadas pueden fusionarse y bajo qué condiciones.
7. Definir cómo se revierte una fusión incorrecta.
8. Definir cómo se separan relaciones trasladadas a la persona equivocada.
9. Definir cómo una persona no registrada se relaciona posteriormente con una identidad registrada.
10. Definir cómo se distingue para el usuario una persona registrada de una no registrada, si esa distinción resulta necesaria.
11. Definir cómo se corrige o elimina una persona sin perder la procedencia de asuntos existentes.
12. Definir qué ocurre con las referencias cuando se elimina su conversación o mensaje de origen.
13. Definir qué información de contacto, si alguna, será necesaria para el MVP.
14. Definir cómo se representan roles y organizaciones cuando corresponda, sin ampliar el alcance a un CRM.
15. Definir el tratamiento de personas con el mismo nombre dentro de contextos diferentes.
16. Definir si una referencia incompleta puede quedar sin resolver permanentemente.
17. Definir qué relaciones contextuales se conservan cuando un compromiso se resuelve.

Hasta resolver estas decisiones, People debe conservar la ambigüedad y evitar suposiciones silenciosas.

## 26. Resumen del dominio

People administra identidad y relaciones desde la perspectiva del usuario.

Una persona puede ser el propio usuario, un contacto conocido, un participante autorizado, un responsable, alguien relacionado con un compromiso o una referencia incompleta. No necesita usar Ping ni tener datos completos.

La regla de identidad es:

> Una referencia parecida no es una identidad confirmada.

La regla de relación es:

> Toda relación necesita contexto, procedencia y autorización.

La regla de control es:

> La IA puede sugerir una coincidencia; el usuario decide y ninguna fusión es automática.

Conversation conserva mensajes, participantes y procedencia. Commitment conserva responsables y personas relacionadas dentro de cada asunto. Memory permite recuperar contexto autorizado por persona. People conecta estas referencias sin duplicar el contenido ni ampliar permisos.

People no es una agenda de contactos, una libreta de direcciones, un CRM, una red social, un sistema de reputación, un directorio global, una herramienta de vigilancia ni un perfil automático construido con inferencias.

Su valor consiste en que el usuario pueda comprender con quién tiene asuntos pendientes, qué relación tiene cada persona con esos asuntos y qué contexto autorizado permite recordarlos, seguirlos y resolverlos.
