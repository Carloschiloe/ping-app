# Ping — Offline First

## 1. Propósito

Este documento define el significado funcional de Offline First dentro de Ping.

Offline First permite que el usuario conserve continuidad cuando no existe una conexión confiable, sin hacerle creer que una intención local ya fue aceptada, compartida o ejecutada.

El propósito es establecer:

- qué puede conocer y hacer el usuario en distintos estados de conectividad;
- cómo distinguir información local, pendiente, confirmada y potencialmente desactualizada;
- cómo proteger una intención que todavía no pudo confirmarse;
- cómo mantener autorización, procedencia y contexto;
- cómo reconocer rechazos, incertidumbre y conflictos;
- qué debe ocurrir conceptualmente cuando vuelve la conexión.

Offline First es un comportamiento del producto. No define almacenamiento, transporte, persistencia, sincronización ni arquitectura técnica.

No significa que todas las capacidades de Ping deban estar disponibles sin conexión. Significa que cada capacidad debe declarar con claridad sus límites y su estado real.

---

## 2. Estado de conectividad

El estado de conectividad expresa qué grado de comunicación puede reconocer Ping en un momento determinado.

### Conectado

Ping puede intentar comunicarse con el sistema autorizado.

Estar conectado no garantiza:

- que una operación sea aceptada;
- que el servicio necesario esté disponible;
- que la información recibida sea la más reciente;
- que el usuario conserve la autorización;
- que exista una respuesta concluyente.

### Conexión inestable

Ping observa comunicación intermitente o insuficiente para asegurar continuidad.

En este estado:

- una consulta puede completarse y la siguiente no;
- una acción puede quedar sin resultado conocido;
- la información puede actualizarse sólo parcialmente;
- el usuario necesita conocer qué fue confirmado y qué sigue pendiente.

### Sin conexión

Ping no puede comunicarse en ese momento con el sistema autorizado.

Puede seguir ofreciendo capacidades que dependan únicamente de información disponible y autorizada localmente, dentro de límites explícitos.

### Estado desconocido

Ping no puede determinar de forma confiable si existe comunicación suficiente.

El estado desconocido no debe presentarse como conexión ni como desconexión confirmada. Las acciones iniciadas bajo esta incertidumbre conservan su estado real hasta obtener un resultado.

### Regla de interpretación

El estado técnico de la red y el resultado funcional de una operación son conceptos distintos. La interfaz debe comunicar el resultado de la acción, no deducirlo únicamente desde la conectividad aparente.

---

## 3. Disponibilidad funcional

La disponibilidad funcional expresa qué puede hacer el usuario con una capacidad concreta bajo las condiciones actuales.

### Disponible

La capacidad puede utilizarse y Ping puede obtener una confirmación suficiente de su resultado.

### Disponible con limitaciones

La capacidad ofrece utilidad parcial, pero:

- trabaja sólo con información disponible localmente;
- puede omitir cambios recientes;
- no puede completar determinadas decisiones;
- puede dejar una intención pendiente;
- requiere una revisión posterior.

Las limitaciones deben ser visibles antes de que produzcan una expectativa incorrecta.

### Pendiente de confirmación

La intención fue registrada, pero todavía no existe un resultado autorizado concluyente.

Pendiente de confirmación describe el estado de una acción, no la disponibilidad general de toda una capacidad.

### No disponible sin conexión

La capacidad requiere información, autorización o confirmación que Ping no puede obtener en ese momento.

Ping debe explicar el límite con lenguaje funcional y conservar, cuando corresponda, el trabajo preparatorio del usuario. No debe simular que la operación se completó.

### Regla de claridad

Dos acciones dentro de una misma capacidad pueden tener disponibilidades diferentes. Por ejemplo, redactar puede estar disponible y enviar quedar pendiente.

---

## 4. Información local

Información local es contenido que Ping puede presentar o utilizar en el dispositivo sin tener que obtenerlo nuevamente en ese momento.

Puede incluir:

- contenido consultado anteriormente;
- una intención recién registrada;
- una representación previamente confirmada;
- contexto necesario para comprender un asunto;
- referencias cuyo contenido completo no está disponible;
- resultados derivados identificados como tales.

Que algo esté disponible localmente no significa que:

- sea la versión más reciente;
- continúe vigente;
- haya sido confirmado;
- su fuente siga disponible;
- la autorización no haya cambiado;
- pueda compartirse o modificarse;
- deba convertirse en memoria permanente.

Ping debe poder distinguir:

- información confirmada conocida;
- información local todavía no confirmada;
- información posiblemente desactualizada;
- información cuya vigencia no puede determinarse;
- información que ya no puede consultarse tras conocer una revocación.

La disponibilidad local nunca amplía permisos. Un contenido previamente visible no concede un derecho permanente a consultarlo o actuar sobre él.

---

## 5. Acción local pendiente

Una acción local pendiente es una intención del usuario registrada por Ping que todavía no ha sido confirmada por el sistema autorizado.

Puede representar, cuando la capacidad lo permita:

- enviar un mensaje;
- proponer la creación o actualización de un compromiso;
- registrar un avance;
- preparar una nota;
- asociar una referencia;
- solicitar una acción cuando exista comunicación suficiente.

Una acción local pendiente debe conservar:

- la intención comprensible del usuario;
- el recurso y contexto al que se refiere;
- el momento en que fue registrada;
- la persona que la inició;
- su estado de confirmación;
- las dependencias conocidas;
- cualquier incertidumbre relevante.

No toda acción puede prepararse o quedar pendiente sin conexión. Las acciones que requieran información actual, autorización inmediata o una decisión sensible pueden permanecer no disponibles.

Una acción pendiente:

- no modifica por sí misma la fuente;
- no demuestra que otra persona recibió algo;
- no concede permisos;
- no crea un hecho confirmado;
- no debe ocultarse al usuario;
- puede dejar de ser válida antes de confirmarse.

El usuario debe poder reconocer qué quiso hacer incluso si la aplicación se cierra o la conexión cambia.

---

## 6. Confirmación

La confirmación permite distinguir la intención del resultado.

### Intención registrada

Ping conservó lo que el usuario quiso hacer.

Todavía no implica que la acción haya sido preparada para comunicarse ni que pueda ejecutarse bajo las condiciones actuales.

### Acción pendiente

La intención espera la posibilidad de ser validada o comunicada.

Puede requerir autorización, contexto vigente o revisión previa.

### Acción enviada

Ping pudo presentar la acción al sistema autorizado, pero aún no conoce una decisión concluyente.

Enviada no equivale a aceptada.

### Acción aceptada

El sistema autorizado confirmó que la acción fue admitida y produjo el resultado correspondiente.

Sólo entonces Ping puede presentarla como confirmada.

### Acción rechazada

El sistema autorizado determinó que la acción no puede aceptarse.

El rechazo debe conservar:

- la intención original;
- el hecho de que no se confirmó;
- una explicación funcional cuando esté disponible;
- la posibilidad de revisión cuando corresponda.

### Resultado desconocido

Ping no puede determinar si la acción fue recibida, aceptada o rechazada.

El resultado desconocido debe mantenerse distinto de pendiente, aceptado y rechazado. Repetir automáticamente la acción o mostrarla como completada podría alterar el significado del asunto.

### Regla de confirmación

Ping no debe mostrar una acción como completada sólo porque fue registrada localmente, intentada o enviada.

---

## 7. Información desactualizada

La información está potencialmente desactualizada cuando Ping no puede asegurar que represente el estado vigente del recurso.

El usuario debe poder distinguir:

### Última información conocida

Es la representación más reciente que Ping tiene disponible, sin afirmar que continúa vigente.

### Información confirmada recientemente

Existe una confirmación cercana y comprensible, aunque ningún dato queda vigente de manera indefinida.

### Información pendiente de actualización

Ping sabe que necesita revisar o completar información cuando recupere comunicación suficiente.

### Vigencia desconocida

Ping no cuenta con elementos para afirmar si la información sigue siendo actual.

La antigüedad por sí sola no determina relevancia ni verdad. El tipo de recurso, las decisiones posteriores y la autorización afectan su interpretación.

Ping no debe:

- ocultar que una representación puede estar desactualizada;
- presentar una copia local como fuente independiente;
- modificar silenciosamente la historia;
- completar vacíos con inferencias;
- tratar la falta de actualización como confirmación de que nada cambió.

---

## 8. Continuidad de Conversation

Offline First permite continuar parte de la experiencia conversacional sin convertir Conversation en una copia de mensajería instantánea ni fingir comunicación inexistente.

### Lectura

El usuario puede leer contenido previamente disponible y todavía autorizado según el conocimiento actual de Ping.

La conversación debe indicar cuando:

- puede haber mensajes más recientes;
- parte del contenido no está disponible;
- la autorización necesita ser validada;
- el orden visible es provisional.

### Redacción local

El usuario puede preparar texto localmente cuando esa capacidad esté disponible.

Redactar no significa enviar. El contenido conserva la condición de intención local hasta que exista confirmación.

### Envío pendiente

Un mensaje pendiente debe distinguirse de los mensajes confirmados.

No debe afirmarse que:

- fue recibido;
- ocupa una posición definitiva;
- otra persona puede verlo;
- produjo un compromiso;
- modificó la conversación original.

### Orden aparente

Ping puede presentar una secuencia comprensible con la información conocida, pero debe reconocer que la conversación pudo cambiar remotamente.

El orden definitivo y su reconciliación pertenecen a Synchronization. Este documento sólo exige que el orden provisional no se confunda con una cronología confirmada.

### Procedencia

Todo mensaje local conserva su conversación prevista, autor, momento de intención y estado de confirmación.

Una conversación nunca crea compromisos automáticamente, con o sin conexión.

---

## 9. Continuidad de Commitment

Offline First protege la intención relacionada con un compromiso sin convertir una transición local en un cambio definitivo.

El usuario puede preparar localmente, cuando exista contexto suficiente:

- una propuesta de creación;
- una actualización descriptiva;
- un avance;
- una nota relacionada;
- una intención de seguimiento;
- una propuesta de resultado.

Las siguientes decisiones son sensibles y requieren confirmación autorizada antes de considerarse definitivas:

- creación;
- aceptación;
- rechazo;
- reasignación;
- cambio de estado;
- resolución;
- cancelación.

### Creación

Una propuesta local de compromiso no es todavía un compromiso confirmado. Debe mantener origen, contexto y responsable propuesto.

### Avance

Un avance local no equivale a resolución. Puede quedar pendiente y perder vigencia si el asunto cambió.

### Reasignación

La intención de cambiar responsable no concede acceso ni modifica la responsabilidad vigente hasta ser aceptada.

### Resolución

Una resolución local conserva el resultado que el usuario quiso registrar, pero no cierra definitivamente el asunto sin confirmación.

### Rechazo o cancelación

Si estas decisiones están permitidas por las reglas vigentes, su preparación local tampoco altera el ciclo de vida hasta ser confirmada.

Commitment administra el ciclo de vida confirmado. Offline First conserva la continuidad y la intención mientras ese ciclo todavía no puede validarse.

---

## 10. People, Memory e IA

### People

La representación local de una persona puede no estar actualizada.

Ping no debe:

- fusionar identidades por trabajar sin conexión;
- completar identificadores faltantes;
- asumir que una relación continúa vigente;
- ampliar acceso desde una relación conocida anteriormente;
- convertir una coincidencia local en identidad confirmada.

Una referencia incompleta sigue siendo incompleta.

### Memory

Memory puede recuperar contexto local autorizado y distinguir su estado.

No debe:

- consolidar una intención pendiente como hecho definitivo;
- transformar una inferencia local en recuerdo confirmado;
- sustituir una fuente que no está disponible;
- ocultar que el contexto puede estar desactualizado;
- convertir automáticamente toda acción pendiente en memoria permanente.

### Inteligencia artificial

La IA debe distinguir entre:

- contexto confirmado;
- contexto local pendiente;
- contexto potencialmente desactualizado;
- información derivada;
- información cuya vigencia es desconocida.

La IA puede ayudar a explicar, preparar o interpretar dentro de la información disponible y autorizada. Nunca debe afirmar que una acción se completó si sólo existe una intención local.

Una interpretación generada sin conexión:

- no reemplaza la fuente;
- no confirma un hecho;
- no resuelve una identidad;
- no crea un compromiso;
- no elimina la necesidad de validación posterior;
- debe conservar procedencia e incertidumbre.

La disponibilidad exacta de capacidades de IA sin conexión es una decisión pendiente.

---

## 11. Authorization

Offline First respeta Authorization en todo momento.

El acceso previo no garantiza acceso futuro. Mientras el dispositivo está desconectado:

- una autorización puede haber sido revocada;
- el alcance compartido puede haber cambiado;
- un recurso puede haber dejado de estar disponible;
- una persona puede haber perdido participación;
- una acción antes permitida puede ser rechazada.

Ping debe:

- limitar las acciones al alcance conocido;
- reconocer cuando la autorización no puede comprobarse;
- no usar información local para conceder permisos nuevos;
- validar autorización al recuperar comunicación;
- aceptar que una acción pendiente puede ser rechazada;
- aplicar la revocación cuando pueda conocerla;
- impedir nuevos accesos conforme a la decisión autorizada;
- conservar la trazabilidad permitida sin seguir exponiendo contenido.

La incertidumbre de autorización debe ser visible cuando afecte una acción o un contenido.

Offline First no define cómo se comunica, conserva o aplica técnicamente una revocación.

---

## 12. Events

Offline First distingue hechos de intenciones e intentos.

### Intención local

El usuario expresó algo que quiere hacer. No es, por sí sola, un evento del dominio propietario.

### Intento de acción

Ping intentó obtener confirmación. El intento no demuestra aceptación ni resultado.

### Hecho confirmado

El dominio propietario reconoce que ocurrió un cambio significativo y autorizado.

Sólo el hecho confirmado puede representar, cuando corresponda, un evento de dominio sobre la acción realizada.

### Rechazo

Ocurrió que una acción propuesta no fue aceptada. El rechazo puede ser un hecho relevante sin convertir la intención original en una acción realizada.

### Reconciliación posterior

Al recuperar comunicación, Ping puede conocer qué intenciones fueron aceptadas, rechazadas, quedaron inciertas o entraron en conflicto.

La reconciliación no reescribe lo ocurrido. Expresa nuevos hechos con su procedencia y momento.

No toda interacción de interfaz, escritura local o cambio visual constituye un evento de dominio.

---

## 13. Notifications

Una notificación puede comunicar al usuario:

- que una acción quedó pendiente;
- que todavía no existe confirmación;
- que una acción está siendo intentada;
- que fue aceptada posteriormente;
- que fue rechazada;
- que su resultado sigue siendo desconocido;
- que existe un conflicto;
- que se requiere intervención.

Una notificación local:

- no prueba que una acción fue ejecutada;
- no reemplaza el evento;
- no reemplaza la conversación ni el compromiso;
- no concede autorización;
- no decide cómo resolver un conflicto;
- puede perder vigencia cuando cambia el estado de la acción.

La comunicación debe expresar el estado real conocido y dirigir al contexto que permita comprenderlo.

No todo cambio de conectividad ni toda acción pendiente requiere una notificación. La relevancia sigue las reglas de Notifications.

---

## 14. Search y Retrieval

### Search sin conexión

Search sólo puede operar sobre información disponible y autorizada localmente.

Sus resultados pueden ser:

- incompletos;
- potencialmente desactualizados;
- limitados a ciertos recursos;
- distintos de los que aparecerán al recuperar conexión.

Search no debe presentar la búsqueda local como exhaustiva.

La ausencia de resultados sin conexión no demuestra que el recurso no exista.

### Retrieval sin conexión

Retrieval sólo puede recuperar el contenido y contexto realmente disponibles.

No debe:

- fingir acceso a una fuente ausente;
- inventar contexto faltante;
- sustituir la fuente por un resumen;
- ocultar que parte del asunto no está disponible;
- ampliar autorización.

Cuando exista una referencia sin contenido recuperable, Ping debe distinguir “referencia conocida” de “recurso disponible”.

Al volver la conexión, nuevos resultados o contexto actualizado no convierten en falso que antes existía una vista limitada. Expresan un conocimiento posterior.

---

## 15. Files & Attachments

Un archivo puede encontrarse conceptualmente:

- disponible localmente;
- disponible sólo como referencia;
- pendiente de asociación;
- pendiente de confirmación;
- no disponible;
- posiblemente desactualizado;
- con vigencia desconocida.

Una referencia local no garantiza que el contenido pueda recuperarse.

### Asociación local

Asociar un archivo localmente registra una intención. El archivo no debe mostrarse como cargado, compartido ni accesible para otras personas hasta obtener confirmación.

### Eliminación local

Una intención local de eliminar no equivale a eliminación confirmada.

Ping debe conservar claridad sobre:

- qué quiso eliminar el usuario;
- qué sigue visible localmente;
- si el recurso propietario continúa existiendo;
- si la acción fue aceptada;
- qué referencias históricas pueden conservarse autorizadamente.

### Propiedad y autorización

La disponibilidad local:

- no cambia el propietario conceptual;
- no amplía permisos;
- no convierte el archivo en recurso independiente;
- no permite asociarlo a otro asunto sin confirmación;
- no sustituye su fuente.

La interpretación de IA de un archivo local también queda sujeta a procedencia, autorización y estado de confirmación.

---

## 16. Conflictos conceptuales

Existe un conflicto conceptual cuando dos estados, decisiones o intenciones relevantes no pueden aplicarse conjuntamente sin perder significado, autorización o historia.

Ejemplos:

- el mismo compromiso cambió local y remotamente;
- existe un mensaje pendiente para una conversación que cambió;
- una persona perdió acceso mientras tenía una acción local;
- un archivo fue eliminado o reemplazado;
- el recurso propietario dejó de existir;
- una acción depende de un estado que ya no está vigente;
- dos dispositivos expresaron decisiones diferentes;
- una resolución local contradice un avance remoto posterior;
- una identidad fue corregida antes de confirmar una referencia local.

Ante un conflicto, Ping debe:

- hacerlo visible;
- conservar la intención relevante;
- identificar recursos y procedencia;
- no elegir silenciosamente una verdad definitiva;
- separar los hechos confirmados de las propuestas;
- explicar qué parte requiere revisión;
- solicitar una decisión humana cuando corresponda;
- distinguir un resultado automático permitido de una decisión del usuario.

Un conflicto no significa necesariamente error ni pérdida. Significa que la continuidad requiere comprender una diferencia antes de afirmar un resultado definitivo.

Este documento no define prioridades, combinación automática, descarte, merge ni otra estrategia técnica de resolución.

---

## 17. Recuperación de conexión

Cuando Ping reconoce que puede recuperar comunicación, el ciclo funcional es:

1. **Reconocer comunicación posible.** No asumir todavía que cada servicio u operación está disponible.
2. **Revisar acciones pendientes.** Identificar intenciones, intentos y resultados desconocidos.
3. **Validar autorización y contexto.** Comprobar si la acción sigue permitida y conserva sentido.
4. **Intentar confirmar acciones.** Presentar cada acción aplicable al sistema autorizado.
5. **Informar resultados.** Distinguir aceptadas, rechazadas, todavía pendientes y desconocidas.
6. **Exponer conflictos.** Mostrar diferencias que requieran revisión o decisión.
7. **Actualizar información local.** Incorporar información confirmada sin ocultar cambios relevantes.
8. **Conservar trazabilidad.** Permitir comprender qué se intentó, qué ocurrió y qué decisión quedó vigente.

Recuperar conexión no implica:

- aceptar todas las acciones pendientes;
- conservar autorizaciones anteriores;
- resolver conflictos automáticamente;
- asegurar que toda información quede actualizada;
- repetir acciones de resultado desconocido;
- reescribir la cronología.

La definición del orden, los reintentos, duplicados y resolución técnica pertenece a Synchronization y permanece pendiente.

---

## 18. Estados visibles para el usuario

Ping debe utilizar un vocabulario funcional, sobrio y consistente.

### Guardado en este dispositivo

La intención o contenido existe localmente. No afirma envío ni confirmación.

### Pendiente de envío

Ping conserva una acción que todavía no pudo presentar para confirmación.

### Enviando

Ping está intentando obtener un resultado. No afirma aceptación.

### Confirmado

La acción fue aceptada por el sistema autorizado.

### No se pudo confirmar

La acción fue rechazada o no puede completarse en las condiciones conocidas. Cuando sea relevante, Ping debe distinguir rechazo de resultado desconocido.

### Resultado desconocido

Ping no puede saber si la acción fue recibida o aplicada.

### Requiere revisión

Existe un conflicto, cambio de contexto o decisión que necesita intervención.

### Información posiblemente desactualizada

El contenido visible puede no representar el estado más reciente.

### Disponible al recuperar conexión

La capacidad o contenido necesita comunicación antes de poder utilizarse.

Los mensajes no deben exponer códigos, protocolos, infraestructura ni diagnósticos técnicos. Deben ayudar al usuario a comprender qué sabe Ping, qué ocurrió y qué puede hacer.

---

## 19. Casos límite

### La aplicación se cierra con acciones pendientes

La intención no debe presentarse después como confirmada ni desaparecer silenciosamente. Al volver, el usuario debe reconocer su estado.

### El dispositivo pierde conexión durante una acción

Ping debe distinguir si la acción quedó pendiente, fue enviada o tiene resultado desconocido.

### El usuario repite una acción porque no vio confirmación

Ping debe evitar afirmar dos resultados sin evidencia. Si no puede determinar qué ocurrió, debe exponer la incertidumbre antes de producir consecuencias duplicadas.

### La autorización cambia durante la desconexión

Las acciones afectadas pueden ser rechazadas. La información local no preserva el permiso anterior indefinidamente.

### El recurso propietario es eliminado

Una acción pendiente sobre ese recurso puede dejar de tener sentido. Ping debe conservar la intención y explicar por qué no puede confirmarse.

### La conversación cambia mientras existe un mensaje pendiente

El mensaje no adquiere automáticamente una posición definitiva. Puede requerir revisión si el nuevo contexto altera su significado.

### Dos dispositivos realizan acciones diferentes

Ninguno debe asumirse silenciosamente como verdad exclusiva. Los hechos confirmados, momentos e intenciones deben poder distinguirse.

### Una acción pendiente deja de tener sentido

Ping debe permitir reconocerla como obsoleta, rechazada o necesitada de revisión, sin fingir que fue realizada.

### Un archivo local ya no puede asociarse

La existencia local del archivo no crea una asociación. Debe mostrarse el fracaso o conflicto sin afirmar que fue compartido.

### La IA utilizó contexto que luego cambió

La salida derivada conserva la procedencia y la condición del contexto utilizado. No debe presentarse como explicación vigente sin revisión.

### Vuelve la conexión, pero el servicio sigue sin responder

Ping puede estar conectado y aun así mantener acciones pendientes o resultados desconocidos.

### No puede determinarse si una acción fue recibida

La acción queda con resultado desconocido. No debe repetirse ni darse por completada sólo para simplificar la interfaz.

---

## 20. Reglas e invariantes

1. Una intención local no equivale a un hecho confirmado.
2. Una acción enviada no equivale a una acción aceptada.
3. Estar conectado no garantiza éxito.
4. Estar sin conexión no elimina la intención del usuario.
5. La información local no amplía autorización.
6. La disponibilidad anterior no garantiza acceso futuro.
7. Visible no significa vigente.
8. Local no significa confirmado.
9. La incertidumbre debe ser visible.
10. Una acción rechazada no debe ocultarse.
11. Un resultado desconocido no debe convertirse silenciosamente en éxito o fracaso.
12. Los conflictos no deben resolverse silenciosamente.
13. La intención relevante debe conservarse ante un conflicto.
14. La IA no debe afirmar confirmaciones inexistentes.
15. La IA no convierte contexto local o desactualizado en verdad.
16. Memory no consolida una acción pendiente como hecho definitivo.
17. Una propuesta local de compromiso no crea un compromiso confirmado.
18. Un avance local no equivale a resolución.
19. Un mensaje local no se considera recibido.
20. Una asociación local no convierte un archivo en cargado o compartido.
21. Una eliminación local no equivale a eliminación confirmada.
22. La ausencia de resultados sin conexión no prueba inexistencia.
23. Retrieval no inventa contenido que no está disponible.
24. Recuperar conexión no autoriza automáticamente todas las acciones pendientes.
25. Una revocación conocida debe limitar los accesos futuros aplicables.
26. No toda interacción local es un evento de dominio.
27. Una notificación no prueba la ejecución de una acción.
28. Offline First no reemplaza las fuentes originales.
29. Offline First no reescribe la historia.
30. La continuidad del usuario no debe depender de fingir consistencia.

---

## 21. Escenarios de validación

### Escenario 1: mensaje redactado sin conexión

- **Intención:** el usuario quiere responder dentro de una conversación.
- **Conectividad:** sin conexión.
- **Información disponible:** conversación previamente disponible, posiblemente desactualizada.
- **Acción permitida:** redactar y conservar el mensaje localmente.
- **Estado visible:** “Pendiente de envío”.
- **Al recuperar conexión:** Ping valida conversación, autorización y contexto antes de intentar confirmarlo.
- **Posible resultado:** confirmado, rechazado, resultado desconocido o requiere revisión si la conversación cambió.

### Escenario 2: resolución local de un compromiso

- **Intención:** el usuario quiere registrar que el asunto terminó y explicar el resultado.
- **Conectividad:** inestable.
- **Información disponible:** compromiso abierto según la última información conocida.
- **Acción permitida:** conservar una propuesta de resolución y su resultado.
- **Estado visible:** “Guardado en este dispositivo. Pendiente de confirmación”.
- **Al recuperar conexión:** Ping valida estado, responsable y autorización.
- **Posible resultado:** confirmación; rechazo porque el compromiso cambió; conflicto que requiere revisión.

### Escenario 3: consulta por persona

- **Intención:** el usuario quiere recordar asuntos relacionados con una persona.
- **Conectividad:** sin conexión.
- **Información disponible:** identidad y contexto previamente autorizados.
- **Acción permitida:** Search local y Retrieval del contexto disponible.
- **Estado visible:** “Resultados disponibles en este dispositivo; pueden estar incompletos”.
- **Al recuperar conexión:** Ping puede actualizar identidad, autorización y resultados.
- **Posible resultado:** aparecen nuevos asuntos, cambia una relación o parte del contenido deja de estar autorizada.

### Escenario 4: Memory recupera contexto local

- **Intención:** comprender por qué existe un compromiso.
- **Conectividad:** estado desconocido.
- **Información disponible:** mensaje de origen, resumen derivado y avance pendiente.
- **Acción permitida:** mostrar la fuente disponible y distinguir el avance pendiente.
- **Estado visible:** “Información posiblemente desactualizada”.
- **Al recuperar conexión:** se valida si hubo nuevos mensajes, avances o cambios de acceso.
- **Posible resultado:** el recuerdo se contextualiza con hechos confirmados; el avance local sigue pendiente o es rechazado.

### Escenario 5: ayuda de IA con contexto desactualizado

- **Intención:** el usuario pide explicar un asunto.
- **Conectividad:** sin conexión.
- **Información disponible:** contexto local autorizado cuya vigencia no puede determinarse.
- **Acción permitida:** sólo si la capacidad de IA está disponible y declara los límites del contexto.
- **Estado visible:** “Explicación basada en información disponible en este dispositivo”.
- **Al recuperar conexión:** las fuentes pueden actualizarse y la explicación requerir revisión.
- **Posible resultado:** la salida continúa como información derivada; nunca confirma acciones ni hechos nuevos.

### Escenario 6: autorización revocada durante la desconexión

- **Intención:** el usuario intenta añadir una nota a un recurso compartido.
- **Conectividad:** sin conexión.
- **Información disponible:** el recurso era visible antes de desconectarse.
- **Acción permitida:** conservar la intención sólo si el producto admite esa preparación, con autorización incierta.
- **Estado visible:** “Pendiente de confirmación”.
- **Al recuperar conexión:** Ping conoce la revocación y aplica el nuevo alcance.
- **Posible resultado:** acción rechazada; cesa el acceso futuro; la intención no se presenta como aplicada.

### Escenario 7: archivo asociado localmente

- **Intención:** aportar evidencia a un compromiso.
- **Conectividad:** conexión inestable.
- **Información disponible:** compromiso conocido y archivo disponible localmente.
- **Acción permitida:** preparar la asociación.
- **Estado visible:** “Pendiente de envío”; nunca “Compartido”.
- **Al recuperar conexión:** Ping valida propietario, compromiso y autorización.
- **Posible resultado:** asociación confirmada, rechazada o necesitada de revisión porque el compromiso fue eliminado o cambió.

### Escenario 8: búsqueda sin resultados

- **Intención:** localizar una conversación anterior.
- **Conectividad:** sin conexión.
- **Información disponible:** sólo una parte de las conversaciones autorizadas.
- **Acción permitida:** buscar en el alcance local.
- **Estado visible:** “No hay resultados entre la información disponible en este dispositivo”.
- **Al recuperar conexión:** Search puede ampliar el alcance autorizado consultable.
- **Posible resultado:** aparece la conversación; la ausencia anterior nunca se trató como inexistencia.

### Escenario 9: acción distinta en dos dispositivos

- **Intención:** resolver un compromiso desde un dispositivo y registrar un avance desde otro.
- **Conectividad:** ambos trabajan temporalmente sin conexión.
- **Información disponible:** el mismo estado confirmado anterior.
- **Acción permitida:** conservar cada intención con procedencia y momento.
- **Estado visible:** cada dispositivo muestra su acción como pendiente.
- **Al recuperar conexión:** Ping identifica que las intenciones dependen del mismo estado anterior.
- **Posible resultado:** una o ambas requieren revisión; ninguna se impone silenciosamente.

### Escenario 10: servicio no disponible pese a existir conexión

- **Intención:** enviar un mensaje pendiente.
- **Conectividad:** conectado.
- **Información disponible:** mensaje local y conversación conocida.
- **Acción permitida:** intentar obtener confirmación.
- **Estado visible:** “Enviando” y luego “Pendiente de envío” o “Resultado desconocido”, según lo conocido.
- **Al recuperar comunicación funcional:** Ping revisa la acción sin asumir que la conectividad anterior produjo éxito.
- **Posible resultado:** confirmación, rechazo o revisión por cambio de contexto.

---

## 22. Criterios de aceptación

El modelo conceptual de Offline First se considera correctamente definido cuando:

1. Offline First queda descrito como comportamiento funcional y no como solución técnica.
2. Se distinguen conectividad y resultado funcional.
3. Se distinguen intención registrada, pendiente, enviada, aceptada, rechazada y resultado desconocido.
4. Una acción local nunca se presenta automáticamente como hecho confirmado.
5. La información local puede reconocerse como potencialmente desactualizada.
6. Las limitaciones de cada capacidad son visibles y comprensibles.
7. La disponibilidad local no amplía permisos.
8. Los cambios de autorización pueden producir rechazos posteriores.
9. Conversation diferencia redacción, envío pendiente y mensaje confirmado.
10. Commitment protege las transiciones sensibles hasta obtener confirmación.
11. People no completa ni fusiona identidades por inferencia local.
12. Memory no consolida información pendiente como hecho definitivo.
13. La IA distingue contexto confirmado, local, derivado y potencialmente desactualizado.
14. Events diferencia intención, intento, hecho, rechazo y reconciliación.
15. Notifications no se utiliza como prueba de ejecución.
16. Search reconoce que sus resultados sin conexión pueden ser incompletos.
17. Retrieval no finge acceso a recursos ausentes.
18. Files distingue disponibilidad local, referencia, asociación pendiente y confirmación.
19. Los rechazos, resultados desconocidos y conflictos no se ocultan.
20. La recuperación de conexión valida autorización y contexto antes de confirmar acciones.
21. El documento no define mecanismos de sincronización ni resolución técnica de conflictos.
22. No se introducen almacenamiento, infraestructura, protocolos, proveedores o frameworks.
23. Se mantiene coherencia con la visión, el MVP y los modelos conceptuales de los documentos 00 al 13.

---

## 23. Decisiones pendientes

Las siguientes decisiones permanecen abiertas y no deben asumirse:

1. Definir qué capacidades exactas estarán habilitadas sin conexión durante la primera beta.
2. Definir qué acciones sólo podrán prepararse y cuáles podrán intentar confirmarse bajo conexión inestable.
3. Definir qué acciones requieren confirmación inmediata y, por tanto, no estarán disponibles sin conexión.
4. Definir qué recursos estarán disponibles localmente.
5. Definir cuánto contexto de Conversation estará disponible localmente.
6. Definir qué información de Commitment puede prepararse localmente.
7. Definir qué información de People puede conservarse y durante cuánto tiempo.
8. Definir qué recuerdos puede recuperar Memory sin conexión.
9. Definir si alguna capacidad de IA estará disponible sin conexión.
10. Definir cómo se presenta la vigencia del contexto utilizado por IA.
11. Definir el tiempo de conservación local de información e intenciones.
12. Definir la cantidad máxima de acciones pendientes.
13. Definir el comportamiento funcional cuando existen acciones desde varios dispositivos.
14. Definir la política de reintentos.
15. Definir el orden de procesamiento de acciones pendientes.
16. Definir el tratamiento de posibles duplicados.
17. Definir las reglas de resolución de conflictos.
18. Definir qué conflictos requieren siempre decisión explícita del usuario.
19. Definir qué resultados automáticos, si alguno, pueden aplicarse sin intervención.
20. Definir el tratamiento local de revocaciones y eliminaciones cuando pasan a ser conocidas.
21. Definir qué contenido debe dejar de estar visible después de una revocación.
22. Definir la disponibilidad local de archivos y referencias.
23. Definir los límites para preparar asociaciones o eliminaciones de archivos.
24. Definir la recuperación de acciones después de cierres inesperados.
25. Definir cómo se trata una acción cuyo resultado continúa desconocido.
26. Definir cuándo una acción pendiente se considera obsoleta.
27. Definir el vocabulario final y los estados visibles de la primera beta.
28. Definir qué cambios de estado justifican una notificación.
29. Definir cuánto contexto debe mostrarse para que un rechazo sea comprensible sin exponer información no autorizada.
30. Definir en el documento 15 los conceptos de Synchronization sin convertir estas decisiones en implementación prematura.

Hasta resolver estas decisiones, Ping no debe asumir silenciosamente disponibilidad, vigencia, autorización, reintentos, orden, duplicados ni resolución de conflictos.

---

## 24. Resumen

Offline First permite que Ping siga siendo útil cuando la comunicación no existe, es inestable o no ofrece un resultado concluyente.

Su responsabilidad funcional es proteger la intención del usuario y conservar claridad:

- lo local no es necesariamente vigente;
- lo visible no es necesariamente confirmado;
- lo enviado no es necesariamente aceptado;
- lo conocido anteriormente no está autorizado indefinidamente;
- lo pendiente no es un hecho;
- la ausencia de resultados no prueba inexistencia;
- recuperar conexión no garantiza aceptación.

Conversation puede conservar redacción y mensajes pendientes. Commitment puede conservar propuestas y avances sin confirmar transiciones sensibles. People mantiene identidad y relaciones dentro de la autorización conocida. Memory recupera contexto sin consolidar pendientes como hechos. La IA reconoce procedencia e incertidumbre. Search y Retrieval declaran sus límites. Files distingue disponibilidad local de asociación confirmada.

Cuando vuelve la conexión, Ping revisa las acciones pendientes, valida autorización y contexto, intenta obtener confirmación, informa resultados y expone conflictos. No oculta rechazos, no inventa consistencia y no reescribe la historia.

Offline First define continuidad funcional. Synchronization definirá posteriormente cómo se relacionan conceptualmente los cambios entre ubicaciones, sin que ninguno de estos documentos determine todavía una implementación técnica.
