# Ping — Audit & Traceability

## 1. Propósito

Este documento define el significado conceptual y funcional de Audit & Traceability dentro de Ping.

Audit permite conservar evidencia suficiente sobre acciones, decisiones y cambios relevantes.

Traceability permite relacionar:

- el origen;
- la intención;
- el actor;
- el recurso;
- el contexto;
- la autorización;
- la transformación;
- la decisión;
- el resultado;
- los cambios posteriores.

El propósito es que Ping pueda reconstruir de manera comprensible:

- qué ocurrió;
- quién intervino;
- sobre qué recurso;
- qué información estaba disponible;
- qué se intentó;
- qué fue aceptado o rechazado;
- qué quedó pendiente o con resultado desconocido;
- por qué cambió un estado;
- qué ocurrió después.

Audit & Traceability no convierte Ping en una herramienta de vigilancia ni en un registro indiscriminado de actividad. La evidencia debe ser proporcional a su relevancia para el negocio, la autorización, la identidad, los compromisos, las fuentes y la historia del sistema.

---

## 2. Alcance y fronteras

### Events

Events representa hechos significativos que ocurrieron dentro del negocio.

Un evento expresa un hecho, posee procedencia, momento y contexto, y permanece conceptualmente inmutable.

### Audit

Audit conserva evidencia relevante sobre:

- intenciones;
- intentos;
- decisiones;
- autorizaciones;
- rechazos;
- cambios;
- resultados;
- intervenciones;
- correcciones;
- situaciones inciertas.

Audit puede conservar evidencia sobre una acción que no llegó a producir un evento de negocio, por ejemplo un intento rechazado por falta de autorización.

### Traceability

Traceability relaciona la evidencia y las fuentes para explicar cómo un asunto evolucionó desde su origen hasta el resultado conocido.

No es una fuente independiente ni una copia completa de todos los recursos.

### Arquitectura futura

La arquitectura futura decidirá:

- almacenamiento;
- retención;
- formatos;
- índices;
- mecanismos de consulta;
- protección técnica;
- verificación técnica de integridad;
- conservación y eliminación física.

Este documento no define esos mecanismos.

---

## 3. Qué es Audit

Audit es la capacidad conceptual de conservar evidencia suficiente para revisar acciones, decisiones y cambios con efecto relevante.

Audit debe permitir responder, cuando corresponda y dentro de la autorización:

- ¿qué acción se intentó?;
- ¿quién la inició?;
- ¿sobre qué recurso?;
- ¿con qué intención declarada?;
- ¿fue recibida, autorizada, aceptada o rechazada?;
- ¿qué regla o decisión resultó aplicable?;
- ¿qué estado relevante existía antes?;
- ¿qué cambió después?;
- ¿cuál fue el resultado?;
- ¿existe incertidumbre?;
- ¿hubo una corrección posterior?;
- ¿qué fuente permite verificarlo?

Audit no declara por sí misma que una acción fue válida. Conserva evidencia sobre lo que ocurrió o se intentó.

---

## 4. Qué es Traceability

Traceability es la capacidad de seguir relaciones significativas entre origen, contexto, transformación y resultado.

Permite reconstruir, por ejemplo:

- qué mensaje originó una propuesta de compromiso;
- quién confirmó esa propuesta;
- qué responsable quedó asociado;
- qué seguimientos y avances ocurrieron;
- qué información derivada ayudó al usuario;
- qué resolución fue confirmada;
- qué correcciones cambiaron la comprensión posterior;
- qué autorización limitó cada acceso o decisión;
- qué archivo aportó evidencia;
- qué ocurrió durante una desconexión y después de sincronizar.

Traceability no reemplaza:

- la conversación;
- el mensaje;
- el compromiso;
- la persona;
- el recuerdo;
- el archivo;
- el evento;
- la decisión original.

Una traza vincula fuentes y evidencia. No se convierte en la propietaria del contenido.

---

## 5. Qué no son Audit y Traceability

Audit y Traceability no son:

- un registro de cada clic;
- una grabación completa del comportamiento del usuario;
- una copia indefinida de todo el contenido;
- una autorización;
- una prueba automática de validez;
- una fuente de verdad separada;
- una forma de conservar información eliminada sin límites;
- un mecanismo de vigilancia;
- un historial técnico exhaustivo;
- una sustitución de Events;
- una reconstrucción inventada por IA;
- una justificación para ampliar acceso.

No toda lectura, apertura de pantalla, cambio visual, consulta repetida o intento técnico merece evidencia auditable.

La relevancia depende del efecto conceptual y funcional.

---

## 6. Evidencia auditable

Evidencia auditable es información suficiente para comprender una acción, decisión, cambio o resultado relevante sin depender de inferencias silenciosas.

Puede incluir conceptualmente:

- identidad comprensible del actor;
- tipo de intervención;
- intención declarada;
- recurso afectado;
- procedencia;
- momento;
- contexto relevante;
- autorización aplicable;
- estado anterior relevante;
- decisión;
- estado posterior relevante;
- resultado;
- rechazo;
- incertidumbre;
- relación con otros hechos;
- fuente original o referencia a ella;
- correcciones posteriores.

La evidencia debe ser:

- pertinente;
- proporcional;
- comprensible;
- relacionable;
- autorizada;
- distinguible de la fuente;
- distinguible de información derivada;
- resistente a reescritura conceptual silenciosa.

Conservar evidencia no exige duplicar el contenido completo del recurso.

---

## 7. Criterios de relevancia

Una acción, decisión o cambio merece trazabilidad cuando afecta de forma relevante:

- la existencia de un recurso;
- su propiedad;
- su autorización;
- su identidad;
- su procedencia;
- el ciclo de vida de un compromiso;
- la participación en una conversación;
- la relación entre personas;
- una fuente utilizada por Memory o IA;
- la disponibilidad o asociación de un archivo;
- una decisión compartida;
- un resultado confirmado;
- una corrección;
- una eliminación;
- una revocación;
- un conflicto;
- una reconciliación.

También puede merecer trazabilidad un intento que no produjo cambio cuando:

- fue rechazado por autorización;
- pudo haber producido un resultado desconocido;
- expresa una intención que debe preservarse;
- explica un conflicto posterior;
- ayuda a distinguir una repetición de un hecho duplicado;
- afecta una acción sensible.

La relevancia no se determina por volumen ni por facilidad técnica.

---

## 8. Actividad que no requiere auditoría de negocio

En principio, no requieren evidencia de negocio:

- abrir o cerrar una vista;
- desplazarse por contenido;
- escribir texto todavía no conservado como intención;
- cambiar temporalmente una presentación;
- repetir una consulta sin efecto relevante;
- recibir una señal técnica sin consecuencia funcional;
- actualizar una representación visual;
- comprobar conectividad;
- realizar comparaciones internas sin resultado de negocio;
- intentos internos que no cambian el significado ni afectan derechos.

Una actividad inicialmente ordinaria puede volverse auditable si:

- accede a información especialmente sensible;
- produce una decisión;
- cambia autorización;
- afecta identidad;
- genera o modifica un recurso;
- constituye un intento relevante rechazado;
- debe explicar un resultado desconocido;
- forma parte de una investigación autorizada.

La decisión exacta sobre lecturas o búsquedas sensibles permanece pendiente.

---

## 9. Actores

Un actor es quien origina, confirma, ejecuta o participa en una acción relevante.

### Usuario propietario

Persona que actúa sobre información propia o bajo un alcance autorizado.

### Participante autorizado

Persona distinta del propietario que interviene dentro de un recurso y acciones explícitamente permitidos.

### Persona relacionada

Puede aparecer como responsable, referencia o participante contextual sin ser necesariamente usuaria registrada.

Ser mencionada no significa haber ejecutado una acción.

### Inteligencia artificial

La IA puede producir:

- interpretaciones;
- resúmenes;
- sugerencias;
- relaciones propuestas;
- explicaciones.

La IA no es autoridad ni propietaria. Su intervención debe distinguirse del actor humano que confirmó o rechazó la propuesta.

### Proceso del sistema

Puede aplicar una regla autorizada, reconocer un resultado o ejecutar una consecuencia ya permitida.

No debe presentarse como decisión humana ni como actor autónomo con voluntad propia.

### Actor desconocido o no determinado

Si no puede determinarse quién intervino, Ping debe conservar la incertidumbre. No debe atribuir la acción por inferencia.

---

## 10. Identidad del actor

La evidencia debe identificar al actor con el nivel de precisión necesario y autorizado para comprender su intervención.

La identidad del actor debe:

- ser comprensible;
- conservar la relación con People cuando corresponda;
- distinguir al propio usuario de otras personas;
- distinguir una persona de la IA;
- distinguir una persona de un proceso del sistema;
- reconocer identidades incompletas;
- evitar fusiones automáticas.

Una identidad técnica no es el modelo mental del usuario.

La evidencia puede expresar:

- persona confirmada;
- propio usuario;
- participante autorizado;
- referencia incompleta;
- IA como origen de una derivación;
- proceso del sistema como ejecutor de una regla;
- actor no determinado.

Corregir una identidad no reescribe silenciosamente la atribución anterior. La corrección debe quedar relacionada con la evidencia original.

---

## 11. Recurso afectado

Toda evidencia auditable debe relacionarse con el recurso o asunto afectado.

Puede tratarse de:

- conversación;
- mensaje;
- compromiso;
- seguimiento;
- avance;
- resultado;
- persona o relación;
- recuerdo;
- archivo;
- adjunto;
- autorización;
- evento;
- notificación relevante;
- búsqueda o recuperación sensible;
- información derivada.

La relación debe permitir comprender:

- qué recurso era el objetivo;
- cuál era su propietario conceptual;
- qué contexto lo rodeaba;
- si el recurso todavía existe;
- si cambió de estado;
- si la autorización limita su consulta.

Una evidencia huérfana, sin recurso ni contexto identificable, no ofrece trazabilidad suficiente.

---

## 12. Intención, intento, decisión y resultado

Traceability debe distinguir conceptos que no son equivalentes.

### Intención

Expresa lo que una persona quería hacer.

No demuestra que la acción fue presentada, autorizada o realizada.

### Intento

Expresa que se procuró ejecutar o confirmar una intención.

No demuestra recepción ni aceptación.

### Recepción

Expresa que una acción llegó al ámbito capaz de evaluarla.

No demuestra autorización, validez ni aplicación.

### Decisión

Expresa una determinación autorizada:

- confirmar;
- corregir;
- rechazar;
- revocar;
- eliminar;
- resolver;
- mantener pendiente;
- solicitar revisión.

### Hecho confirmado

Expresa que ocurrió un cambio significativo reconocido por el dominio propietario.

### Rechazo

Expresa que una acción o propuesta no fue aceptada.

El rechazo no convierte la intención en inválida como expresión histórica; significa que no produjo el cambio solicitado.

### Resultado desconocido

Expresa que Ping no puede determinar qué resultado tuvo el intento.

No debe transformarse silenciosamente en aceptación o rechazo.

### Resultado

Expresa qué ocurrió finalmente y con qué efecto comprensible.

---

## 13. Procedencia

La procedencia permite conocer de dónde proviene la evidencia.

Debe relacionar, cuando corresponda:

- mensaje de origen;
- conversación;
- captura;
- audio;
- compromiso;
- persona;
- archivo;
- acción local;
- decisión humana;
- salida de IA;
- regla aplicada;
- evento confirmado;
- reconciliación.

La procedencia debe conservar la diferencia entre:

- fuente original;
- referencia;
- copia disponible;
- resumen;
- interpretación;
- sugerencia;
- decisión;
- resultado.

Una derivación no sustituye la fuente. Una traza no sustituye la evidencia que relaciona.

Si la fuente deja de estar disponible, Ping puede conservar el hecho autorizado de que existió una relación, sin afirmar que el contenido todavía puede consultarse.

---

## 14. Contexto e información disponible

La evidencia debe conservar contexto suficiente para explicar por qué una acción tuvo sentido.

Puede incluir:

- asunto;
- conversación relacionada;
- persona involucrada;
- compromiso;
- responsable;
- plazo;
- estado conocido;
- autorización conocida;
- archivos relacionados;
- mensajes relevantes;
- información derivada;
- acciones anteriores;
- incertidumbre existente.

También debe poder distinguir qué información estaba disponible para el actor o el sistema en ese momento.

Esto ayuda a comprender:

- por qué se tomó una decisión;
- si una acción dependía de información desactualizada;
- si existía un conflicto todavía desconocido;
- si la autorización no podía validarse;
- si la IA trabajó con contexto incompleto;
- si un dispositivo no conocía cambios recientes.

La información disponible no convierte una decisión equivocada en válida. Permite reconstruir el contexto sin atribuir conocimiento posterior al pasado.

---

## 15. Estado anterior y posterior

Cuando sea relevante, la evidencia debe permitir reconocer:

- estado anterior conocido;
- cambio intentado;
- decisión aplicada;
- estado posterior confirmado;
- diferencias conocidas posteriormente.

No toda acción requiere conservar una copia completa de ambos estados.

Debe conservarse únicamente lo necesario para explicar:

- qué cambió;
- qué permaneció;
- qué decisión produjo la transición;
- qué información fue corregida;
- qué conflicto apareció;
- qué resultado quedó vigente.

Ejemplos:

- compromiso abierto → resolución confirmada;
- participante autorizado → acceso revocado;
- archivo asociado → eliminación confirmada;
- referencia incompleta → identidad corregida;
- propuesta de IA → sugerencia rechazada;
- acción pendiente → acción aceptada;
- resultado desconocido → rechazo conocido posteriormente.

El estado posterior no borra el anterior. Expresa una evolución.

---

## 16. Temporalidad

Audit & Traceability debe distinguir momentos relevantes:

- momento de intención;
- momento de intento;
- momento de recepción;
- momento de decisión;
- momento de confirmación;
- momento de conocimiento;
- momento de corrección;
- momento de revocación;
- momento de eliminación.

Estos momentos pueden ser distintos.

Conocer un hecho después no significa que ocurrió después.

Una acción offline puede haber sido expresada antes, presentada después y confirmada posteriormente.

Si el orden no puede determinarse:

- la incertidumbre debe conservarse;
- no debe inventarse una secuencia;
- la reconstrucción debe limitar sus conclusiones;
- las relaciones causales no deben deducirse sólo por proximidad temporal.

---

## 17. Causalidad y correlación

### Causalidad

Expresa que un hecho, decisión o acción depende de otro o lo produce.

Ejemplos:

- un mensaje origina una propuesta;
- la confirmación origina un compromiso;
- una revocación causa el rechazo de una acción pendiente;
- una resolución produce el cierre comprensible del asunto;
- una corrección cambia la interpretación vigente.

### Correlación

Expresa que varias evidencias pertenecen al mismo asunto, intención o proceso de negocio.

Puede relacionar:

- intención local;
- intento;
- recepción;
- aceptación;
- evento;
- notificación;
- actualización de memoria;
- resultado.

Correlación no demuestra causalidad.

Dos acciones cercanas en tiempo no deben relacionarse causalmente sin evidencia.

La traza debe permitir seguir relaciones relevantes sin convertir cada detalle intermedio en hecho de negocio.

---

## 18. Integridad conceptual de la evidencia

La integridad conceptual significa que la evidencia no se altera de manera que falsifique lo ocurrido.

Ping debe:

- conservar la diferencia entre original y corrección;
- impedir reatribuciones silenciosas;
- distinguir hecho de interpretación;
- distinguir decisión de resultado;
- mantener procedencia;
- reconocer eliminaciones y revocaciones;
- conservar incertidumbre cuando existió;
- relacionar correcciones posteriores;
- no reemplazar una fuente por un resumen.

Si existe una corrección:

1. la evidencia original sigue representando lo que se conocía o declaró;
2. la corrección se reconoce como posterior;
3. la lectura vigente considera la corrección;
4. la historia no se reescribe silenciosamente.

Integridad conceptual no implica:

- conservación infinita;
- acceso permanente;
- visibilidad universal;
- duplicación completa de contenido;
- imposibilidad de eliminar información.

---

## 19. Autorización, privacidad y visibilidad

Audit & Traceability está sujeta a Authorization.

Una auditoría:

- no crea permisos;
- no amplía acceso;
- no hace pública la información;
- no permite consultar una fuente revocada;
- no convierte una relación compartida en memoria compartida;
- no autoriza a conocer todos los recursos de una persona.

La evidencia visible debe limitarse según:

- actor solicitante;
- recurso;
- propiedad;
- alcance;
- propósito;
- vigencia;
- sensibilidad;
- revocación;
- privacidad aplicable.

No toda evidencia debe ser visible para todos.

Puede existir evidencia suficiente para afirmar que una acción fue rechazada sin revelar:

- contenido privado;
- identidad no autorizada;
- conversación de origen;
- motivo sensible;
- archivo protegido.

La privacidad limita qué evidencia se conserva, quién puede verla y durante cuánto tiempo. Las reglas detalladas pertenecen al documento futuro de Privacy.

---

## 20. Revocaciones, eliminaciones y correcciones

### Revocación

La evidencia debe permitir comprender:

- qué acceso existía;
- qué alcance fue retirado;
- cuándo pasó a ser aplicable;
- qué acciones futuras quedaron impedidas;
- qué acciones pendientes fueron rechazadas;
- qué historial autorizado puede seguir reconociéndose.

La revocación impide accesos futuros sin convertir en inexistentes los hechos ocurridos mientras el acceso era válido.

### Eliminación

Una eliminación:

- puede retirar contenido de la consulta;
- puede limitar evidencia visible;
- no debe falsificar que existió una acción o relación;
- no obliga a conservar el contenido eliminado;
- puede conservar una referencia mínima si está autorizada y es necesaria para comprender la historia.

La ausencia posterior del contenido no modifica los hechos que ocurrieron.

### Corrección

Una corrección agrega evidencia posterior y modifica la lectura vigente.

No debe:

- borrar silenciosamente la declaración anterior;
- presentarse como si siempre hubiera sido conocida;
- cambiar la identidad del actor sin trazabilidad;
- sustituir la fuente sin indicación.

Las políticas exactas de retención, eliminación y privacidad permanecen pendientes.

---

## 21. Inteligencia artificial e información derivada

Toda intervención de IA debe distinguir:

- fuentes utilizadas;
- contexto disponible;
- momento de generación;
- tipo de derivación;
- incertidumbre;
- usuario que solicitó o recibió la salida;
- decisión humana posterior;
- efecto real, si existió.

Información derivada puede incluir:

- resumen;
- posible compromiso;
- fecha o responsable sugerido;
- relación propuesta;
- explicación;
- clasificación;
- contexto relacionado.

La evidencia debe dejar claro que:

- una salida de IA no es un hecho;
- una sugerencia no es una decisión;
- una interpretación no sustituye la fuente;
- una inferencia no confirma identidad;
- una respuesta no amplía autorización;
- una salida no modifica dominios por iniciativa propia.

Si el usuario confirma, corrige o rechaza una propuesta, debe poder relacionarse:

- la propuesta;
- sus fuentes;
- la decisión humana;
- el resultado confirmado.

No es necesario conservar cada paso interno de producción de una salida. Debe conservarse evidencia funcional suficiente sobre procedencia, derivación y decisión.

---

## 22. Varios dispositivos, Offline First y Synchronization

Audit & Traceability debe conservar claridad cuando una misma persona actúa desde varios dispositivos o estados de conectividad.

Debe distinguir:

- intención registrada localmente;
- acción pendiente;
- intento;
- recepción;
- aceptación;
- rechazo;
- resultado desconocido;
- reconciliación;
- conflicto;
- dispositivo o contexto de origen cuando sea relevante.

### Acciones offline

Una acción local puede conservar evidencia de:

- intención;
- momento;
- contexto conocido;
- información disponible;
- autorización conocida;
- recurso previsto.

No se presenta como hecho confirmado.

### Synchronization

Cuando la acción se relaciona posteriormente con cambios confirmados, la traza debe mostrar:

- qué intención correspondía;
- si fue aceptada;
- si fue rechazada;
- si ya estaba representada;
- si entró en conflicto;
- qué decisión resolvió el conflicto;
- cuál fue el resultado.

### Varios dispositivos

Los cambios desde dispositivos distintos conservan procedencia.

El dispositivo más reciente no se considera automáticamente correcto. El orden de conocimiento no reemplaza el orden de ocurrencia.

---

## 23. Duplicados, conflictos y resultados desconocidos

### Duplicados

La evidencia debe ayudar a distinguir:

- una acción representada varias veces;
- varios intentos de la misma intención;
- acciones distintas con contenido parecido;
- hechos verdaderamente distintos.

Reconocer un duplicado no borra que existieron varios intentos. Evita producir hechos de negocio repetidos.

### Conflictos

La traza debe relacionar:

- cambios incompatibles;
- actores;
- estados conocidos;
- autorización;
- dependencias;
- decisión aplicada;
- resultado.

Un conflicto importante no debe resolverse silenciosamente.

### Resultado desconocido

La evidencia debe conservar:

- intención;
- intento;
- último estado conocido;
- incertidumbre;
- acciones posteriores;
- reconciliación, si llega a existir.

La ausencia de confirmación no demuestra rechazo. La existencia de un intento no demuestra aceptación.

---

## 24. Relación con Conversation

Conversation conserva mensajes, participantes, archivos asociados y procedencia conversacional.

Audit & Traceability puede relacionar:

- creación confirmada de una conversación;
- incorporación o retiro autorizado de participantes;
- mensajes enviados y confirmados;
- mensajes rechazados;
- correcciones permitidas;
- cambios de autorización;
- archivos asociados;
- propuestas de IA originadas en mensajes;
- compromisos derivados después de confirmación.

No debe auditar cada lectura ordinaria ni convertir cada interacción en evento.

Debe poder reconstruirse, cuando corresponda:

- qué mensaje originó un asunto;
- quién lo escribió;
- qué participantes estaban autorizados;
- qué cambió después;
- qué contenido ya no puede consultarse.

---

## 25. Relación con Commitment

Commitment conserva el ciclo de vida del compromiso.

Audit & Traceability debe permitir reconstruir:

- propuesta;
- origen;
- confirmación;
- propietario;
- responsable;
- personas relacionadas;
- estado;
- fechas confirmadas;
- seguimiento;
- avances;
- resultados;
- resolución;
- rechazo o cancelación cuando corresponda;
- correcciones.

Debe distinguir:

- propuesta de compromiso;
- compromiso confirmado;
- avance;
- cambio de estado;
- resolución;
- intento rechazado;
- resultado desconocido.

Un avance no equivale a resolución.

Una propuesta rechazada no origina un compromiso.

La traza no sustituye el compromiso ni modifica su fuente original.

---

## 26. Relación con People

People conserva identidad y relaciones.

Audit & Traceability puede relacionar:

- creación de una referencia;
- identidad incompleta;
- confirmación de una relación;
- corrección;
- posible coincidencia sugerida;
- fusión o separación confirmada, si alguna vez se permite;
- participación;
- responsabilidad;
- cambios de autorización.

La evidencia debe distinguir:

- persona confirmada;
- referencia incompleta;
- sugerencia de IA;
- decisión del usuario;
- actor real de una acción.

No debe construir perfiles enriquecidos ni conservar información sobre personas para fines ajenos a recordar, seguir y resolver asuntos.

---

## 27. Relación con Memory

Memory conserva información relevante que debe poder recordarse y recuperarse con contexto.

Audit & Traceability puede ayudar a Memory a comprender:

- procedencia de un recuerdo;
- fuente original;
- hecho confirmado;
- corrección;
- revocación;
- eliminación;
- contexto utilizado;
- información derivada;
- resultado de un asunto.

Memory no debe:

- convertir toda evidencia en recuerdo;
- conservar cada intento;
- sustituir la fuente por la traza;
- recuperar información fuera de autorización;
- tratar un resultado desconocido como hecho.

La evidencia auditable puede existir sin convertirse en memoria visible o permanente.

---

## 28. Relación con Authorization y Events

### Authorization

Authorization determina quién puede:

- generar una acción;
- confirmarla;
- consultar un recurso;
- modificarlo;
- eliminarlo;
- conocer evidencia;
- revisar una reconstrucción.

Audit registra evidencia de decisiones de autorización relevantes, pero nunca concede permisos.

### Events

Events representa hechos significativos.

Audit puede conservar evidencia alrededor del evento:

- intención previa;
- actor;
- autorización;
- decisión;
- contexto;
- resultado;
- corrección posterior.

Un intento rechazado puede ser auditable sin constituir el evento de negocio solicitado.

Un evento no reemplaza su fuente. Audit no modifica el evento.

---

## 29. Relación con Notifications

Notifications comunica situaciones relevantes.

Puede existir trazabilidad cuando una notificación:

- comunica una acción pendiente sensible;
- informa aceptación o rechazo;
- expone un conflicto;
- solicita una decisión;
- comunica una revocación;
- informa un cambio con efecto compartido.

No toda notificación necesita evidencia auditable separada.

La traza debe distinguir:

- hecho que motivó la comunicación;
- notificación;
- destinatario autorizado;
- resultado comunicado;
- decisión posterior, si existió.

Una notificación no prueba que el usuario conoció, comprendió o aceptó el hecho salvo que exista evidencia específica autorizada para afirmarlo.

---

## 30. Relación con Search y Retrieval

### Search

Search localiza información autorizada.

Una búsqueda puede merecer evidencia cuando:

- afecta información especialmente sensible;
- forma parte de una revisión autorizada;
- su ejecución tiene efecto relevante;
- es necesaria para explicar acceso o decisión;
- una regla de privacidad lo requiere.

No toda consulta ordinaria debe auditarse.

### Retrieval

Retrieval recupera la fuente y su contexto.

Una recuperación sensible puede requerir evidencia sobre:

- actor;
- propósito autorizado;
- recurso;
- alcance;
- momento;
- resultado permitido o rechazado.

Audit no debe conservar el contenido recuperado sólo para demostrar que se consultó. La evidencia mínima debe ser proporcional y respetar privacidad.

Search y Retrieval nunca amplían permisos mediante una traza.

---

## 31. Relación con Files & Attachments

Files & Attachments conserva archivos como evidencia, soporte o contenido asociado a un recurso propietario.

Audit & Traceability puede relacionar:

- archivo de origen;
- persona que lo asoció;
- recurso propietario;
- momento;
- autorización;
- asociación pendiente o confirmada;
- versión conceptual;
- interpretación de IA;
- eliminación;
- revocación;
- ausencia posterior.

Un archivo puede ser evidencia del negocio, pero no toda evidencia auditable es un archivo.

La traza no reemplaza el archivo.

Si el archivo deja de existir:

- no debe fingirse que nunca estuvo asociado;
- no debe conservarse su contenido sin autorización;
- puede reconocerse su ausencia;
- la historia del recurso no debe falsificarse.

---

## 32. Reconstrucción histórica

Una reconstrucción histórica organiza evidencia autorizada para explicar la evolución de un asunto.

Debe poder responder, según el alcance:

1. ¿Dónde se originó?
2. ¿Qué información existía?
3. ¿Quién intervino?
4. ¿Qué intención expresó?
5. ¿Qué acción se intentó?
6. ¿Qué autorización resultaba aplicable?
7. ¿Qué decisión se tomó?
8. ¿Qué hecho fue confirmado?
9. ¿Qué fue rechazado?
10. ¿Qué quedó pendiente o desconocido?
11. ¿Qué conflicto apareció?
12. ¿Qué cambió después?
13. ¿Qué correcciones existieron?
14. ¿Cuál fue el resultado comprensible?

Una reconstrucción debe:

- conservar temporalidad;
- distinguir hechos de derivaciones;
- reconocer vacíos;
- no inventar evidencia faltante;
- respetar eliminaciones;
- limitarse a información autorizada;
- declarar incertidumbre.

La ausencia de evidencia no demuestra que algo no ocurrió. Sólo limita lo que Ping puede afirmar.

---

## 33. Consulta y presentación funcional

Audit & Traceability debe presentar evidencia con lenguaje comprensible.

Puede expresar:

- “El usuario propuso este cambio”.
- “La acción fue rechazada por autorización”.
- “La decisión fue confirmada posteriormente”.
- “El resultado todavía es desconocido”.
- “Esta interpretación fue generada por IA a partir de estas fuentes”.
- “La información fue corregida después”.
- “El contenido original ya no está disponible”.
- “La acción ocurrió desde otro dispositivo”.
- “Dos cambios requirieron revisión”.

Debe evitar:

- detalles técnicos;
- identificadores incomprensibles como única explicación;
- afirmaciones de certeza sin evidencia;
- revelar información no autorizada;
- presentar una reconstrucción como fuente primaria;
- atribuir a una persona una acción del sistema o de IA.

La forma exacta de consulta pertenece a decisiones posteriores.

---

## 34. Errores y situaciones ambiguas

### Actor no determinado

Ping conserva que no puede atribuir la acción. No inventa identidad.

### Fuente eliminada

La traza reconoce la ausencia sin reconstruir el contenido.

### Evidencia contradictoria

Ping presenta las diferencias, procedencia y momentos. No elige silenciosamente.

### Acción con resultado desconocido

La reconstrucción conserva el intento y la incertidumbre.

### Evidencia incompleta

Ping limita la conclusión. La ausencia no demuestra que el hecho no ocurrió.

### Acción inválida con evidencia

La existencia de evidencia no vuelve válida la acción. Permite demostrar que se intentó o fue rechazada.

### Corrección de identidad

La lectura actual considera la corrección, pero conserva que la atribución anterior existió.

### Información privada necesaria para explicar un rechazo

Ping ofrece una explicación mínima sin revelar contenido no autorizado.

### Dos intentos parecidos

No se fusionan ni se cuentan como hechos distintos sin evidencia suficiente.

### IA produjo una explicación errónea

La salida se conserva como derivación cuando sea relevante, se relaciona con sus fuentes y no sustituye los hechos.

---

## 35. Reglas e invariantes

1. Audit no crea permisos.
2. Traceability no amplía autorización.
3. Una traza no reemplaza el hecho original.
4. Una traza no reemplaza la fuente.
5. La evidencia de una acción no demuestra que fue válida.
6. La existencia de un intento no demuestra aceptación.
7. La recepción no equivale a confirmación.
8. Un rechazo debe distinguirse del hecho solicitado.
9. Un resultado desconocido permanece desconocido hasta obtener evidencia suficiente.
10. La ausencia de evidencia no demuestra que algo no ocurrió.
11. La ausencia de contenido no falsifica la historia.
12. Una eliminación no convierte un hecho ocurrido en inexistente.
13. Una corrección no reescribe silenciosamente la evidencia anterior.
14. Los hechos confirmados conservan procedencia.
15. La reconstrucción distingue intención, intento, decisión, hecho y resultado.
16. La identidad del actor no se infiere silenciosamente.
17. La IA se distingue de una persona.
18. Un proceso del sistema no se presenta como decisión humana.
19. Una interpretación de IA no sustituye la fuente.
20. Una sugerencia de IA no es una decisión.
21. La evidencia derivada conserva procedencia.
22. La privacidad limita conservación y visibilidad.
23. No toda evidencia es visible para todos.
24. Una revocación limita accesos futuros.
25. El historial autorizado no mantiene acceso al contenido revocado.
26. No se audita cada clic ni cada detalle técnico.
27. La relevancia se determina por efecto conceptual y funcional.
28. No toda lectura es auditable.
29. Las búsquedas sensibles sólo se auditan según reglas aprobadas.
30. El estado anterior y posterior se conserva sólo cuando es relevante.
31. El orden de conocimiento no reemplaza el orden de ocurrencia.
32. Correlación no demuestra causalidad.
33. Los conflictos importantes no se ocultan.
34. Los duplicados de representación no crean hechos duplicados.
35. Los varios intentos pueden conservarse sin multiplicar el resultado.
36. Offline First conserva intención, no confirmación.
37. Synchronization relaciona cambios sin reescribirlos.
38. Events conserva hechos relevantes del negocio.
39. Audit conserva evidencia proporcional.
40. Traceability relaciona origen, contexto, transformación y resultado.
41. Memory no convierte toda evidencia en recuerdo.
42. Notifications no prueba conocimiento o aceptación.
43. Search y Retrieval no amplían permisos.
44. Files no sustituye la evidencia restante del asunto.
45. La integridad conceptual no exige conservación infinita.
46. Una reconstrucción reconoce vacíos e incertidumbre.

---

## 36. Escenarios de validación

### Escenario 1: compromiso originado en una conversación

- **Origen:** un mensaje contiene un posible compromiso.
- **Intervención de IA:** propone una interpretación.
- **Decisión humana:** el usuario corrige responsable y confirma.
- **Hecho:** nace un compromiso confirmado.
- **Evolución:** se registran seguimiento, avance y resolución.
- **Trazabilidad esperada:** pueden relacionarse mensaje, propuesta, corrección, confirmación, evolución y resultado.
- **Límite:** la traza no sustituye Conversation ni Commitment.

### Escenario 2: acción rechazada por autorización

- **Intención:** un participante intenta modificar un compromiso compartido.
- **Contexto:** su autorización no permite esa acción.
- **Decisión:** la modificación es rechazada.
- **Evidencia:** actor, recurso, intento, alcance insuficiente y rechazo.
- **Resultado:** el compromiso no cambia.
- **Límite:** la evidencia no vuelve válida la acción ni revela contenido adicional.

### Escenario 3: mensaje offline confirmado posteriormente

- **Intención:** el usuario redacta un mensaje sin conexión.
- **Estado inicial:** acción local pendiente.
- **Synchronization:** la acción se presenta al recuperar comunicación.
- **Decisión:** el mensaje es aceptado.
- **Trazabilidad esperada:** intención, momento local, presentación, aceptación y mensaje confirmado quedan relacionados.
- **Límite:** los intentos intermedios no se convierten en eventos de negocio innecesarios.

### Escenario 4: resultado desconocido

- **Intención:** resolver un compromiso.
- **Intento:** la acción fue presentada, pero se perdió comunicación.
- **Estado:** Ping no conoce aceptación ni rechazo.
- **Evidencia:** intención, intento y última información conocida.
- **Resultado posterior:** Synchronization reconoce que la resolución había sido aceptada.
- **Trazabilidad esperada:** se conserva que existió incertidumbre antes de conocer el hecho.

### Escenario 5: acción repetida sin duplicar

- **Intención:** enviar un mensaje.
- **Situación:** el usuario repite la acción porque no vio confirmación.
- **Evidencia:** dos intentos relacionados con una posible misma intención.
- **Reconciliación:** se reconoce un único mensaje confirmado.
- **Trazabilidad esperada:** se conservan los intentos relevantes sin crear dos hechos conversacionales.

### Escenario 6: conflicto entre dispositivos

- **Dispositivo A:** propone resolver un compromiso.
- **Dispositivo B:** registra un avance incompatible.
- **Contexto:** ambos parten de información anterior.
- **Conflicto:** las decisiones no pueden aplicarse silenciosamente.
- **Decisión:** el usuario revisa y confirma el resultado aplicable.
- **Trazabilidad esperada:** intenciones, contexto conocido, conflicto, decisión y resultado quedan relacionados.

### Escenario 7: revocación durante desconexión

- **Intención:** asociar un archivo a una conversación compartida.
- **Cambio remoto:** el usuario pierde acceso.
- **Synchronization:** la acción pendiente es rechazada.
- **Evidencia:** autorización anterior, revocación, intento y rechazo.
- **Límite:** no se expone contenido posterior ni se conserva acceso mediante la traza.

### Escenario 8: archivo eliminado

- **Hecho inicial:** un archivo fue asociado como evidencia de un compromiso.
- **Cambio posterior:** una eliminación autorizada retira el contenido.
- **Trazabilidad esperada:** puede reconocerse que el archivo existió y fue eliminado.
- **Límite:** la traza no conserva necesariamente el contenido ni permite recuperarlo.

### Escenario 9: interpretación de IA corregida

- **Fuente:** conversación autorizada.
- **Derivación:** la IA propone una persona responsable.
- **Decisión humana:** el usuario corrige la persona.
- **Resultado:** el compromiso se confirma con la identidad corregida.
- **Trazabilidad esperada:** fuente, sugerencia, corrección y decisión quedan diferenciadas.
- **Límite:** la sugerencia nunca se presenta como hecho.

### Escenario 10: búsqueda sensible

- **Intención:** localizar información protegida sobre una persona.
- **Autorización:** el alcance permite sólo ciertos recursos.
- **Acción:** Search localiza únicamente información autorizada.
- **Evidencia posible:** actor, propósito, alcance y resultado permitido, si las reglas lo requieren.
- **Límite:** no se conserva contenido duplicado ni se amplía acceso.

### Escenario 11: reconstrucción con evidencia incompleta

- **Solicitud:** comprender por qué cambió un responsable.
- **Evidencia disponible:** estado anterior, confirmación posterior y fuente original eliminada.
- **Reconstrucción:** Ping muestra lo conocido y reconoce el vacío.
- **Resultado:** puede afirmarse que hubo un cambio, pero no reconstruirse contenido inexistente.
- **Invariante protegida:** la ausencia de evidencia limita la conclusión; no demuestra que nada ocurrió.

### Escenario 12: notificación de rechazo

- **Hecho:** una acción pendiente fue rechazada.
- **Notificación:** informa al actor autorizado.
- **Trazabilidad esperada:** rechazo, motivo funcional permitido y comunicación quedan relacionados.
- **Límite:** la notificación no prueba que el usuario la leyó ni reemplaza el rechazo.

---

## 37. Criterios de aceptación

El modelo de Audit & Traceability se considera correctamente definido cuando:

1. Events, Audit y Traceability tienen responsabilidades distintas.
2. Audit conserva evidencia proporcional sobre acciones, decisiones y cambios relevantes.
3. Traceability relaciona origen, contexto, transformación y resultado.
4. No se convierte cada clic, lectura o detalle técnico en evidencia de negocio.
5. Se distinguen actores humanos, IA y procesos del sistema.
6. La identidad incompleta o desconocida no se completa por inferencia.
7. Toda evidencia relevante se relaciona con un recurso y procedencia.
8. Se distingue intención, intento, recepción, decisión, hecho, rechazo y resultado desconocido.
9. El estado anterior y posterior se conserva cuando aporta significado.
10. La temporalidad distingue ocurrencia y conocimiento.
11. La causalidad se distingue de correlación.
12. La integridad conceptual evita reescrituras silenciosas.
13. Una corrección se relaciona con la evidencia anterior.
14. Una eliminación no falsifica la historia ni obliga a conservar contenido.
15. La privacidad limita conservación y visibilidad.
16. Audit no amplía permisos.
17. La evidencia no vuelve válida una acción inválida.
18. La ausencia de evidencia no demuestra inexistencia.
19. Las salidas de IA conservan fuentes y condición derivada.
20. Los cambios desde varios dispositivos conservan procedencia.
21. Las acciones offline se distinguen de hechos confirmados.
22. Los duplicados no multiplican hechos de negocio.
23. Los conflictos y resultados desconocidos permanecen visibles.
24. Conversation, Commitment, People y Memory conservan sus responsabilidades.
25. Authorization limita toda consulta de evidencia.
26. Events continúa representando hechos del negocio.
27. Notifications comunica sin reemplazar evidencia.
28. Search y Retrieval no amplían acceso.
29. Files conserva evidencia asociada sin ser reemplazado por la traza.
30. Una reconstrucción histórica reconoce vacíos e incertidumbre.
31. No se definen almacenamiento, retención técnica, formatos, índices ni mecanismos de consulta.
32. Se mantiene coherencia con los documentos 00 al 15.

---

## 38. Decisiones pendientes

Las siguientes decisiones permanecen abiertas:

1. Definir qué acciones exactas serán auditables en la primera beta.
2. Definir qué decisiones requieren siempre evidencia.
3. Definir qué intentos rechazados merecen trazabilidad.
4. Definir qué acciones de lectura pueden considerarse sensibles.
5. Definir qué búsquedas sensibles requieren evidencia.
6. Definir qué recuperaciones sensibles requieren evidencia.
7. Definir el nivel mínimo de identificación de actores.
8. Definir cómo se representa un actor desconocido.
9. Definir qué contexto mínimo debe conservar cada tipo de evidencia.
10. Definir cuándo se requiere estado anterior y posterior.
11. Definir qué información disponible en el momento debe conservarse.
12. Definir qué relaciones de causalidad deben poder reconstruirse.
13. Definir qué correlaciones deben conservarse entre dominios.
14. Definir qué intentos de sincronización son funcionalmente relevantes.
15. Definir qué cambios desde varios dispositivos merecen evidencia separada.
16. Definir el tratamiento de duplicados de evidencia.
17. Definir qué conflictos deben formar parte de la reconstrucción.
18. Definir cómo se presenta un resultado desconocido prolongado.
19. Definir qué cambios de autorización requieren evidencia.
20. Definir qué detalles puede mostrar un rechazo por autorización.
21. Definir el efecto de una revocación sobre evidencia previamente visible.
22. Definir el alcance de evidencia mínima después de una eliminación.
23. Definir la relación entre derecho de eliminación e integridad histórica.
24. Definir qué correcciones deben conservar relación explícita con estados anteriores.
25. Definir qué salidas de IA requieren trazabilidad.
26. Definir cuánto detalle sobre fuentes de IA puede mostrarse.
27. Definir qué decisiones humanas sobre propuestas de IA deben conservarse.
28. Definir la trazabilidad de versiones conceptuales de archivos.
29. Definir qué notificaciones relevantes requieren evidencia.
30. Definir quién puede consultar reconstrucciones históricas.
31. Definir qué alcance temporal puede consultar cada actor.
32. Definir cómo se presenta evidencia parcial por límites de privacidad.
33. Definir qué evidencia puede utilizar Memory.
34. Definir qué evidencia puede localizar Search.
35. Definir qué contexto puede recuperar Retrieval.
36. Definir políticas conceptuales de conservación.
37. Definir políticas conceptuales de eliminación.
38. Definir políticas conceptuales de minimización.
39. Definir la relación definitiva con el futuro documento de Privacy.
40. Definir en la arquitectura futura almacenamiento, formatos, índices y mecanismos sin alterar estas reglas conceptuales.

Hasta resolver estas decisiones, Ping no debe asumir silenciosamente alcance, visibilidad, conservación, sensibilidad, identidad, retención ni acceso a evidencia.

---

## 39. Resumen

Audit & Traceability permite que Ping explique la historia relevante de un asunto sin registrar indiscriminadamente toda actividad.

Events representa hechos significativos. Audit conserva evidencia proporcional sobre acciones, decisiones, rechazos y cambios. Traceability relaciona origen, contexto, transformación y resultado.

La reconstrucción debe distinguir:

- intención;
- intento;
- recepción;
- autorización;
- decisión;
- hecho;
- rechazo;
- información derivada;
- resultado desconocido;
- resultado confirmado;
- corrección posterior.

La evidencia no crea permisos, no vuelve válida una acción inválida y no reemplaza las fuentes. Su ausencia limita lo que Ping puede afirmar, pero no demuestra que algo no ocurrió.

Conversation, Commitment, People, Memory, Files y los demás dominios conservan la propiedad de su información. Audit & Traceability relaciona evidencia autorizada para comprender qué ocurrió y por qué.

La privacidad limita conservación y visibilidad. Una eliminación no debe falsificar la historia, pero tampoco obliga a conservar contenido indefinidamente. Una salida de IA conserva su condición derivada. Un conflicto o resultado desconocido no se oculta.

La arquitectura futura decidirá cómo conservar y consultar esta evidencia. Cualquier implementación deberá respetar proporcionalidad, autorización, procedencia, integridad conceptual e incertidumbre.
