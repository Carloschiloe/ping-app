# Ping — Dominio Commitment

Este documento define oficialmente el dominio conceptual y funcional Commitment de Ping para el MVP.

## 1. Propósito del dominio

Commitment representa los asuntos importantes que el usuario confirma y que requieren una acción, revisión, decisión, confirmación, respuesta o resultado.

Su propósito es ayudar a que cada compromiso:

- conserve el motivo por el que existe;
- mantenga una procedencia identificable;
- tenga un responsable comprensible;
- permanezca visible mientras siga abierto;
- registre seguimientos y avances relevantes;
- evolucione sin perder su historia;
- alcance un cierre con resultado comprensible.

Commitment no existe para acumular tareas ni para medir actividad. Existe para acompañar un asunto confirmado desde su creación hasta su resolución.

## 2. Responsabilidades del dominio

Commitment es responsable de:

- crear un compromiso sólo después de la confirmación del usuario;
- representar qué debe ocurrir;
- conservar propietario, responsable y personas relacionadas;
- mantener origen, procedencia y contexto;
- representar fecha o plazo cuando corresponda;
- representar prioridad cuando corresponda;
- distinguir el estado y las condiciones relevantes del compromiso;
- reconocer compromisos abiertos, próximos, atrasados, en seguimiento y resueltos;
- registrar seguimientos, avances, respuestas y resultados;
- conservar eventos y cambios relevantes;
- permitir que el usuario corrija información recordada;
- permitir la eliminación cuando corresponda a la información que pertenece al usuario;
- ofrecer el contexto necesario para comprender el compromiso;
- aportar información autorizada a People y Memory;
- ayudar a avanzar hacia una resolución.

El dominio administra la evolución del compromiso confirmado. No altera el contenido original que le dio origen.

## 3. Límites del dominio

Commitment no es responsable de:

- registrar o administrar conversaciones y mensajes originales;
- convertir automáticamente una captura en compromiso;
- decidir por el usuario si una sugerencia debe confirmarse;
- modificar la fuente conversacional;
- inventar fechas, responsables, resultados o contexto;
- administrar la identidad completa de una persona;
- decidir qué información constituye memoria relevante;
- tratar un resumen de IA como verdad primaria;
- ejecutar acciones importantes sin confirmación;
- gestionar un calendario completo;
- convertirse en una agenda;
- operar como sistema de tickets;
- representar procesos de un ERP;
- organizar trabajo mediante tableros de productividad basados sólo en estados;
- incorporar checklists, reportes de turno o modo Operación al MVP;
- depender de colaboración para entregar valor personal.

Commitment administra el ciclo de vida del asunto. Conversation conserva la fuente original. People administra identidad y relaciones. Memory permite recuperar información relevante con autorización y procedencia.

## 4. Qué es un compromiso en Ping

Un compromiso es un asunto confirmado por el usuario que no debe perderse y que requiere atención hasta alcanzar una resolución comprensible.

Puede representar algo que una persona:

- prometió hacer;
- solicitó a otra persona;
- aceptó realizar;
- necesita recordar;
- debe revisar;
- debe decidir;
- debe confirmar;
- espera recibir.

Un compromiso conecta, cuando la información está disponible y confirmada:

- propietario;
- responsable;
- personas relacionadas;
- descripción;
- origen;
- contexto;
- fecha o plazo;
- prioridad;
- estado;
- seguimiento;
- avances;
- resultado;
- historial de cambios.

El compromiso no es únicamente una frase de acción. Debe permitir comprender qué importa, por qué importa, quién debe actuar, qué ha ocurrido y qué falta para cerrar el asunto.

## 5. Qué no es un compromiso

No es un compromiso:

- cualquier mensaje registrado;
- cualquier captura personal;
- una sugerencia todavía no confirmada;
- una fecha detectada sin intención confirmada;
- una persona mencionada sin responsabilidad confirmada;
- un resumen generado por IA;
- una notificación;
- un evento de calendario;
- una conversación completa;
- una nota sin necesidad de acción, revisión, decisión, confirmación, respuesta o resultado;
- un elemento creado sólo para llenar una lista;
- un estado técnico sin significado para el usuario;
- una acción ejecutada autónomamente por Ping.

Una captura puede existir sin producir un compromiso. Una interpretación puede permanecer como propuesta o ser rechazada. Sólo la confirmación del usuario origina un compromiso.

## 6. Entidades y objetos conceptuales

**Commitment**

Entidad que representa un asunto confirmado y conserva identidad conceptual durante su evolución hasta la resolución.

**Commitment Proposal**

Interpretación previa a la creación. Puede ser confirmada, corregida, completada o rechazada. Mientras no sea confirmada, no es Commitment.

**Commitment Description**

Expresión comprensible de lo que debe ocurrir, revisarse, decidirse, confirmarse o recibirse.

**Owner**

Usuario al que pertenece el compromiso y que conserva control sobre la información recordada.

**Responsible Party**

Persona de quien se espera la acción, respuesta, revisión o decisión asociada al compromiso. Puede ser el propio usuario o una persona relacionada, según lo confirmado.

**Related Person**

Persona que aporta contexto al compromiso sin convertirse necesariamente en responsable.

**Origin Reference**

Relación con la fuente que dio origen al compromiso, como conversación, mensaje, captura o persona relacionada.

**Commitment Context**

Información necesaria para comprender por qué existe el compromiso y con qué asunto está relacionado.

**Time Expectation**

Fecha o plazo confirmado cuando corresponda. Permite reconocer proximidad o atraso sin convertir Commitment en calendario.

**Priority**

Importancia confirmada cuando corresponda. No sustituye contexto, seguimiento ni estado.

**Commitment Status**

Situación comprensible del compromiso dentro de su ciclo de vida.

**Follow-up**

Registro contextual de una intervención destinada a reconocer el estado del asunto o ayudar a que avance.

**Progress**

Información que expresa un cambio, respuesta o avance relevante sin implicar por sí sola resolución.

**Outcome**

Resultado comprensible conservado al resolver el compromiso.

**Commitment Event**

Hecho relevante que permite reconstruir la evolución del compromiso.

## 7. Relaciones entre conceptos

- un Commitment pertenece a un Owner;
- un Commitment tiene un Responsible Party comprensible;
- el Owner puede ser también el Responsible Party;
- el Responsible Party puede ser una persona relacionada distinta del usuario cuando el contexto confirmado lo permita;
- un Commitment puede relacionarse con una o más personas;
- una persona relacionada no es necesariamente responsable;
- un Commitment nace de una Commitment Proposal confirmada o de una creación explícitamente confirmada por el usuario;
- una Commitment Proposal puede originarse en una captura o mensaje;
- un Commitment conserva una Origin Reference identificable;
- una Origin Reference puede señalar una conversación, mensaje, captura o persona relacionada;
- un Commitment mantiene Commitment Context autorizado;
- un Commitment puede tener Time Expectation;
- la Time Expectation permite reconocer condiciones de próximo o atrasado;
- un Commitment puede tener Priority cuando corresponda;
- un Commitment tiene una situación de ciclo de vida;
- un Commitment puede recibir varios Follow-ups;
- un Follow-up puede registrar Progress, una respuesta o una acción posterior;
- un Progress no resuelve automáticamente el Commitment;
- un Commitment resuelto conserva un Outcome;
- los Commitment Events permiten reconstruir cambios relevantes;
- People aporta identidad y relaciones comprensibles;
- Conversation conserva los mensajes y la procedencia de origen;
- Memory permite recuperar Commitment y sus relaciones autorizadas.

Estas relaciones mantienen conectado el asunto sin trasladar a Commitment las responsabilidades de los otros dominios.

## 8. Origen y procedencia

Todo compromiso debe conservar un origen o una procedencia identificable.

El origen puede incluir:

- una conversación;
- un mensaje;
- una captura de texto;
- una captura de audio;
- una persona relacionada;
- una creación explícita del usuario dentro del flujo autorizado.

La procedencia debe permitir comprender:

- dónde surgió el asunto;
- cuándo surgió;
- qué información original lo sustentó;
- qué interpretación fue propuesta;
- qué confirmó o corrigió el usuario;
- qué contexto estaba disponible.

Commitment puede conservar una referencia a la fuente, pero no puede reescribirla ni sustituirla.

Si el usuario corrige la descripción, fecha, responsable u otra información del compromiso, la corrección modifica la representación confirmada del compromiso, no el mensaje o captura original.

Una información derivada, como un resumen, puede ayudar a comprender el asunto, pero debe distinguirse de la fuente y no puede reemplazarla.

Cuando la procedencia sea insuficiente o ambigua, el dominio debe reconocerlo. No debe inventar una explicación.

## 9. Responsables y personas relacionadas

Todo compromiso debe tener un responsable comprensible para el usuario.

El responsable puede ser:

- el propio usuario;
- una persona relacionada, cuando el usuario confirma que de ella se espera la acción, respuesta, revisión o decisión.

El propietario y el responsable son conceptos distintos:

- el propietario es el usuario al que pertenece el compromiso recordado;
- el responsable es la persona de quien se espera que ocurra algo.

Pueden coincidir, pero no deben confundirse.

Una persona puede estar relacionada con el compromiso sin ser responsable. Puede aportar contexto como solicitante, participante de la conversación o persona con la que existe un asunto pendiente.

El dominio debe evitar:

- asignar una persona sólo porque fue mencionada;
- inventar una identidad cuando existe ambigüedad;
- asumir que el propietario siempre es el responsable;
- asumir que otra persona conoce o comparte toda la información;
- convertir una relación contextual en acceso público.

People administra la identidad y las relaciones de las personas. Commitment conserva la función confirmada que cada persona cumple respecto del asunto.

## 10. Estados del compromiso

Los estados y condiciones deben expresar significado para el usuario, no comodidad técnica.

**Abierto**

El compromiso fue confirmado, todavía requiere atención y no tiene una resolución registrada.

**Próximo**

El compromiso abierto se acerca a una fecha o plazo confirmado. Es una condición temporal de un compromiso abierto, no necesariamente un estado excluyente.

**Atrasado**

El compromiso abierto superó una fecha o plazo confirmado sin resolución. Es una condición temporal que exige atención, no una conclusión sobre el resultado.

**En seguimiento**

El compromiso abierto está recibiendo atención posterior a su creación mediante preguntas, respuestas, avances, acciones o nuevos mensajes relacionados. El seguimiento no implica que el asunto esté resuelto.

**Resuelto**

El asunto alcanzó un cierre comprensible y conserva un resultado. No basta con ocultarlo, dejar de mostrarlo o registrar actividad.

**Propuesta rechazada**

El rechazo corresponde a una Commitment Proposal previa a la creación. Una propuesta rechazada no origina un Commitment y, por tanto, no es un estado de un compromiso confirmado.

**Cancelado**

Los documentos base no autorizan todavía un estado oficial de cancelación para un compromiso confirmado. Su significado, condiciones y relación con el resultado quedan como decisión pendiente.

Un compromiso puede estar abierto y, al mismo tiempo, próximo, atrasado o en seguimiento. La representación definitiva de estas combinaciones no se define en este documento.

## 11. Ciclo de vida

El ciclo conceptual de Commitment es:

1. **Detección o captura explícita:** aparece información que podría representar un compromiso.
2. **Propuesta:** Ping presenta una interpretación pendiente de decisión.
3. **Revisión:** el usuario puede corregir o completar descripción, responsable, fecha, contexto u otra información disponible.
4. **Confirmación o rechazo:** el usuario decide si existe un compromiso. El rechazo termina la propuesta sin crear Commitment.
5. **Creación confirmada:** nace el compromiso con propietario, responsable comprensible y procedencia identificable.
6. **Permanencia abierta:** el asunto se mantiene visible mientras requiera atención.
7. **Seguimiento:** se registran intervenciones, respuestas, acciones o cambios relevantes para avanzar.
8. **Evolución:** el compromiso puede volverse próximo o atrasado, recibir avances y cambiar de estado sin perder su historia.
9. **Resolución:** el usuario confirma que el asunto alcanzó un cierre comprensible.
10. **Conservación del resultado:** el compromiso resuelto mantiene resultado, contexto, personas, procedencia y evolución relevante.

El ciclo no termina en la creación. Tampoco considera que cualquier avance sea un cierre.

Las reglas para reabrir un compromiso resuelto o cancelar uno confirmado no están definidas por los documentos base.

## 12. Eventos relevantes del dominio

Los siguientes hechos son conceptualmente relevantes:

- se propone un posible compromiso;
- el usuario corrige una propuesta;
- el usuario completa una propuesta;
- el usuario rechaza una propuesta;
- el usuario confirma una propuesta;
- se crea un compromiso confirmado;
- se establece el propietario;
- se confirma o corrige el responsable;
- se relaciona una persona;
- se conserva la procedencia;
- se confirma o corrige una fecha o plazo;
- se confirma o corrige una prioridad cuando corresponde;
- el compromiso permanece abierto;
- el compromiso se reconoce como próximo;
- el compromiso se reconoce como atrasado;
- se inicia o registra seguimiento;
- se registra una respuesta;
- se registra un avance;
- se vincula un nuevo mensaje cuando la capacidad opcional está habilitada;
- se modifica un estado;
- el usuario resuelve el compromiso;
- se conserva el resultado;
- el usuario corrige información recordada;
- el usuario elimina información cuando corresponde.

Estos eventos describen cambios comprensibles del asunto. No prescriben almacenamiento, mecanismos técnicos ni automatizaciones autónomas.

## 13. Seguimientos, avances y resultados

Seguimiento significa reconocer que un asunto continúa abierto y ayudar a que avance hacia su cierre.

Puede incluir, según las capacidades aprobadas del MVP:

- recordar antes de una fecha o plazo;
- mostrar que un compromiso está atrasado;
- preguntar si hubo avances;
- registrar una respuesta;
- cambiar un estado;
- registrar una acción posterior;
- vincular nuevos mensajes, cuando esta capacidad opcional esté habilitada;
- recomendar una acción como propuesta;
- mostrar asuntos pendientes con una persona;
- advertir que algo continúa sin resolver.

Un seguimiento debe conservar suficiente contexto para que el usuario comprenda:

- qué asunto requiere atención;
- por qué sigue abierto;
- quién debe actuar;
- qué ocurrió desde el último avance;
- qué podría ayudar a continuar.

Un avance representa evolución, no resolución automática. Puede demostrar que algo ocurrió y aun así dejar pendiente una respuesta, decisión, entrega o resultado.

Resolver exige que el usuario pueda registrar un resultado comprensible. El resultado debe permitir entender:

- qué ocurrió finalmente;
- si se obtuvo lo esperado;
- quién estuvo relacionado;
- qué seguimiento llevó al cierre;
- cómo se conecta el cierre con el contexto original.

El dominio no debe enviar actividad sin contexto ni usar recordatorios como sustituto del seguimiento.

## 14. Reglas e invariantes

1. Ningún mensaje genera automáticamente un compromiso.
2. Ninguna sugerencia se convierte en Commitment sin confirmación del usuario.
3. Una propuesta permanece distinguible de un compromiso confirmado.
4. Rechazar una propuesta no crea un compromiso.
5. Todo Commitment pertenece a un propietario.
6. Todo Commitment tiene un responsable comprensible.
7. El responsable puede ser el usuario o una persona relacionada según el contexto confirmado.
8. Mencionar a una persona no basta para convertirla en responsable.
9. Todo Commitment conserva origen o procedencia identificable.
10. Commitment no modifica la fuente original.
11. Una corrección del compromiso no reescribe silenciosamente la conversación o captura de origen.
12. La información derivada no sustituye a la fuente primaria.
13. Un compromiso abierto continúa requiriendo atención.
14. Próximo y atrasado dependen de una fecha o plazo confirmado.
15. Un compromiso sin fecha no debe recibir una proximidad o atraso inventados.
16. En seguimiento no equivale a resuelto.
17. Registrar un avance no resuelve automáticamente el compromiso.
18. Una notificación no constituye por sí sola seguimiento útil.
19. Resolver exige un cierre y un resultado comprensibles.
20. Un compromiso que aún necesita seguimiento no debe presentarse como resuelto.
21. El historial relevante debe permitir reconstruir la evolución.
22. Los cambios de estado deben tener significado para el usuario.
23. La prioridad no reemplaza contexto, estado ni seguimiento.
24. La IA puede sugerir interpretaciones o acciones, pero no ejecutarlas sin confirmación.
25. La incertidumbre sobre intención, fecha, responsable, contexto o resultado debe permanecer visible.
26. El acceso a Commitment y su contexto debe respetar propiedad y autorización.
27. La participación de varias personas no convierte el compromiso en público.
28. El usuario debe poder corregir o eliminar información recordada que le pertenece.
29. Las capacidades opcionales no pueden bloquear el flujo obligatorio.
30. El valor del dominio se mide por seguimiento y resolución, no por volumen de elementos creados.

## 15. Casos de uso obligatorios del MVP

**Recibir una propuesta**

Ping presenta una posible interpretación como propuesta y conserva su origen.

**Revisar la propuesta**

El usuario comprende qué información sería guardada y puede corregir o completar descripción, responsable, fecha, contexto y demás información disponible.

**Confirmar o rechazar**

El usuario confirma la existencia del compromiso o rechaza la propuesta. Sólo la confirmación permite crearlo.

**Crear un compromiso confirmado**

El compromiso nace con propietario, responsable comprensible, procedencia identificable y contexto disponible.

**Consultar compromisos**

El usuario consulta sus compromisos en el tablero sin perder la relación con persona, fecha o conversación.

**Distinguir situación**

El usuario reconoce compromisos abiertos, próximos, atrasados, en seguimiento y resueltos.

**Consultar por persona**

El usuario consulta asuntos pendientes relacionados con una persona dentro del alcance autorizado.

**Consultar por fecha**

El usuario consulta compromisos según fechas o plazos confirmados.

**Consultar por conversación**

El usuario consulta compromisos relacionados con una conversación autorizada.

**Registrar seguimiento**

El usuario conserva una intervención, respuesta, acción posterior o cambio relevante.

**Registrar un avance**

El usuario registra evolución sin que el compromiso se resuelva automáticamente.

**Cambiar el estado**

El usuario actualiza la situación del compromiso de forma comprensible y trazable.

**Volver al origen**

El usuario recupera la fuente y el contexto necesarios para comprender por qué existe el compromiso.

**Resolver con resultado**

El usuario confirma el cierre y conserva un resultado comprensible.

**Reconstruir la evolución**

El usuario puede comprender los cambios, seguimientos, avances y resultado relevantes.

**Corregir o eliminar información**

El usuario conserva control sobre la información recordada que le pertenece.

## 16. Interacción con Conversation

Conversation entrega a Commitment:

- la conversación autorizada de origen;
- el mensaje o captura de origen;
- una referencia de procedencia;
- el contexto conversacional necesario y autorizado;
- personas identificables cuando corresponda;
- una posible sugerencia pendiente de decisión.

Commitment:

- recibe la propuesta sin asumir que ya existe un compromiso;
- crea el compromiso sólo tras confirmación;
- conserva la relación con conversación y mensaje;
- administra propietario, responsable, fecha, prioridad, estado, seguimiento y resolución;
- puede relacionar nuevos mensajes cuando la capacidad opcional esté habilitada.

Commitment no puede:

- modificar el mensaje original;
- reemplazar la conversación con un resumen;
- ampliar los permisos de acceso a la fuente;
- interpretar el registro de un mensaje como confirmación;
- declarar resuelta una conversación porque un compromiso se resolvió.

Conversation conserva mensajes y procedencia. Commitment conserva la evolución del asunto derivado.

## 17. Interacción con People

People aporta:

- identidad comprensible de las personas;
- relaciones entre personas y usuario;
- contexto por persona;
- distinción entre contactos y usuarios registrados cuando corresponda.

Commitment aporta a People:

- qué compromisos se relacionan con una persona;
- qué asuntos siguen abiertos;
- qué prometió el usuario;
- qué espera recibir de otra persona;
- quién es responsable en cada asunto;
- qué resultado se alcanzó;
- qué contexto autorizado permite comprender la relación.

Commitment no administra:

- la identidad completa de una persona;
- todos sus datos de contacto;
- sus organizaciones;
- el conjunto general de relaciones;
- los permisos propios de People.

Una persona relacionada no recibe acceso automático al compromiso. La relación conceptual debe conservar límites de propiedad y autorización.

## 18. Interacción con Memory

Commitment aporta a Memory:

- compromisos confirmados;
- propietario;
- responsable;
- personas relacionadas;
- origen y procedencia;
- contexto;
- fechas o plazos;
- estados y condiciones;
- prioridades cuando corresponda;
- seguimientos;
- avances;
- resultados;
- eventos y cambios relevantes.

Memory permite recuperar esta información por persona, fecha o conversación dentro de la autorización aplicable.

Memory no debe:

- convertir una propuesta rechazada en compromiso;
- perder la procedencia;
- tratar un resumen como verdad primaria;
- mezclar compromisos entre usuarios;
- ampliar permisos;
- sustituir el historial relevante por una conclusión derivada.

Commitment conserva la verdad operativa confirmada del ciclo de vida. Memory ayuda a recuperarla con contexto, autorización y trazabilidad.

## 19. Información que debe conservarse

Commitment debe conservar conceptualmente:

- identidad del compromiso;
- propietario;
- responsable confirmado;
- personas relacionadas;
- descripción confirmada;
- origen y referencia de procedencia;
- contexto suficiente para comprender el asunto;
- fecha o plazo cuando corresponda;
- prioridad cuando corresponda;
- estado comprensible;
- condición de próximo o atrasado cuando sea aplicable;
- seguimientos;
- respuestas;
- avances;
- acciones posteriores relevantes;
- resultado de la resolución;
- eventos y cambios relevantes;
- relación entre cambios y evolución;
- decisiones del usuario que distinguen propuesta, corrección, confirmación y rechazo;
- autorizaciones aplicables;
- distinción entre fuente e información derivada;
- correcciones o eliminaciones realizadas cuando corresponda.

El historial debe permitir reconstruir, como mínimo:

- cómo nació el compromiso;
- qué confirmó el usuario;
- quién quedó responsable;
- qué cambios relevantes ocurrieron;
- qué seguimiento recibió;
- qué avances se registraron;
- cuándo y cómo se resolvió;
- cuál fue el resultado.

## 20. Información que no pertenece al dominio

No pertenece a Commitment:

- el contenido original administrado por Conversation;
- la secuencia completa de mensajes de una conversación;
- la identidad completa administrada por People;
- todas las relaciones de una persona;
- la selección general de qué constituye memoria relevante;
- los resúmenes tratados como fuente primaria;
- eventos de un calendario completo;
- calendarios externos múltiples;
- llamadas;
- grabaciones;
- grupos avanzados;
- presencia avanzada;
- modo Operación;
- checklists;
- reportes de turno;
- reportes complejos;
- insights avanzados;
- automatizaciones autónomas;
- flujos de tickets;
- procesos de ERP;
- tableros cuyo propósito sea sólo mover elementos entre estados;
- interfaces multidispositivo fuera de la validación móvil.

Commitment puede relacionarse con información de otros dominios sin apropiarse de ella.

## 21. Errores y situaciones ambiguas

**La captura no expresa un compromiso**

No se crea una propuesta forzada ni un Commitment.

**La intención es incierta**

La incertidumbre debe permanecer visible. El usuario decide si completa, corrige, confirma o rechaza.

**La propuesta no fue confirmada**

Continúa siendo propuesta. No participa del ciclo de vida de Commitment.

**El usuario rechaza la propuesta**

No nace un compromiso. El rechazo no equivale a cancelar un compromiso existente.

**El responsable es ambiguo**

No se asigna silenciosamente. El usuario debe poder corregirlo o confirmarlo.

**La persona mencionada no puede identificarse**

No se inventa identidad ni se relaciona a la persona equivocada.

**La fecha es ambigua o inexistente**

No se inventa un plazo. Sin fecha confirmada no puede afirmarse que el compromiso está próximo o atrasado.

**La fuente no está disponible o no está autorizada**

No se expone contenido. La falta de acceso o procedencia debe reconocerse sin fabricar contexto.

**Un avance parece suficiente pero el resultado no está claro**

Se registra como avance. No se resuelve automáticamente.

**El usuario indica que el asunto terminó sin explicar el resultado**

Los documentos base exigen un resultado comprensible, pero no definen qué información mínima debe solicitarse.

**Un compromiso resuelto requiere nueva atención**

La reapertura no está definida por los documentos base y no debe asumirse silenciosamente.

**El compromiso ya no corresponde**

La cancelación de un compromiso confirmado no tiene definición oficial en los documentos base.

**Un resumen contradice la fuente o el historial**

La fuente y la información confirmada prevalecen. El resumen permanece derivado.

**Dos compromisos parecen representar el mismo asunto**

Los documentos base no definen reglas para combinación o duplicados.

**La fuente original se elimina**

Debe respetarse el control del usuario, pero el tratamiento de la referencia de procedencia pendiente no está resuelto.

## 22. API conceptual del dominio

La API conceptual describe capacidades y resultados del dominio. No define endpoints, estructuras físicas ni decisiones técnicas.

**Proponer un compromiso**

Resultado esperado: una propuesta distinguible, vinculada con su fuente y pendiente de decisión.

**Revisar una propuesta**

Resultado esperado: el usuario puede comprender, corregir o completar la información propuesta.

**Confirmar una propuesta**

Resultado esperado: se crea un Commitment con propietario, responsable comprensible y procedencia identificable.

**Rechazar una propuesta**

Resultado esperado: la propuesta no crea un Commitment.

**Crear un compromiso explícitamente confirmado**

Resultado esperado: nace un Commitment sólo después de una decisión inequívoca del usuario.

**Obtener un compromiso autorizado**

Resultado esperado: se entrega el asunto con contexto permitido o se rechaza el acceso.

**Consultar compromisos**

Resultado esperado: el usuario puede reconocer compromisos abiertos, próximos, atrasados, en seguimiento y resueltos.

**Consultar por persona, fecha o conversación**

Resultado esperado: se recuperan compromisos autorizados conservando relaciones y contexto.

**Corregir información del compromiso**

Resultado esperado: cambia la representación confirmada sin modificar la fuente original y se conserva el cambio relevante.

**Registrar seguimiento**

Resultado esperado: queda una intervención contextual que ayuda a comprender la evolución.

**Registrar avance**

Resultado esperado: se conserva progreso sin asumir resolución.

**Actualizar la situación**

Resultado esperado: el estado o condición cambia de forma comprensible y reconstruible.

**Obtener contexto de origen**

Resultado esperado: se recupera la referencia autorizada a Conversation, Message o captura.

**Resolver un compromiso**

Resultado esperado: el usuario confirma el cierre y se conserva un resultado comprensible.

**Obtener historial relevante**

Resultado esperado: puede reconstruirse origen, confirmación, responsables, seguimientos, avances, cambios y resolución.

**Entregar información a People**

Resultado esperado: People recibe relaciones contextuales autorizadas sin que Commitment redefina identidades.

**Entregar información a Memory**

Resultado esperado: Memory puede recuperar el compromiso, su evolución y procedencia dentro de los permisos aplicables.

**Corregir o eliminar información recordada**

Resultado esperado: el usuario conserva control sin falsificar silenciosamente la fuente ni la historia relevante.

## 23. Criterios de aceptación

Commitment se considera definido correctamente para el MVP cuando:

1. Una captura puede existir sin producir un compromiso.
2. Toda sugerencia permanece como propuesta hasta la confirmación.
3. El usuario puede confirmar, corregir, completar o rechazar una propuesta.
4. Ningún Commitment se crea sin confirmación.
5. Todo Commitment tiene propietario.
6. Todo Commitment tiene responsable comprensible.
7. El responsable puede ser el usuario o una persona relacionada según lo confirmado.
8. Todo Commitment conserva origen o procedencia identificable.
9. La fuente original no es modificada por Commitment.
10. El usuario puede comprender qué debe ocurrir y por qué.
11. Los compromisos abiertos pueden distinguirse de los resueltos.
12. Los compromisos próximos y atrasados se reconocen desde fechas o plazos confirmados.
13. Un compromiso en seguimiento continúa abierto mientras no tenga resolución.
14. Un avance no produce resolución automática.
15. El seguimiento conserva contexto y no se reduce a notificaciones.
16. Resolver conserva un resultado comprensible.
17. El historial relevante permite reconstruir la evolución.
18. El usuario puede consultar compromisos por persona, fecha o conversación.
19. People conserva la responsabilidad sobre identidad y relaciones.
20. Conversation conserva mensajes y procedencia.
21. Memory recupera información autorizada sin perder la fuente.
22. La IA no inventa ni ejecuta compromisos o acciones importantes.
23. La información derivada permanece distinguible de la fuente.
24. El usuario puede corregir o eliminar información recordada que le pertenece.
25. La definición no depende de calendario, agenda, tickets, ERP, checklists ni tableros de estados.
26. El valor se orienta a seguimiento y resolución, no a acumulación.

## 24. Decisiones pendientes

1. Definir el significado oficial y las condiciones de cancelación de un compromiso confirmado.
2. Definir si un compromiso resuelto puede reabrirse y qué conserva al hacerlo.
3. Definir qué información mínima constituye un resultado comprensible.
4. Definir si un compromiso puede no tener fecha o plazo durante todo su ciclo de vida.
5. Definir cómo se determina que un compromiso está próximo.
6. Definir el tratamiento de fechas o plazos que cambian durante el seguimiento.
7. Definir qué comportamiento cuenta como seguimiento útil para la validación.
8. Definir la diferencia operativa visible entre compromiso abierto y compromiso en seguimiento.
9. Definir si la prioridad será obligatoria, opcional o visible en la primera beta.
10. Definir el alcance inicial de las consultas por persona cuando existan contactos y usuarios registrados.
11. Definir si la primera validación incluirá responsables distintos del usuario mediante colaboración básica.
12. Definir si se habilitará la vinculación de nuevos mensajes con compromisos abiertos.
13. Definir cómo se corrige el responsable cuando la persona relacionada es ambigua.
14. Definir las reglas para compromisos que parecen duplicar el mismo asunto.
15. Definir qué ocurre con la procedencia cuando el usuario elimina la fuente original.
16. Definir qué partes del historial pueden corregirse o eliminarse sin impedir comprender la evolución.
17. Definir los umbrales y períodos para medir seguimiento, atraso y resolución.

Hasta resolver estas decisiones, el dominio no debe asumir comportamientos silenciosos.

## 25. Resumen del dominio

Commitment administra el ciclo de vida de los asuntos que el usuario confirma como importantes.

Un compromiso conecta acción o resultado esperado, propietario, responsable, personas, origen, contexto, fecha cuando corresponda, estado, seguimiento, avances e historia.

La regla de entrada es:

> Una sugerencia sigue siendo una propuesta hasta que el usuario la confirma.

La regla de evolución es:

> Un avance puede mover el asunto, pero no lo resuelve automáticamente.

La regla de cierre es:

> Resolver significa conservar un resultado comprensible, no ocultar un pendiente.

Conversation conserva los mensajes y la procedencia. People administra identidad y relaciones. Memory permite recuperar el compromiso con contexto y autorización. Commitment no modifica la fuente original ni invade las responsabilidades de esos dominios.

Commitment no es una lista de tareas, un calendario, una agenda, un sistema de tickets, un ERP ni un tablero de productividad basado sólo en estados.

Su valor consiste en que el usuario pueda reconocer qué sigue abierto, qué está próximo o atrasado, quién es responsable, qué seguimiento ocurrió y cómo terminó realmente cada asunto.
