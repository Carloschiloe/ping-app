# Ping — Synchronization

## 1. Propósito

Este documento define el significado conceptual y funcional de Synchronization dentro de Ping.

Synchronization permite relacionar cambios realizados en distintos momentos, dispositivos o estados de conectividad sin perder:

- la intención del usuario;
- los hechos ya confirmados;
- el orden y las dependencias relevantes;
- la autorización aplicable;
- la procedencia;
- el contexto necesario para comprender el asunto;
- la visibilidad de rechazos, incertidumbre y conflictos.

Su propósito no es hacer que todas las representaciones sean idénticas de manera instantánea. Su propósito es que Ping pueda explicar qué cambios conoce, cuáles fueron aceptados, cuáles siguen pendientes, cuáles no pueden aplicarse y cómo se relacionan entre sí.

Synchronization es una capacidad transversal. Conversation, Commitment, People y Memory conservan la propiedad conceptual de su información.

Este documento no define mecanismos técnicos, almacenamiento, transporte, algoritmos ni arquitectura.

---

## 2. Alcance y frontera con Offline First

Offline First y Synchronization se relacionan, pero resuelven preguntas diferentes.

### Offline First

Offline First define cómo Ping sigue siendo útil cuando:

- no existe conexión;
- la conexión es inestable;
- el resultado de una acción no puede conocerse;
- sólo existe información local;
- el usuario necesita conservar una intención.

Su responsabilidad principal es mantener continuidad y claridad sin fingir confirmaciones.

### Synchronization

Synchronization define cómo Ping relaciona:

- intenciones locales;
- acciones pendientes;
- acciones presentadas;
- hechos confirmados;
- cambios ocurridos en otros dispositivos;
- información recibida posteriormente;
- rechazos;
- resultados desconocidos;
- conflictos;
- correcciones y reconciliaciones.

Su responsabilidad principal es determinar el significado conjunto de los cambios sin reescribir la historia.

### Frontera técnica

La arquitectura futura decidirá:

- cómo se conservan y transportan cambios;
- cómo se detecta disponibilidad;
- cómo se solicitan y reciben actualizaciones;
- cómo se identifican repeticiones;
- cómo se coordinan dispositivos;
- cómo se materializan estados;
- cómo se implementan las decisiones conceptuales.

Nada de ello se define aquí.

---

## 3. Qué es Synchronization

Synchronization es el proceso conceptual mediante el cual Ping:

1. reconoce cambios conocidos en distintos contextos;
2. conserva su procedencia y estado;
3. identifica relaciones de orden y dependencia;
4. valida si una intención todavía puede aplicarse;
5. distingue recepción de aceptación;
6. evita representar una misma acción como varios hechos;
7. detecta diferencias incompatibles;
8. obtiene o reconoce decisiones autorizadas;
9. actualiza la representación disponible;
10. conserva trazabilidad de lo ocurrido.

Synchronization puede producir como resultado:

- una acción confirmada;
- una acción todavía pendiente;
- una acción rechazada;
- un resultado desconocido;
- información actualizada;
- un conflicto que requiere revisión;
- una intención que dejó de ser aplicable;
- una reconciliación comprensible.

Sincronizar no significa que todo cambio deba aceptarse. También puede significar descubrir que una acción no puede aplicarse.

---

## 4. Qué no es Synchronization

Synchronization no es:

- una garantía de disponibilidad;
- una promesa de actualización instantánea;
- una autorización;
- una fuente de verdad independiente;
- una forma de reemplazar las fuentes originales;
- una decisión automática sobre conflictos;
- una fusión indiscriminada de cambios;
- una repetición ciega de acciones;
- un historial de cada detalle operativo;
- una técnica concreta de almacenamiento o comunicación;
- una justificación para ocultar incertidumbre.

Synchronization nunca debe:

- convertir recepción en aceptación;
- presentar una intención local como hecho confirmado;
- aplicar acciones con autorización vencida;
- crear duplicados para simplificar la reconciliación;
- descartar silenciosamente una intención;
- reemplazar un hecho confirmado con información menos confiable;
- ordenar hechos sólo por conveniencia visual;
- transformar una inferencia de IA en decisión;
- resolver un conflicto importante sin hacerlo visible.

---

## 5. Cambio sincronizable

Un cambio sincronizable es una intención, decisión o hecho cuya relación con otras representaciones necesita ser reconocida por Ping.

Puede referirse a:

- un mensaje;
- una propuesta o evolución de un compromiso;
- una referencia a una persona;
- un recuerdo relevante;
- una decisión de autorización;
- un archivo o adjunto;
- una corrección;
- una eliminación conceptual;
- un resultado;
- una acción que no pudo confirmarse.

Un cambio sincronizable debe poder comprenderse mediante:

- quién lo originó;
- qué quiso hacer;
- sobre qué recurso;
- desde qué contexto;
- cuándo fue expresado o confirmado;
- de qué información dependía;
- qué estado de confirmación posee;
- qué autorización era necesaria;
- qué resultado se conoce;
- qué otros cambios lo afectan.

No toda interacción de interfaz constituye un cambio sincronizable. Escribir una letra, abrir una vista o repetir una consulta no son por sí mismos cambios del negocio.

---

## 6. Estados conceptuales de una acción

Synchronization utiliza estados funcionales que describen qué sabe Ping sobre una acción.

### Intención registrada

Ping conservó lo que el usuario quiso hacer.

No existe todavía confirmación de que la acción haya sido presentada, recibida ni aceptada.

### Pendiente

La intención espera una oportunidad o condición necesaria para ser validada.

Puede depender de:

- comunicación suficiente;
- autorización vigente;
- información actual;
- confirmación del usuario;
- existencia del recurso;
- resolución de otra acción previa.

### Presentada

Ping intentó someter la acción al sistema autorizado.

Presentada no significa recibida ni aceptada.

### Recibida

Existe reconocimiento de que la acción llegó al ámbito capaz de evaluarla.

Recibida no significa:

- autorizada;
- válida;
- aplicada;
- visible para otras personas;
- confirmada como hecho.

### Aceptada

La acción fue validada y produjo el cambio confirmado correspondiente.

Sólo una acción aceptada puede presentarse como confirmada.

### Rechazada

La acción fue evaluada y no pudo aplicarse.

El rechazo debe conservar:

- la intención original;
- el recurso afectado;
- la razón funcional conocida;
- el contexto suficiente;
- el hecho de que no produjo el cambio solicitado.

### Resultado desconocido

Ping no puede determinar si la acción fue recibida, aceptada o rechazada.

No debe repetirse automáticamente como si nada hubiera ocurrido ni marcarse como sincronizada.

### Reconciliada

Ping conoce la relación final entre la intención y los hechos confirmados.

Una reconciliación puede concluir que la acción:

- fue aceptada;
- fue rechazada;
- ya estaba representada por un hecho confirmado;
- dejó de ser aplicable;
- fue reemplazada por una decisión explícita;
- permanece en conflicto.

Reconciliada no equivale necesariamente a aceptada.

---

## 7. Estado de sincronización de la información

Además del estado de una acción, Ping debe expresar el estado de la información disponible.

### Confirmada y vigente según el conocimiento disponible

Ping posee una representación confirmada y no conoce cambios posteriores que la invaliden.

Esto no garantiza vigencia indefinida.

### Confirmada, con actualización pendiente

La información fue confirmada anteriormente, pero Ping sabe que necesita revisar cambios posteriores.

### Local no confirmada

La información expresa una intención o modificación que todavía no produjo un hecho confirmado.

### Potencialmente desactualizada

Ping no puede asegurar que la representación incluya los cambios más recientes.

### En conflicto

Existen diferencias relevantes que no pueden presentarse como un único estado definitivo sin una decisión o regla autorizada.

### Vigencia desconocida

Ping carece de elementos suficientes para afirmar si la información sigue representando el estado aplicable.

El estado de sincronización siempre tiene alcance. Una conversación puede estar actualizada hasta cierto momento mientras un mensaje sigue con resultado desconocido.

---

## 8. Identidad y procedencia de los cambios

Para relacionar cambios sin duplicarlos ni confundirlos, Ping necesita reconocer conceptualmente su identidad y procedencia.

La identidad de un cambio permite afirmar que dos representaciones corresponden a la misma intención o al mismo hecho.

La procedencia permite comprender:

- quién originó el cambio;
- en qué recurso surgió;
- desde qué conversación, compromiso, persona o archivo;
- en qué momento fue expresado;
- bajo qué contexto;
- si era una propuesta, decisión, acción o hecho;
- qué confirmación recibió.

Dos cambios parecidos no deben tratarse automáticamente como el mismo.

Dos representaciones del mismo cambio no deben convertirse en dos mensajes, compromisos, eventos o resultados.

La identidad conceptual no depende de cómo se implemente técnicamente. La arquitectura futura decidirá cómo representarla.

---

## 9. Orden

El orden permite comprender la secuencia relevante de intenciones, decisiones y hechos.

Ping debe distinguir:

### Momento de intención

Cuándo el usuario expresó lo que quería hacer.

### Momento de presentación

Cuándo Ping intentó someter la acción a confirmación.

### Momento de recepción

Cuándo se reconoció que la acción fue recibida para evaluación.

### Momento de confirmación

Cuándo la acción fue aceptada o rechazada.

### Momento de conocimiento

Cuándo un dispositivo o representación conoció el resultado.

Estos momentos pueden ser diferentes.

El orden de visualización no debe reescribir el orden conceptual. Un mensaje redactado antes puede confirmarse después de otro. Una resolución preparada localmente puede quedar invalidada por un cambio confirmado anterior que el dispositivo todavía no conocía.

Cuando el orden no puede determinarse, Ping debe expresar la incertidumbre o limitar la conclusión. No debe inventar una cronología definitiva.

---

## 10. Causalidad y dependencias

La causalidad expresa que un cambio depende del conocimiento, decisión o resultado de otro.

Ejemplos:

- una respuesta depende de una conversación existente;
- un avance depende de un compromiso confirmado;
- una resolución depende del estado vigente del compromiso;
- una reasignación depende de una persona y una autorización aplicables;
- un adjunto depende de un recurso propietario;
- una corrección depende de la información que corrige;
- una revocación afecta acciones futuras dentro de su alcance.

Ping debe conservar las dependencias relevantes para evitar:

- aplicar una acción sobre un recurso eliminado;
- confirmar un cambio basado en un estado que ya no existe;
- asociar un archivo a un compromiso rechazado;
- resolver un asunto que ya fue cancelado o modificado;
- presentar una respuesta fuera de contexto;
- aplicar acciones posteriores cuando una acción previa fue rechazada.

Orden y causalidad no son equivalentes. Que un cambio ocurra después no demuestra que dependa de otro.

Cuando una dependencia no puede satisfacerse, la acción debe quedar rechazada, no aplicable o necesitada de revisión, según el significado del dominio.

---

## 11. Duplicados

Existe un posible duplicado cuando más de una representación puede corresponder a la misma intención o al mismo hecho.

Puede surgir cuando:

- el usuario repite una acción porque no vio confirmación;
- una acción con resultado desconocido vuelve a presentarse;
- varios dispositivos muestran la misma intención;
- una actualización se conoce por caminos diferentes;
- una representación local encuentra posteriormente su hecho confirmado;
- dos propuestas parecidas fueron creadas de manera independiente.

Ping debe distinguir:

### Misma acción representada varias veces

Debe reconciliarse como una sola acción y un solo resultado.

### Acciones diferentes con contenido parecido

No deben fusionarse automáticamente. Pueden expresar intenciones independientes.

### Duplicado ambiguo

Ping no cuenta con evidencia suficiente para decidir si se trata de la misma acción.

Debe conservar la ambigüedad y solicitar revisión cuando una fusión o repetición afectaría el significado.

Evitar duplicados no autoriza a borrar historia. Ping puede conservar que existieron varios intentos sin crear varios hechos de negocio.

---

## 12. Resultado desconocido

Un resultado es desconocido cuando Ping no puede afirmar si una acción:

- fue recibida;
- fue evaluada;
- fue aceptada;
- fue rechazada;
- produjo parcialmente algún efecto relevante.

El resultado desconocido requiere especial cuidado porque:

- repetir puede producir duplicados;
- descartar puede perder una intención;
- asumir éxito puede falsificar el estado;
- asumir fracaso puede llevar al usuario a repetir una acción válida.

Ping debe:

- mantener visible la incertidumbre;
- conservar intención y procedencia;
- buscar una reconciliación antes de repetir consecuencias importantes;
- distinguir el intento del hecho;
- permitir intervención cuando no exista una conclusión segura;
- no mostrar el recurso como sincronizado.

Un resultado desconocido puede resolverse posteriormente mediante:

- conocimiento de la aceptación;
- conocimiento del rechazo;
- reconocimiento del hecho ya existente;
- confirmación de que la acción nunca pudo aplicarse;
- decisión explícita del usuario ante una ambigüedad.

---

## 13. Conflictos conceptuales

Existe un conflicto conceptual cuando cambios relevantes no pueden coexistir o aplicarse conjuntamente sin alterar intención, autorización, contexto o historia.

### Conflicto de estado

Una acción depende de un estado anterior que ya cambió.

### Conflicto de contenido

Dos cambios afectan de manera incompatible la misma información relevante.

### Conflicto de decisión

Dos decisiones confirmadas o pendientes expresan resultados incompatibles.

### Conflicto de autorización

Una acción fue preparada bajo un acceso que ya no está vigente.

### Conflicto de identidad

No puede determinarse si dos referencias representan la misma persona, acción o recurso.

### Conflicto de dependencia

Una acción requiere otra que fue rechazada, eliminada o no confirmada.

### Conflicto de temporalidad

El orden conocido no permite determinar qué decisión debe considerarse aplicable.

Ante un conflicto, Ping debe:

- identificar las versiones o intenciones involucradas;
- conservar su procedencia;
- mostrar qué diferencia importa;
- separar hechos confirmados de propuestas;
- no elegir silenciosamente;
- aplicar únicamente reglas de negocio ya autorizadas;
- solicitar una decisión cuando el significado no pueda preservarse automáticamente;
- conservar el resultado de la reconciliación.

No toda diferencia es un conflicto. Dos cambios independientes pueden coexistir si no alteran mutuamente su significado.

---

## 14. Reconciliación

Reconciliar significa establecer una relación comprensible entre intenciones, acciones y hechos conocidos.

La reconciliación conceptual debe:

1. reunir los cambios relevantes conocidos;
2. distinguir sus estados de confirmación;
3. reconocer procedencia e identidad;
4. establecer orden cuando sea posible;
5. reconocer dependencias;
6. validar autorización vigente;
7. identificar repeticiones;
8. detectar conflictos;
9. aplicar reglas de negocio permitidas;
10. exponer decisiones necesarias;
11. producir un resultado comprensible;
12. conservar trazabilidad.

Una reconciliación puede:

- vincular una intención local con su hecho confirmado;
- reconocer que una acción fue rechazada;
- concluir que una repetición no genera un hecho adicional;
- mantener una acción con resultado desconocido;
- declarar una intención no aplicable;
- incorporar un cambio remoto;
- solicitar al usuario resolver un conflicto;
- conservar dos cambios independientes.

La reconciliación nunca reemplaza la fuente ni reescribe lo que ya ocurrió.

---

## 15. Múltiples dispositivos

Una misma persona puede expresar intenciones o conocer información desde distintos dispositivos.

Cada dispositivo puede tener:

- distinta última información conocida;
- acciones locales diferentes;
- resultados todavía no recibidos;
- autorizaciones que aún no pudo actualizar;
- archivos disponibles distintos;
- conflictos visibles en momentos diferentes.

Ping no debe asumir que:

- el dispositivo más reciente posee siempre la verdad;
- el último cambio conocido reemplaza automáticamente los anteriores;
- dos acciones parecidas son duplicados;
- una acción aceptada en un dispositivo ya es conocida en todos;
- una autorización anterior sigue vigente en un dispositivo desconectado.

Cuando dos dispositivos producen cambios:

- cada intención conserva su procedencia;
- los hechos confirmados no deben duplicarse;
- el orden debe basarse en momentos conceptualmente relevantes;
- las dependencias deben validarse;
- los conflictos importantes deben hacerse visibles;
- el resultado debe poder comprenderse desde cualquier representación posteriormente actualizada.

La política exacta para varios dispositivos es una decisión pendiente.

---

## 16. Authorization

Synchronization nunca concede permisos.

Antes de aceptar una acción pendiente, Ping debe considerar:

- quién la originó;
- qué recurso afecta;
- qué acción solicita;
- qué autorización está vigente;
- si el alcance cambió;
- si el recurso sigue compartido;
- si una revocación afecta la acción;
- si la información necesaria puede consultarse.

Una acción preparada mientras existía acceso puede ser rechazada si la autorización dejó de estar vigente antes de su aceptación.

Ping no debe:

- aplicar acciones sólo porque fueron válidas localmente;
- conservar acceso futuro por haber tenido una copia;
- usar Synchronization para ampliar el contexto visible;
- revelar un conflicto mediante información no autorizada;
- restaurar permisos al reencontrar un recurso;
- interpretar la recepción como autorización.

La revocación:

- limita accesos futuros cuando pasa a ser conocida y aplicable;
- puede impedir acciones pendientes;
- no convierte en inexistentes los hechos ocurridos cuando el acceso era válido;
- no exige exponer contenido para explicar un rechazo.

---

## 17. Relación con Conversation

Conversation conserva conversaciones, participantes, mensajes y procedencia.

Synchronization ayuda a relacionar:

- mensajes redactados localmente;
- mensajes pendientes;
- mensajes recibidos para evaluación;
- mensajes confirmados;
- cambios conocidos desde otros dispositivos;
- correcciones autorizadas;
- cambios de participación;
- archivos asociados.

Un mensaje debe conservar:

- conversación prevista;
- autor;
- momento de intención;
- estado de confirmación;
- procedencia;
- relación con su representación confirmada;
- cualquier conflicto relevante.

Ping no debe:

- mostrar un mensaje recibido como aceptado sin confirmación;
- insertar silenciosamente un mensaje en una conversación incompatible;
- crear dos mensajes desde la misma acción;
- convertir una redacción local en evento conversacional confirmado;
- asumir que una conversación no cambió;
- crear compromisos automáticamente al sincronizar mensajes.

El orden visible puede actualizarse cuando se conocen nuevos hechos, pero la intención y temporalidad relevantes deben conservarse.

---

## 18. Relación con Commitment

Commitment conserva el ciclo de vida de cada compromiso confirmado.

Synchronization ayuda a relacionar:

- propuestas de creación;
- confirmaciones;
- cambios de responsable;
- seguimientos;
- avances;
- cambios temporales;
- resoluciones;
- cancelaciones permitidas;
- rechazos;
- resultados.

Las transiciones sensibles sólo se consideran aplicadas cuando:

- el compromiso existe;
- la acción sigue siendo válida;
- la autorización está vigente;
- las dependencias se cumplen;
- el dominio acepta el cambio.

Un avance pendiente no equivale a avance confirmado.

Una resolución local:

- no cierra el compromiso por sí sola;
- conserva el resultado propuesto;
- puede entrar en conflicto con cambios posteriores;
- debe rechazarse o revisarse si el estado ya no permite aplicarla.

Synchronization no convierte Commitment en una lista de estados. Su objetivo es conservar contexto, responsable, evolución y resolución comprensible.

---

## 19. Relación con People, Memory e IA

### People

People conserva identidad y relaciones desde la perspectiva autorizada del usuario.

Synchronization puede relacionar:

- referencias locales;
- correcciones confirmadas;
- cambios de relación;
- participaciones;
- responsables;
- identidades incompletas.

No debe fusionar personas porque sus representaciones coincidan ni completar identidades mediante inferencia.

### Memory

Memory conserva únicamente lo relevante para recordar y recuperar con contexto.

Synchronization puede informar que:

- un hecho fue confirmado;
- una acción fue rechazada;
- un contexto cambió;
- una fuente dejó de estar disponible;
- una intención permanece incierta.

Memory no convierte cada intento de sincronización en recuerdo. Tampoco consolida como hecho una acción pendiente o con resultado desconocido.

### Inteligencia artificial

La IA puede:

- explicar diferencias;
- ayudar a comparar contexto;
- sugerir posibles relaciones;
- resumir hechos confirmados y pendientes distinguiéndolos;
- ayudar al usuario a comprender un conflicto.

La IA no puede:

- decidir qué cambio prevalece;
- confirmar una acción;
- fusionar duplicados ambiguos;
- ampliar autorización;
- transformar una inferencia en hecho;
- ocultar incertidumbre;
- modificar dominios por iniciativa propia.

---

## 20. Relación con Search y Retrieval

Search localiza información existente dentro del alcance autorizado.

Retrieval recupera esa información con contexto y procedencia.

Synchronization afecta lo que Search y Retrieval pueden conocer, pero no cambia sus responsabilidades.

Los resultados deben poder indicar:

- si provienen de información confirmada;
- si existe actualización pendiente;
- si pueden estar desactualizados;
- si una acción local todavía no fue confirmada;
- si parte del contexto no está disponible;
- si existe un conflicto relevante.

Search no debe:

- presentar resultados locales como exhaustivos;
- crear recursos al reconciliar resultados;
- ocultar representaciones confirmadas por una intención pendiente;
- tratar una repetición visual como dos hechos.

Retrieval no debe:

- inventar el contexto faltante;
- reemplazar fuentes por versiones locales derivadas;
- presentar como definitivo un estado en conflicto;
- ampliar permisos para explicar una diferencia.

Después de Synchronization pueden aparecer, cambiar o dejar de estar disponibles resultados. Esto no reescribe qué información estaba autorizada y disponible anteriormente.

---

## 21. Relación con Files & Attachments

Files & Attachments conserva la relación conceptual entre un archivo y su recurso propietario.

Synchronization puede relacionar:

- archivos disponibles localmente;
- referencias conocidas;
- asociaciones pendientes;
- asociaciones confirmadas;
- versiones conceptuales;
- eliminaciones;
- cambios de autorización;
- interpretaciones derivadas.

Un archivo local no debe presentarse como cargado, compartido o asociado hasta la confirmación correspondiente.

Una asociación repetida no debe producir varios adjuntos conceptuales para la misma intención.

Si el recurso propietario cambió o dejó de existir:

- la asociación puede ser rechazada;
- el archivo no adquiere independencia;
- la intención debe conservarse;
- el conflicto debe ser comprensible;
- no debe ampliarse la autorización.

Una eliminación pendiente no oculta silenciosamente un archivo confirmado. Una eliminación confirmada no falsifica que el archivo existió y estuvo relacionado cuando correspondía.

---

## 22. Relación con Events y Notifications

### Events

Events representa hechos significativos que ocurrieron.

Synchronization puede permitir conocer hechos como:

- una acción fue aceptada;
- una acción fue rechazada;
- se confirmó una corrección;
- se aplicó una revocación;
- se resolvió un conflicto mediante decisión explícita;
- se reconoció que una acción ya estaba representada.

No son automáticamente eventos de negocio:

- cada intento de comunicación;
- cada revisión de pendientes;
- cada comparación;
- cada actualización visual;
- cada repetición técnica;
- cada cambio interno de disponibilidad.

La recepción de una acción no es el evento de negocio solicitado. El hecho relevante depende de la aceptación o rechazo del dominio.

### Notifications

Notifications puede informar:

- que una acción continúa pendiente;
- que fue recibida pero no aceptada;
- que fue confirmada;
- que fue rechazada;
- que su resultado es desconocido;
- que existe un conflicto;
- que se necesita una decisión.

Una notificación no modifica el estado de sincronización ni demuestra que la acción ocurrió.

---

## 23. Recuperación después de una desconexión

Al recuperar comunicación, Synchronization continúa el ciclo iniciado por Offline First.

El comportamiento conceptual es:

1. reconocer que puede existir comunicación;
2. revisar intenciones y acciones pendientes;
3. identificar resultados desconocidos;
4. conocer cambios confirmados todavía no disponibles localmente;
5. validar autorización vigente;
6. validar existencia, estado y dependencias de los recursos;
7. relacionar representaciones de una misma acción;
8. identificar duplicados posibles;
9. presentar acciones todavía aplicables;
10. reconocer aceptación, rechazo o incertidumbre;
11. detectar conflictos;
12. solicitar decisiones cuando corresponda;
13. actualizar la información disponible;
14. informar resultados relevantes;
15. conservar trazabilidad.

Recuperar conexión no significa que:

- todas las acciones se procesan;
- todas se aceptan;
- el orden pendiente es definitivo;
- la autorización anterior se restaura;
- los conflictos desaparecen;
- los resultados desconocidos se repiten;
- todo el dispositivo queda sincronizado.

La sincronización debe expresarse por alcance y resultado, no como una promesa global sin evidencia.

---

## 24. Trazabilidad

La trazabilidad permite comprender la relación entre intención, acción y resultado.

Para una acción relevante debe poder reconstruirse:

- quién expresó la intención;
- qué pretendía hacer;
- sobre qué recurso;
- qué información conocía;
- cuándo fue registrada;
- si fue presentada;
- si fue recibida;
- si fue aceptada o rechazada;
- si existió un resultado desconocido;
- qué autorización resultó aplicable;
- qué conflicto ocurrió;
- qué decisión resolvió el conflicto;
- cuál es el hecho confirmado vigente;
- qué fuente conserva el contexto original.

Trazabilidad no significa convertir cada detalle operativo en evento de negocio.

Ping debe conservar la historia relevante para explicar:

- por qué un cambio aparece;
- por qué una acción no se aplicó;
- por qué dos representaciones se reconciliaron;
- por qué fue necesaria una decisión;
- qué ocurrió finalmente.

Una corrección posterior agrega contexto y un nuevo hecho. No borra conceptualmente el hecho anterior.

---

## 25. Estados visibles para el usuario

Ping debe comunicar estados funcionales sin exponer detalles técnicos.

### Guardado en este dispositivo

La intención existe localmente.

### Pendiente

La acción espera una condición necesaria para continuar.

### Enviando

Ping intenta presentar la acción. No significa recepción ni aceptación.

### Recibido, pendiente de confirmación

La acción fue recibida para evaluación, pero todavía no se conoce aceptación.

### Confirmado

La acción fue aceptada y el resultado correspondiente es conocido.

### No se pudo aplicar

La acción fue rechazada o dejó de ser aplicable. Ping debe explicar la diferencia cuando sea relevante.

### Resultado desconocido

No puede determinarse si la acción fue aceptada o rechazada.

### Requiere revisión

Existe un conflicto o ambigüedad que necesita intervención.

### Información posiblemente desactualizada

La representación puede no contener los cambios más recientes.

### Actualizado hasta el momento conocido

Ping incorporó los cambios confirmados disponibles dentro de un alcance comprensible.

Ping no debe mostrar “Sincronizado” de forma global si existen resultados desconocidos, pendientes relevantes o conflictos dentro del alcance al que se refiere.

---

## 26. Errores y situaciones ambiguas

### Una acción aparece en dos dispositivos

Puede ser una misma intención representada dos veces o dos acciones distintas. Ping no debe decidir sin evidencia suficiente.

### Se recibe una acción, pero no existe aceptación

Debe permanecer recibida y pendiente de confirmación. No se presenta como aplicada.

### Una acción fue aceptada, pero el dispositivo no conoce el resultado

Localmente puede seguir con resultado desconocido hasta reconciliarse con el hecho confirmado.

### El usuario repite una acción

Ping debe determinar conceptualmente si expresa la misma intención o una nueva. Ante ambigüedad, debe evitar consecuencias duplicadas.

### Llega información aparentemente anterior

No debe descartarse sólo por conocerse después. Su momento de ocurrencia y procedencia pueden ser distintos del momento de conocimiento.

### Falta una dependencia

La acción no debe aplicarse fuera de contexto. Puede quedar pendiente, ser rechazada o requerir revisión.

### La autorización cambió

La acción se evalúa con la autorización vigente. El permiso conocido anteriormente no basta.

### Un hecho confirmado parece contradecir una intención local

El hecho no se elimina. La intención se conserva y se reconcilia como rechazada, no aplicable o conflictiva.

### Parte de la información no está autorizada

Ping debe explicar el estado sin revelar el contenido protegido.

### No puede establecerse un orden

La incertidumbre temporal permanece visible. No se inventa una secuencia.

---

## 27. Reglas e invariantes

1. Una intención local no equivale a una acción aceptada.
2. Presentar una acción no demuestra recepción.
3. Recibir una acción no equivale a aceptarla.
4. Sólo la aceptación produce el cambio confirmado solicitado.
5. Una acción rechazada no produjo el cambio solicitado.
6. Un resultado desconocido no puede mostrarse como sincronizado.
7. La misma acción no debe producir varios hechos de negocio.
8. Dos acciones parecidas no deben fusionarse sin evidencia.
9. Los mensajes no deben duplicarse por reconciliar representaciones.
10. Las propuestas locales no deben crear compromisos duplicados.
11. Los eventos confirmados no deben duplicarse por intentos repetidos.
12. Los hechos confirmados no se pierden durante la reconciliación.
13. Una intención relevante no se descarta silenciosamente.
14. Los conflictos importantes deben ser visibles.
15. Los conflictos no se resuelven por inferencia de IA.
16. La autorización vigente limita toda aceptación.
17. Una autorización anterior no concede acceso futuro.
18. Synchronization nunca amplía permisos.
19. El orden de conocimiento no reemplaza el orden de ocurrencia.
20. El orden no demuestra causalidad.
21. Las dependencias relevantes deben respetarse.
22. Una acción dependiente no se aplica si su base fue rechazada.
23. Una corrección no borra conceptualmente el hecho corregido.
24. La reconciliación conserva procedencia.
25. La información desactualizada debe poder reconocerse.
26. Search no presenta un alcance parcial como exhaustivo.
27. Retrieval no inventa contexto faltante.
28. Memory no convierte intentos en recuerdos permanentes.
29. La IA no confirma acciones ni elige la verdad definitiva.
30. Un archivo local no se considera compartido por estar disponible.
31. Una notificación no prueba aceptación.
32. No toda actividad de sincronización es un evento de dominio.
33. La trazabilidad conserva hechos de negocio, no ruido técnico.
34. Recuperar conexión no implica aceptar pendientes.
35. “Sincronizado” siempre debe tener un alcance comprensible.
36. Synchronization no reemplaza Offline First.
37. Synchronization no reemplaza las fuentes originales.
38. Synchronization no reescribe la historia.

---

## 28. Escenarios de validación

### Escenario 1: mensaje repetido después de un resultado desconocido

- **Intención:** enviar una respuesta en Conversation.
- **Situación inicial:** el mensaje fue presentado, pero el dispositivo perdió comunicación.
- **Información conocida:** no puede determinarse si fue aceptado.
- **Cambio posterior:** el usuario intenta enviarlo nuevamente.
- **Reconciliación esperada:** Ping busca relacionar ambas representaciones antes de producir otro mensaje.
- **Resultado posible:** se reconoce un único mensaje confirmado, se mantiene la incertidumbre o se solicita revisión.
- **Invariante protegida:** una acción no produce mensajes duplicados.

### Escenario 2: compromiso resuelto desde dos dispositivos

- **Intención:** registrar el resultado de un compromiso.
- **Situación inicial:** ambos dispositivos conocen el mismo estado abierto.
- **Cambios:** un dispositivo propone resolución; el otro registra un avance diferente.
- **Información posterior:** una de las acciones fue confirmada primero.
- **Reconciliación esperada:** se valida si la segunda sigue siendo aplicable.
- **Resultado posible:** coexistencia contextual, rechazo o conflicto visible.
- **Invariante protegida:** un avance no reemplaza silenciosamente una resolución ni viceversa.

### Escenario 3: autorización revocada

- **Intención:** añadir una nota a un compromiso compartido.
- **Situación inicial:** la nota quedó pendiente sin conexión.
- **Cambio remoto:** el acceso del usuario fue revocado.
- **Reconciliación esperada:** se aplica la autorización vigente antes de aceptar la nota.
- **Resultado posible:** rechazo sin exponer nuevo contenido protegido.
- **Invariante protegida:** una autorización anterior no permite aplicar acciones futuras.

### Escenario 4: conversación actualizada antes de un mensaje pendiente

- **Intención:** enviar un mensaje redactado con contexto anterior.
- **Situación inicial:** el mensaje permanece local.
- **Cambio remoto:** la conversación recibe información que altera el asunto.
- **Reconciliación esperada:** Ping conserva el mensaje y muestra que requiere revisión si su significado cambió.
- **Resultado posible:** el usuario confirma, corrige o descarta su intención.
- **Invariante protegida:** la intención no se reescribe silenciosamente.

### Escenario 5: propuesta de compromiso ya confirmada

- **Intención:** crear un compromiso desde una captura.
- **Situación inicial:** el dispositivo conserva una propuesta pendiente.
- **Información posterior:** aparece un compromiso confirmado que corresponde a la misma acción.
- **Reconciliación esperada:** se relaciona la propuesta con el compromiso existente.
- **Resultado posible:** un solo compromiso, con procedencia e historia comprensibles.
- **Invariante protegida:** la misma acción no crea compromisos duplicados.

### Escenario 6: dos referencias de persona parecidas

- **Intención:** asociar un responsable.
- **Situación inicial:** un dispositivo usa una referencia incompleta y otro conoce una persona confirmada.
- **Información posterior:** las representaciones parecen coincidir.
- **Reconciliación esperada:** People conserva la ambigüedad hasta contar con confirmación.
- **Resultado posible:** relación confirmada por el usuario o referencias separadas.
- **Invariante protegida:** Synchronization no fusiona identidades por semejanza.

### Escenario 7: archivo asociado a un recurso eliminado

- **Intención:** añadir evidencia a un compromiso.
- **Situación inicial:** la asociación quedó pendiente.
- **Cambio remoto:** el compromiso fue eliminado o dejó de estar disponible.
- **Reconciliación esperada:** la asociación no se aplica fuera de su recurso propietario.
- **Resultado posible:** rechazo o revisión, conservando la intención y sin compartir el archivo.
- **Invariante protegida:** Files nunca existe conceptualmente aislado.

### Escenario 8: Search trabaja con información desactualizada

- **Intención:** localizar compromisos abiertos de una persona.
- **Situación inicial:** Search sólo conoce información local.
- **Cambio posterior:** Synchronization incorpora resoluciones confirmadas.
- **Reconciliación esperada:** los resultados se actualizan y conservan contexto temporal.
- **Resultado posible:** algunos asuntos dejan de aparecer como abiertos.
- **Invariante protegida:** la vista anterior no se presenta como exhaustiva ni se convierte en historia falsa.

### Escenario 9: Memory contiene una acción pendiente

- **Intención:** recordar qué ocurrió con un asunto.
- **Situación inicial:** existe una resolución local todavía no confirmada.
- **Información posterior:** la resolución es rechazada.
- **Reconciliación esperada:** Memory distingue la intención del hecho y recupera el rechazo con contexto.
- **Resultado posible:** el compromiso continúa abierto.
- **Invariante protegida:** Memory no convierte pendientes en hechos permanentes.

### Escenario 10: explicación de IA ante un conflicto

- **Intención:** comprender por qué un cambio no se aplicó.
- **Situación inicial:** existen dos decisiones incompatibles.
- **Información conocida:** hechos, propuestas y autorización están diferenciados.
- **Acción permitida:** la IA explica las diferencias y la incertidumbre.
- **Reconciliación esperada:** la decisión sigue perteneciendo al usuario o a la regla del dominio.
- **Resultado posible:** decisión explícita y trazable.
- **Invariante protegida:** la IA ayuda, pero no resuelve el conflicto.

### Escenario 11: información conocida fuera de orden

- **Intención:** reconstruir la evolución de un compromiso.
- **Situación inicial:** un dispositivo conoce primero la resolución y después un avance anterior.
- **Información posterior:** ambos hechos conservan sus momentos y procedencia.
- **Reconciliación esperada:** se ordenan conceptualmente sin tratar el momento de conocimiento como momento de ocurrencia.
- **Resultado posible:** historia comprensible del avance seguido por resolución.
- **Invariante protegida:** conocer después no significa ocurrir después.

### Escenario 12: recepción sin aceptación

- **Intención:** reasignar un compromiso.
- **Situación inicial:** el sistema reconoce recepción de la solicitud.
- **Información conocida:** todavía no existe decisión autorizada.
- **Estado visible:** “Recibido, pendiente de confirmación”.
- **Reconciliación esperada:** esperar aceptación o rechazo sin cambiar responsable.
- **Resultado posible:** reasignación confirmada o solicitud rechazada.
- **Invariante protegida:** recepción no equivale a aceptación.

---

## 29. Criterios de aceptación

El modelo conceptual de Synchronization se considera correctamente definido cuando:

1. Synchronization queda separada de Offline First y de la arquitectura técnica.
2. Se explica cómo relacionar cambios de distintos momentos, dispositivos y estados de conectividad.
3. Se distinguen intención, pendiente, presentada, recibida, aceptada, rechazada y resultado desconocido.
4. Recepción nunca equivale a aceptación.
5. Un resultado desconocido nunca se presenta como sincronizado.
6. El orden distingue intención, presentación, recepción, confirmación y conocimiento.
7. La causalidad se distingue de la simple secuencia temporal.
8. Las dependencias relevantes se conservan.
9. La misma acción no produce mensajes, compromisos o eventos duplicados.
10. Los posibles duplicados ambiguos no se fusionan automáticamente.
11. Los hechos confirmados no se pierden ni se reescriben.
12. La intención del usuario no se descarta ni modifica silenciosamente.
13. Los conflictos importantes son visibles y comprensibles.
14. La autorización vigente se valida antes de aceptar acciones.
15. Los cambios desde varios dispositivos conservan procedencia.
16. Conversation mantiene mensajes y orden contextual.
17. Commitment mantiene su ciclo de vida y transiciones confirmadas.
18. People no fusiona identidades ambiguas.
19. Memory no convierte intentos en hechos.
20. La IA no decide reconciliaciones importantes.
21. Search y Retrieval muestran límites de actualización y contexto.
22. Files no presenta asociaciones pendientes como confirmadas.
23. Events conserva hechos de negocio sin registrar cada detalle operativo.
24. Notifications comunica estados sin modificarlos.
25. La trazabilidad permite reconstruir intención, decisión y resultado.
26. El lenguaje visible evita afirmaciones globales sin alcance.
27. No se definen mecanismos, almacenamiento, protocolos ni algoritmos concretos.
28. Se mantiene coherencia con los documentos 00 al 14.

---

## 30. Decisiones pendientes

Las siguientes decisiones permanecen abiertas:

1. Definir qué tipos de cambios participarán en Synchronization durante la primera beta.
2. Definir el alcance funcional inicial para múltiples dispositivos.
3. Definir qué estados visibles se utilizarán en la primera beta.
4. Definir cuándo puede mostrarse una representación como “sincronizada”.
5. Definir el alcance exacto al que se refiere ese estado.
6. Definir qué acciones requieren aceptación inmediata.
7. Definir qué acciones pueden permanecer pendientes.
8. Definir cuánto tiempo puede conservarse una acción pendiente.
9. Definir cuándo una acción pendiente deja de ser aplicable.
10. Definir cómo se trata funcionalmente un resultado que permanece desconocido.
11. Definir cuándo puede volver a intentarse una acción con resultado desconocido.
12. Definir qué evidencia permite reconocer la misma acción.
13. Definir el tratamiento de duplicados ambiguos.
14. Definir qué diferencias constituyen conflictos.
15. Definir qué conflictos pueden resolverse mediante reglas de negocio ya aprobadas.
16. Definir qué conflictos requieren decisión explícita.
17. Definir cómo se conserva una intención descartada por el usuario.
18. Definir el tratamiento de acciones dependientes cuando una acción previa es rechazada.
19. Definir las reglas de prioridad conceptual entre cambios, si fueran necesarias.
20. Definir qué dimensión temporal determina cada orden visible.
21. Definir cómo se presenta un orden incierto.
22. Definir cómo se relacionan cambios desde varios dispositivos del mismo usuario.
23. Definir cómo se informa un rechazo causado por autorización sin revelar información protegida.
24. Definir el efecto funcional de revocaciones sobre acciones ya recibidas pero todavía no aceptadas.
25. Definir el efecto de eliminaciones sobre cambios pendientes.
26. Definir cómo se relacionan versiones conceptuales de archivos.
27. Definir qué información de sincronización debe recuperar Search.
28. Definir qué contexto de reconciliación debe conservar Memory.
29. Definir qué hechos de reconciliación son eventos relevantes del negocio.
30. Definir qué resultados justifican Notifications.
31. Definir cuándo la IA puede ayudar a explicar duplicados o conflictos.
32. Definir los límites de información que puede mostrar una explicación de conflicto.
33. Definir cómo se recuperan acciones después de un cierre inesperado.
34. Definir el comportamiento cuando vuelve la conexión pero el resultado sigue siendo desconocido.
35. Definir en la arquitectura futura los mecanismos técnicos sin alterar estas reglas conceptuales.

Hasta resolver estas decisiones, Ping no debe asumir silenciosamente prioridad, repetición, fusión, descarte, orden definitivo, vigencia de autorización ni resolución automática.

---

## 31. Resumen

Synchronization relaciona intenciones, acciones y hechos conocidos en distintos momentos, dispositivos y estados de conectividad.

Su principio central es conservar significado:

- una intención no es una aceptación;
- presentar no significa recibir;
- recibir no significa aceptar;
- un resultado desconocido no está sincronizado;
- dos representaciones no son necesariamente dos hechos;
- dos cambios parecidos no son necesariamente el mismo;
- conocer después no significa que ocurrió después;
- recuperar conexión no restaura permisos ni garantiza éxito.

Offline First mantiene la utilidad y protege la intención cuando falta comunicación. Synchronization reconcilia conceptualmente esa intención con información, autorización y hechos conocidos posteriormente.

Conversation, Commitment, People y Memory conservan la propiedad de sus conceptos. Events representa hechos significativos. Search y Retrieval localizan y contextualizan información autorizada. Files conserva evidencia asociada a recursos. Notifications comunica estados. La IA puede explicar, pero no decidir.

Ping debe evitar duplicados, conservar hechos confirmados, exponer conflictos y mantener trazabilidad sin transformar cada detalle técnico en un evento de negocio.

La arquitectura futura decidirá cómo implementar estas reglas. Este documento establece únicamente el comportamiento funcional que cualquier implementación deberá respetar.
