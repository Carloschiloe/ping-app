# Ping — Reglas de Negocio

## 1. Propósito

Este documento consolida las reglas de negocio de Ping definidas en los documentos 00 al 18.

Su objetivo es reunir las condiciones que deben cumplirse para proteger:

- el significado del producto;
- la responsabilidad de cada dominio;
- el control del usuario;
- la procedencia;
- la autorización;
- la privacidad;
- la historia relevante;
- el lenguaje ubicuo.

Este documento no reemplaza las definiciones conceptuales de los documentos anteriores. Las utiliza como fuente y consolida únicamente las condiciones que gobiernan el comportamiento.

---

## 2. Alcance

Las reglas se expresan en lenguaje funcional y deben poder verificarse desde el comportamiento observable.

Los identificadores `BR-*` permiten referirse a una regla de negocio. No son nombres de código, clases, eventos de software ni estructuras técnicas.

Este documento no define:

- tablas;
- APIs;
- algoritmos;
- infraestructura;
- almacenamiento;
- clases;
- eventos de software;
- mecanismos de autorización;
- estrategias técnicas de sincronización;
- configuración concreta.

---

## 3. Tipos de decisión

### Regla de negocio

Condición que gobierna el comportamiento permitido del producto.

Ejemplo:

> Una propuesta no crea un compromiso sin confirmación del usuario.

### Invariante

Regla que debe mantenerse verdadera en todo momento dentro de su alcance.

Ejemplo:

> Una conversación conserva la procedencia de sus mensajes.

### Decisión del usuario

Elección explícita que confirma, corrige, rechaza, revoca, elimina o resuelve dentro de autorización.

Ejemplo:

> El usuario confirma una propuesta de compromiso.

La decisión del usuario puede activar una regla, pero no reemplaza las invariantes.

### Política configurable futura

Criterio cuyo valor puede variar dentro de límites de negocio todavía no aprobados.

Ejemplos:

- umbral de proximidad;
- período de conservación;
- frecuencia de notificación;
- cantidad máxima de acciones pendientes.

Una política futura no debe asumirse hasta ser aprobada.

### Decisión pendiente

Pregunta no resuelta por los documentos base.

No puede implementarse como si fuera una regla vigente.

### Mecanismo técnico

Forma futura de implementar una regla.

Ejemplos:

- almacenamiento;
- protocolo;
- índice;
- cola;
- control técnico.

Un mecanismo puede cambiar sin alterar el significado de la regla.

---

## 4. Cómo interpretar las reglas

Cada regla contiene:

- **Condición:** cuándo aplica.
- **Regla:** comportamiento obligatorio.
- **Resultado esperado:** efecto funcional verificable.

Cuando una regla depende de una decisión pendiente, se identifica como condicionada y no autoriza la funcionalidad todavía.

Las reglas se interpretan junto con:

1. Authorization;
2. Privacy;
3. propiedad del dominio;
4. procedencia;
5. estado confirmado;
6. lenguaje ubicuo.

Ninguna regla aislada amplía permisos o propósito.

---

## 5. Reglas generales del producto

Fuente principal: documentos 00, 01, 02, 03 y 18.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-GEN-001 | Ante cualquier capacidad de Ping | El comportamiento debe ayudar a capturar, recordar, seguir o resolver asuntos | La función mantiene relación explícita con el propósito del producto |
| BR-GEN-002 | Cuando exista información sin contexto suficiente | Ping no debe presentarla como asunto comprensible | Se solicita o recupera contexto sin inventarlo |
| BR-GEN-003 | Cuando una acción importante dependa del usuario | Debe existir una decisión explícita | No se atribuyen decisiones importantes al sistema o a la IA |
| BR-GEN-004 | Cuando exista incertidumbre relevante | Ping debe reconocerla | La interfaz no presenta certeza inexistente |
| BR-GEN-005 | Cuando una capacidad opcional no sea necesaria para el flujo principal | No debe bloquear captura, confirmación, seguimiento ni resolución | El MVP conserva su flujo esencial |
| BR-GEN-006 | Cuando un concepto tenga propietario de dominio | Otra capacidad no debe sustituirlo | Conversation, Commitment, People y Memory conservan sus responsabilidades |
| BR-GEN-007 | Cuando exista una fuente original | Un resumen, recuerdo, evento, archivo derivado o traza no debe reemplazarla | La fuente conserva su identidad y procedencia |
| BR-GEN-008 | Cuando se agregue una nueva funcionalidad | Debe respetar visión, MVP, principios, privacidad y control del usuario | Ping no deriva hacia gestor de tareas, chatbot, ERP o repositorio pasivo |

**Validación general:** cada flujo debe poder explicar propósito, fuente, actor, autorización, estado y resultado sin depender de detalles técnicos.

---

## 6. Conversation

Fuente principal: documento 04.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-CON-001 | Al crear una conversación | Debe existir un propósito conversacional y un propietario comprensible | La conversación no existe como contenedor huérfano |
| BR-CON-002 | Al utilizar self-chat | Debe tratarse como caso principal | El usuario puede capturar sin requerir otro participante |
| BR-CON-003 | Al incorporar un mensaje | Debe conservar conversación, autor, momento y procedencia | El mensaje puede comprenderse dentro de su origen |
| BR-CON-004 | Al mostrar un mensaje | No debe confundirse con la conversación completa | Conversation conserva contexto más amplio que Message |
| BR-CON-005 | Al interpretar un mensaje | No debe crearse automáticamente un compromiso | La interpretación permanece como propuesta hasta confirmación |
| BR-CON-006 | Al relacionar un compromiso con un mensaje | Conversation conserva la fuente y Commitment administra el ciclo de vida | Ningún dominio modifica la fuente original |
| BR-CON-007 | Al existir participantes | Cada participante debe estar autorizado dentro de un alcance | Participar no concede acceso a toda la memoria o historia |
| BR-CON-008 | Al cambiar participación o visibilidad | Deben respetarse Authorization, Privacy e historia autorizada | El cambio no expone contenido fuera de alcance |
| BR-CON-009 | Al asociar archivos | La conversación sigue siendo propietaria del contexto conversacional | El archivo no reemplaza mensajes ni conversación |
| BR-CON-010 | Al recuperar una conversación | Debe conservarse contexto y procedencia suficientes | El usuario comprende qué se dijo, quién intervino y qué ocurrió después |

**Excepción aprobada:** una conversación no necesita varios participantes.

**Condicionado:** las reglas exactas de colaboración, incorporación, retiro e historia anterior continúan pendientes.

---

## 7. Commitment

Fuente principal: documento 05.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-COM-001 | Al detectar un posible compromiso | Debe crearse sólo una propuesta | Todavía no existe Commitment |
| BR-COM-002 | Al crear un compromiso | Se requiere confirmación explícita del usuario | Una propuesta no crea un compromiso automáticamente |
| BR-COM-003 | Al confirmar un compromiso | Debe conservar origen o procedencia identificable | El compromiso puede relacionarse con su fuente |
| BR-COM-004 | Todo compromiso confirmado | Debe tener responsable comprensible | Puede saberse quién debe atender el asunto |
| BR-COM-005 | Cuando responsable y propietario sean diferentes | Deben conservarse ambos conceptos | Responsabilidad no concede propiedad ni acceso automático |
| BR-COM-006 | Mientras no exista resolución | El compromiso permanece abierto | Ocultar o dejar de mostrar no lo resuelve |
| BR-COM-007 | Al registrar un avance | No debe producir resolución automática | El asunto puede evolucionar y seguir abierto |
| BR-COM-008 | Al dar seguimiento | Debe conservarse contexto de preguntas, respuestas, avances o acciones relevantes | Seguimiento no se reduce a recordatorios |
| BR-COM-009 | Al registrar resolución | Debe conservarse un resultado comprensible | Resuelto significa cierre con resultado |
| BR-COM-010 | Al rechazar una propuesta | No debe originarse un compromiso | “Propuesta rechazada” no es estado de Commitment |
| BR-COM-011 | Al evaluar una fecha | Próximo y Atrasado se tratan como condiciones de un compromiso abierto | No se convierten automáticamente en prioridad o resultado |
| BR-COM-012 | Al estar en seguimiento | El compromiso puede seguir abierto, próximo o atrasado | Las condiciones no son necesariamente excluyentes |
| BR-COM-013 | Al cambiar responsable, estado o resultado | Se requiere autorización y confirmación aplicables | Las transiciones sensibles no se producen por inferencia |
| BR-COM-014 | Al reconstruir el compromiso | Deben conservarse creación, responsables, seguimientos, avances, cambios y resolución relevantes | La evolución puede comprenderse |
| BR-COM-015 | Al usar información de Conversation, People o Memory | Commitment no debe asumir propiedad sobre esas fuentes | Sólo conserva referencias y contexto necesario |
| BR-COM-016 | Ante cancelación de un compromiso confirmado | No debe aplicarse un estado oficial hasta aprobar significado y condiciones | “Cancelado” permanece como decisión pendiente |

**Criterio de validación:** ningún flujo puede producir un Commitment confirmado sin origen, responsable y decisión explícita del usuario.

---

## 8. People

Fuente principal: documento 06.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-PEO-001 | Al representar una persona | Debe existir contexto desde la perspectiva del usuario | People no crea perfiles globales |
| BR-PEO-002 | Cuando una persona no use Ping | Debe poder representarse sin exigir registro | Los terceros pueden relacionarse con asuntos |
| BR-PEO-003 | Cuando falten identificadores | La referencia permanece incompleta | Ping no inventa email, teléfono o identidad |
| BR-PEO-004 | Ante referencias parecidas | No deben fusionarse automáticamente | Una posible coincidencia permanece como propuesta |
| BR-PEO-005 | Al confirmar una identidad o relación | Se requiere control del usuario | La IA no confirma personas |
| BR-PEO-006 | Al corregir una identidad | La lectura vigente cambia sin borrar silenciosamente la atribución anterior relevante | Existe trazabilidad de la corrección |
| BR-PEO-007 | Al relacionar una persona con un compromiso | Debe distinguirse responsable, propietario y persona relacionada | Ningún papel amplía permisos por sí mismo |
| BR-PEO-008 | Al relacionar una persona con Conversation | Conversation conserva participación y mensajes | People no duplica contenido conversacional |
| BR-PEO-009 | Al recuperar contexto por persona | Sólo se incluye información autorizada y relevante | La relación no convierte información en pública |
| BR-PEO-010 | Al utilizar información de terceros | Debe respetarse propósito y minimización | No se construyen perfiles exhaustivos |
| BR-PEO-011 | Al detectar una relación mediante IA | Debe etiquetarse como sugerencia | No se transforma en relación confirmada |
| BR-PEO-012 | Al cambiar autorización | El acceso por persona debe reflejar el alcance vigente | Una relación anterior no evita revocación |

**Validación:** ninguna coincidencia, mención o responsabilidad puede crear identidad confirmada ni permiso automáticamente.

---

## 9. Memory

Fuente principal: documento 07.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-MEM-001 | Al incorporar información a Memory | Debe existir relevancia, propósito y procedencia | Memory no conserva todo |
| BR-MEM-002 | Al crear un recuerdo desde información derivada | Debe distinguirse la derivación de la fuente | Una inferencia no se vuelve hecho |
| BR-MEM-003 | Al recuperar un recuerdo | Debe incluir contexto suficiente para comprenderlo | El recuerdo no aparece aislado |
| BR-MEM-004 | Cuando la fuente exista | El recuerdo no debe sustituirla | Conversation, Commitment, People o File conserva la fuente |
| BR-MEM-005 | Cuando la fuente no esté disponible | Memory no debe reconstruirla por invención | Se reconoce ausencia o limitación |
| BR-MEM-006 | Al existir autorización limitada | Memory recupera sólo información autorizada | Recordar no amplía permisos |
| BR-MEM-007 | Ante una inferencia útil | Debe permanecer propuesta hasta confirmación | No se consolida como hecho permanente |
| BR-MEM-008 | Al corregir información | El recuerdo y sus derivados deben considerar la corrección | La información incorrecta no continúa vigente silenciosamente |
| BR-MEM-009 | Al eliminar información cuando corresponda | Memory debe respetar la eliminación sin modificar otras fuentes | La memoria no evita el control del usuario |
| BR-MEM-010 | Cuando la relevancia termina | El recuerdo no debe mantenerse activo sólo por existir | Permanencia no significa conservación infinita |
| BR-MEM-011 | Al relacionar información por persona | Debe evitarse un perfil exhaustivo | Sólo se recupera contexto relevante |
| BR-MEM-012 | Al reconstruir un asunto | Memory utiliza hechos y fuentes autorizadas sin duplicar todo el historial | La recuperación conserva contexto y minimización |

**Criterio de validación:** todo recuerdo debe poder explicar qué recuerda, por qué es relevante, de dónde proviene y bajo qué autorización se recupera.

---

## 10. Inteligencia artificial

Fuente principal: documento 08.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-AI-001 | Ante cualquier salida de IA | Debe distinguirse de información confirmada | El usuario reconoce que es derivada |
| BR-AI-002 | Al detectar un posible compromiso | La IA sólo puede proponerlo | No crea Commitment |
| BR-AI-003 | Al sugerir una acción importante | Debe requerir decisión del usuario | La IA no confirma ni ejecuta |
| BR-AI-004 | Al interpretar lenguaje natural | Debe conservar fuentes y contexto | La interpretación tiene procedencia |
| BR-AI-005 | Cuando exista incertidumbre | La IA debe reconocerla | No completa vacíos con hechos inventados |
| BR-AI-006 | Al resumir | El resumen no sustituye la fuente | Conversation o recurso original permanece primario |
| BR-AI-007 | Al sugerir identidad o relación | Debe permanecer propuesta | People no fusiona ni confirma automáticamente |
| BR-AI-008 | Al utilizar información | Sólo puede acceder a contexto autorizado y necesario | La IA no amplía permisos ni propósito |
| BR-AI-009 | Al producir una inferencia sensible | No debe incorporarla sin propósito y autorización explícitos | Privacy protege información sensible |
| BR-AI-010 | Al interactuar con dominios | No modifica recursos por iniciativa propia | Conversation, Commitment, People y Memory conservan control |
| BR-AI-011 | Al explicar una decisión o conflicto | Puede ayudar, pero no elegir el resultado | El juicio permanece en el usuario o la regla aprobada |
| BR-AI-012 | Al corregirse o eliminarse una fuente | Debe revisarse la vigencia de derivados relacionados | Una derivación no adquiere independencia |

**Invariante:** la IA puede proponer, resumir, relacionar, explicar y ayudar; nunca se convierte en autoridad ni fuente de verdad.

---

## 11. Authorization y Privacy

Fuentes principales: documentos 09 y 17.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-AUP-001 | Ante toda consulta o acción protegida | Debe existir autorización aplicable | Ningún recurso se consulta o modifica por inferencia |
| BR-AUP-002 | Al conceder acceso | Debe limitarse a recurso, acción y alcance | Se aplica mínimo privilegio |
| BR-AUP-003 | Cuando exista propiedad | La propiedad no elimina Privacy ni información de terceros | El propietario no obtiene uso ilimitado |
| BR-AUP-004 | Al compartir una conversación | No se comparte toda la memoria del usuario | El alcance permanece en el recurso |
| BR-AUP-005 | Al compartir un compromiso | No se comparten conversaciones privadas no relacionadas | Sólo se presenta contexto necesario |
| BR-AUP-006 | Al relacionar una persona | La relación no concede permisos | People y Authorization permanecen separados |
| BR-AUP-007 | Al revocar acceso | Deben cesar accesos y usos futuros dentro del alcance | La autorización anterior no se prolonga |
| BR-AUP-008 | Ante revocación | No se falsifican hechos ocurridos bajo acceso válido | Historia y acceso futuro se distinguen |
| BR-AUP-009 | Al existir acceso | El uso sigue limitado por propósito y Privacy | Acceso no autoriza cualquier uso |
| BR-AUP-010 | Al obtener información | Debe existir propósito comprensible | Ping no recopila sólo porque puede |
| BR-AUP-011 | Al usar información | Debe aplicarse minimización | Sólo se utiliza cantidad y contexto necesarios |
| BR-AUP-012 | Al tratar información de terceros | Deben aplicarse límites especiales | No se crean perfiles exhaustivos |
| BR-AUP-013 | Al tratar información sensible | No debe inferirse o exponerse sin propósito y autorización | Se evita daño por contexto o derivación |
| BR-AUP-014 | Al generar información derivada | Hereda límites de fuentes, propósito y autorización | Resúmenes e inferencias no evitan Privacy |
| BR-AUP-015 | Al eliminar contenido | Debe distinguirse contenido de hecho histórico | Eliminar no falsifica; auditar no conserva todo |
| BR-AUP-016 | Al corregir información personal | Deben revisarse usos y derivados futuros | La versión incorrecta deja de tratarse como vigente |

**Condicionado:** consentimiento, retención, exportación y colaboración exacta dependen de decisiones pendientes.

---

## 12. Events

Fuente principal: documento 10.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-EVT-001 | Al registrar un Event | Debe representar un hecho que ocurrió | No expresa intención, orden o predicción |
| BR-EVT-002 | Todo Event | Debe conservar procedencia, momento y contexto | El hecho puede comprenderse |
| BR-EVT-003 | Ante propuesta o inferencia de IA | No debe existir Event hasta una decisión explícita relevante | La historia confirmada no incorpora propuestas |
| BR-EVT-004 | Ante una intención o intento | No debe tratarse como hecho solicitado | Events distingue acciones de resultados |
| BR-EVT-005 | Al corregir un hecho | Debe generarse un hecho posterior relacionado | La corrección no reescribe la historia |
| BR-EVT-006 | Al eliminar | La eliminación se representa como hecho posterior cuando corresponda | No se afirma que el recurso nunca existió |
| BR-EVT-007 | Al revocar | El hecho limita acceso futuro sin negar hechos anteriores | Authorization y Events permanecen coherentes |
| BR-EVT-008 | Al conocer un Event | Authorization limita quién puede consultarlo | El Event no concede permisos |
| BR-EVT-009 | Al producirse una actividad técnica | No se crea automáticamente un evento de negocio | La historia evita ruido técnico |
| BR-EVT-010 | Al reconstruir evolución | Debe respetarse temporalidad e inmutabilidad conceptual | Un hecho ocurrido no deja de haber ocurrido |

**Validación:** cada Event debe poder expresarse en pasado como un hecho significativo.

---

## 13. Notifications

Fuente principal: documento 11.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-NOT-001 | Al crear una notificación | Debe existir destinatario autorizado, motivo y contexto | La comunicación es comprensible |
| BR-NOT-002 | Ante un Event | No se genera automáticamente una notificación | Sólo se comunica cuando existe relevancia |
| BR-NOT-003 | Al comunicar | La notificación no ejecuta acciones ni toma decisiones | El dominio propietario conserva control |
| BR-NOT-004 | Al recibir una notificación | No se prueba conocimiento, lectura ni aceptación | Notification no sustituye evidencia |
| BR-NOT-005 | Al cambiar autorización | Debe revisarse la posibilidad de comunicar | No se expone contexto revocado |
| BR-NOT-006 | Al perder vigencia | Puede dejar de llamar la atención sin modificar el hecho de origen | Comunicación y hecho permanecen separados |
| BR-NOT-007 | Al incluir información sensible | Debe minimizarse el contenido | Se informa sin exposición innecesaria |
| BR-NOT-008 | Al sugerir IA la conveniencia de informar | Deben aplicarse reglas de negocio antes de crear la notificación | La IA no decide destinatario o comunicación definitiva |

**Condicionado:** prioridad, repetición, estados de lectura y plazos exactos siguen pendientes.

---

## 14. Search y Retrieval

Fuente principal: documento 12.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-SR-001 | Ante toda búsqueda | Search sólo opera dentro de información autorizada | Buscar no amplía permisos |
| BR-SR-002 | Al localizar recursos | Search no modifica, resume ni recuerda | Se limita a localizar, filtrar, ordenar y encontrar |
| BR-SR-003 | Al presentar coincidencias | No debe revelar recursos por fragmentos, conteos o presencia no autorizada | Privacy se aplica antes del resultado |
| BR-SR-004 | Al formular una consulta con IA | La propuesta no altera el alcance autorizado | El usuario puede revisar criterios |
| BR-SR-005 | Al recuperar un recurso | Retrieval conserva procedencia y contexto suficiente | El resultado puede comprenderse |
| BR-SR-006 | Al faltar contexto | Retrieval no lo inventa | Se reconoce la limitación |
| BR-SR-007 | Al recuperar una fuente | No se reemplaza por resumen o derivación | La fuente permanece identificable |
| BR-SR-008 | Al existir información no disponible | La ausencia de resultados no demuestra inexistencia | El alcance de búsqueda queda claro |
| BR-SR-009 | Al trabajar sin conexión | Los resultados pueden ser incompletos o desactualizados | Search declara límites locales |
| BR-SR-010 | Al recuperar contexto compartido | Sólo se incluye lo necesario y autorizado | Un compromiso no revela toda su conversación privada |

**Validación:** el mismo actor nunca debe descubrir más información mediante una coincidencia que mediante una consulta autorizada directa.

---

## 15. Files & Attachments

Fuente principal: documento 13.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-FIL-001 | Todo File dentro de Ping | Debe pertenecer conceptualmente a un recurso | Ningún archivo existe aislado |
| BR-FIL-002 | Al asociar un File | Attachment debe expresar recurso y contexto | Archivo y adjunto se distinguen |
| BR-FIL-003 | Al relacionar un archivo con Conversation | Conversation conserva el contexto | File no reemplaza mensajes |
| BR-FIL-004 | Al relacionar un archivo con Commitment | Commitment conserva el ciclo de vida | File no se convierte en compromiso |
| BR-FIL-005 | Al relacionar un archivo con People | No se crea un perfil ni propiedad nueva | La persona permanece relación contextual |
| BR-FIL-006 | Al recordar un archivo | Memory conserva referencia relevante, no todo archivo automáticamente | Relevancia limita permanencia |
| BR-FIL-007 | Al interpretar un archivo con IA | Debe existir autorización y distinguirse el derivado | La interpretación no reemplaza el archivo |
| BR-FIL-008 | Al crear una versión conceptual | Se requiere confirmación de la relación | Una versión posterior no reescribe la anterior |
| BR-FIL-009 | Al eliminar un archivo | La ausencia posterior no modifica hechos ocurridos | El contenido puede desaparecer sin falsificar historia |
| BR-FIL-010 | Al revocar acceso | La disponibilidad o copia local no mantiene permisos | Authorization limita acceso futuro |

**Condicionado:** recursos propietarios habilitados, versiones, múltiples relaciones y tratamiento de audio permanecen pendientes.

---

## 16. Offline First

Fuente principal: documento 14.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-OFF-001 | Ante cualquier estado de conectividad | Debe distinguirse conectividad de resultado funcional | Estar conectado no garantiza éxito |
| BR-OFF-002 | Al estar sin conexión | Ping conserva utilidad dentro de límites explícitos | No se promete disponibilidad total |
| BR-OFF-003 | Al registrar una intención local | No debe presentarse como hecho confirmado | Intención y confirmación permanecen separadas |
| BR-OFF-004 | Al existir información local | No debe asumirse vigente o autorizada indefinidamente | Local no significa actual ni permitido |
| BR-OFF-005 | Al mostrar una acción pendiente | Debe declararse su estado real | El usuario no cree que fue aplicada |
| BR-OFF-006 | Al presentar una acción | No debe mostrarse como aceptada | Envío y aceptación se distinguen |
| BR-OFF-007 | Ante resultado desconocido | No debe mostrarse como éxito, rechazo ni sincronizado | La incertidumbre permanece visible |
| BR-OFF-008 | Al preparar una transición sensible de Commitment | No se considera definitiva sin confirmación autorizada | Resolución, reasignación o cambio de estado siguen pendientes |
| BR-OFF-009 | Al utilizar IA con contexto local | Debe distinguirse contexto confirmado, pendiente y desactualizado | La IA no afirma confirmaciones inexistentes |
| BR-OFF-010 | Al buscar sin conexión | La ausencia de resultado no prueba inexistencia | Search declara alcance local |
| BR-OFF-011 | Al asociar o eliminar un File localmente | No debe mostrarse como acción confirmada | El archivo conserva estado pendiente |
| BR-OFF-012 | Al recuperar conexión | Deben revisarse autorización, contexto, pendientes y resultados | Conectarse no acepta automáticamente acciones |

**Invariante:** la continuidad del usuario no puede depender de fingir consistencia.

---

## 17. Synchronization

Fuente principal: documento 15.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-SYN-001 | Al relacionar cambios | Deben conservarse identidad y procedencia | La intención no se reescribe |
| BR-SYN-002 | Al presentar una acción | Presentada no significa recibida | El estado refleja lo conocido |
| BR-SYN-003 | Al recibir una acción | Recibida no significa aceptada | Sólo aceptación produce el cambio |
| BR-SYN-004 | Al aceptar una acción | Debe existir validación de dominio y autorización vigente | El cambio puede presentarse como confirmado |
| BR-SYN-005 | Al rechazar una acción | Deben conservarse intención, recurso y motivo conocido | El cambio solicitado no se aplica |
| BR-SYN-006 | Ante resultado desconocido | No se repite ni concluye silenciosamente | Se evita duplicación y falsedad |
| BR-SYN-007 | Ante varias representaciones de la misma acción | Deben reconciliarse como un solo resultado | No se duplican mensajes, compromisos o Events |
| BR-SYN-008 | Ante acciones parecidas | No deben fusionarse sin evidencia | La ambigüedad permanece visible |
| BR-SYN-009 | Al ordenar cambios | Deben distinguirse intención, presentación, recepción, confirmación y conocimiento | No se inventa cronología |
| BR-SYN-010 | Al relacionar cambios | El orden temporal no demuestra causalidad | Sólo dependencias comprobables gobiernan aplicación |
| BR-SYN-011 | Si una dependencia dejó de existir | La acción no se aplica fuera de contexto | Se rechaza, queda no aplicable o requiere revisión |
| BR-SYN-012 | Ante conflicto relevante | No debe resolverse silenciosamente | Se aplica regla aprobada o se solicita decisión |
| BR-SYN-013 | Ante varios dispositivos | Cada cambio conserva procedencia y autorización | El dispositivo más reciente no se vuelve verdad automática |
| BR-SYN-014 | Al mostrar “Sincronizado” | Debe existir alcance comprensible y no haber incertidumbre relevante dentro de él | No se ocultan pendientes o resultados desconocidos |

**Condicionado:** prioridades, reintentos, orden operativo y resolución concreta de conflictos permanecen pendientes.

---

## 18. Audit & Traceability

Fuente principal: documento 16.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-AUD-001 | Al conservar evidencia | Debe ser relevante, proporcional y autorizada | Audit no registra toda actividad |
| BR-AUD-002 | Ante una acción inválida | La evidencia no la vuelve válida | Puede demostrarse intento o rechazo sin aplicar cambio |
| BR-AUD-003 | Ante ausencia de evidencia | No debe concluirse que nada ocurrió | La reconstrucción limita su afirmación |
| BR-AUD-004 | Al crear una traza | No debe reemplazar el hecho ni la fuente | Traceability conserva relaciones |
| BR-AUD-005 | Al reconstruir una acción | Debe distinguir intención, intento, recepción, decisión, rechazo y resultado | La historia es comprensible |
| BR-AUD-006 | Al atribuir un actor | Debe existir identidad suficiente o declararse desconocida | No se inventa autoría |
| BR-AUD-007 | Al utilizar IA | Deben relacionarse fuente, derivación y decisión humana | La IA no aparece como autoridad |
| BR-AUD-008 | Al corregir información | La corrección se relaciona con evidencia anterior | No se borra silenciosamente el estado previo |
| BR-AUD-009 | Al eliminar contenido | Puede conservarse evidencia mínima autorizada sin conservar el contenido | Historia y Privacy coexisten |
| BR-AUD-010 | Al revocar acceso | La evidencia visible debe respetar el nuevo alcance | Audit no evita revocación |
| BR-AUD-011 | Ante varios intentos de una acción | Pueden conservarse intentos sin multiplicar el hecho | Evidencia y Event se distinguen |
| BR-AUD-012 | Al reconstruir históricamente | Deben reconocerse vacíos, temporalidad e incertidumbre | Ping no inventa información faltante |

**Invariante:** Traceability relaciona origen, contexto, transformación y resultado; no crea permisos ni propiedad.

---

## 19. Lenguaje ubicuo y estados funcionales

Fuente principal: documento 18.

| ID | Condición | Regla | Resultado esperado |
|---|---|---|---|
| BR-LAN-001 | Al nombrar una propuesta | No debe llamarse compromiso | El lenguaje conserva estado previo a confirmación |
| BR-LAN-002 | Al nombrar un avance | No debe llamarse resolución | Evolución y cierre permanecen separados |
| BR-LAN-003 | Al nombrar una persona | No debe llamarse usuario salvo que use Ping | People conserva terceros no registrados |
| BR-LAN-004 | Al nombrar un responsable | No debe confundirse con propietario | Función y propiedad permanecen separadas |
| BR-LAN-005 | Al nombrar una derivación | No debe llamarse fuente | Procedencia permanece clara |
| BR-LAN-006 | Al nombrar una acción recibida | No debe llamarse aceptada | Synchronization conserva estados |
| BR-LAN-007 | Al nombrar acceso | No debe confundirse con propósito | Privacy sigue aplicando |
| BR-LAN-008 | Al nombrar un Attachment | Debe distinguirse de File en lenguaje interno | Contenido y relación permanecen separados |
| BR-LAN-009 | Al nombrar “Sincronizado” | Debe expresarse alcance y estado real | No se presenta certeza global |
| BR-LAN-010 | Al nombrar eliminación | No debe afirmarse inexistencia histórica | La historia no se reescribe |

**Criterio de validación:** los textos visibles e internos deben nombrar exactamente lo que Ping sabe, lo que el usuario decidió y lo que ocurrió.

---

## 20. Interacción y precedencia de reglas

Cuando varias reglas aplican al mismo caso:

1. **Authorization** limita si la acción puede evaluarse.
2. **Privacy** limita propósito, información y uso, incluso con acceso.
3. **Dominio propietario** decide si la transición es válida.
4. **Confirmación del usuario** se exige cuando la acción la requiere.
5. **Events** registra el hecho relevante después de ocurrir.
6. **Audit & Traceability** conserva evidencia proporcional.
7. **Memory** puede recordar únicamente lo relevante y autorizado.
8. **Notifications** puede comunicar sin cambiar el resultado.
9. **Search y Retrieval** pueden localizar y recuperar sin ampliar alcance.

Esta secuencia es conceptual, no un algoritmo ni orden técnico.

Una regla más específica puede aclarar una regla general, pero no puede:

- ampliar permisos;
- reducir Privacy;
- eliminar procedencia;
- convertir una propuesta en hecho;
- ocultar incertidumbre;
- reescribir historia.

---

## 21. Políticas configurables futuras

Los siguientes asuntos pueden convertirse en políticas sólo después de una decisión aprobada:

- umbrales de proximidad y atraso;
- prioridad de notificaciones;
- frecuencia de comunicaciones;
- período de vigencia;
- selección de recuerdos;
- conservación y eliminación;
- alcance local sin conexión;
- cantidad de acciones pendientes;
- tratamiento de varios dispositivos;
- orden de procesamiento;
- reintentos;
- presentación de conflictos;
- criterios de Search;
- cantidad de contexto de Retrieval;
- disponibilidad de archivos;
- alcance de exportación;
- evidencia auditable.

Una política configurable:

- debe operar dentro de las invariantes;
- no puede conceder permisos;
- no puede convertir incertidumbre en certeza;
- no puede cambiar el significado de los estados;
- debe tener propósito y alcance;
- debe ser explicable cuando afecte al usuario.

---

## 22. Reglas condicionadas por decisiones pendientes

Las siguientes condiciones no son funcionalidades aprobadas:

1. **Colaboración básica:** las reglas de participantes, historia anterior y propiedad compartida sólo aplican si se habilita.
2. **Cancelación de Commitment:** no existe estado oficial hasta definir significado, condiciones y resultado.
3. **Delegación:** no existe como permiso del MVP hasta ser aprobada.
4. **Versiones de Files:** sólo aplican si la capacidad se habilita y el usuario confirma la relación.
5. **Múltiples relaciones de File:** no deben asumirse.
6. **Audio como File:** su clasificación conceptual continúa pendiente.
7. **Estados de Notification:** lectura, atención y descarte no son estados oficiales.
8. **Uso de IA sin conexión:** no debe asumirse disponible.
9. **Resolución automática de conflictos:** no está autorizada.
10. **Consentimiento:** debe definirse por propósito cuando corresponda.
11. **Retención:** no existen períodos concretos aprobados.
12. **Exportación:** no existe alcance funcional definitivo.
13. **Búsquedas sensibles auditables:** todavía requieren definición.
14. **Nombre de Memory:** `Memory Foundation` y `Memory Domain` requieren decisión terminológica.
15. **Vocabulario visible de sincronización:** recepción, confirmación y resultado desconocido requieren validación.

Hasta resolver estas decisiones, cualquier comportamiento debe elegir la alternativa que no amplíe alcance ni simule aprobación.

---

## 23. Escenarios de validación cruzada

### Escenario 1: mensaje con posible compromiso

- Conversation conserva el mensaje.
- IA puede proponer un compromiso.
- El usuario confirma o rechaza.
- Commitment sólo nace tras confirmación.
- Event representa la creación confirmada.
- Audit relaciona fuente, propuesta y decisión.

Reglas verificadas: BR-CON-003, BR-CON-005, BR-COM-001, BR-COM-002, BR-AI-002, BR-EVT-003, BR-AUD-005.

### Escenario 2: avance sin resolución

- El usuario registra un avance.
- Commitment conserva evolución.
- El compromiso continúa abierto si no existe resolución.
- Memory puede recuperar el avance con contexto.

Reglas verificadas: BR-COM-006, BR-COM-007, BR-COM-008, BR-MEM-003.

### Escenario 3: referencia de persona ambigua

- People conserva una referencia incompleta.
- IA sugiere una coincidencia.
- No existe fusión automática.
- El usuario decide cuando corresponda.

Reglas verificadas: BR-PEO-003, BR-PEO-004, BR-PEO-005, BR-AI-007.

### Escenario 4: acción offline rechazada por revocación

- Offline First conserva la intención.
- Authorization conoce posteriormente una revocación.
- Synchronization evalúa con el alcance vigente.
- La acción se rechaza.
- Audit conserva evidencia proporcional.

Reglas verificadas: BR-OFF-003, BR-OFF-012, BR-AUP-007, BR-SYN-004, BR-SYN-005, BR-AUD-002.

### Escenario 5: archivo eliminado

- File estaba asociado a Commitment.
- Una eliminación autorizada retira contenido.
- Event reconoce la eliminación.
- Audit conserva evidencia mínima.
- Privacy impide conservación ilimitada.

Reglas verificadas: BR-FIL-001, BR-FIL-009, BR-EVT-006, BR-AUD-009, BR-AUP-015.

### Escenario 6: búsqueda sin permiso

- Search recibe una consulta.
- Authorization excluye un recurso.
- No aparece resultado, fragmento, conteo ni señal.
- Retrieval no recupera contexto indirecto.

Reglas verificadas: BR-SR-001, BR-SR-003, BR-SR-005, BR-AUP-001.

### Escenario 7: acción recibida con resultado desconocido

- La acción se presenta y se recibe.
- No existe aceptación conocida.
- La interfaz no muestra Confirmado ni Sincronizado.
- Repetir no crea duplicados.

Reglas verificadas: BR-SYN-002, BR-SYN-003, BR-SYN-006, BR-SYN-007, BR-LAN-006, BR-LAN-009.

### Escenario 8: corrección de una inferencia de IA

- IA produce una derivación con fuentes.
- El usuario la corrige.
- People o Memory considera la corrección.
- Audit conserva la relación relevante.
- El derivado incorrecto deja de usarse como vigente.

Reglas verificadas: BR-AI-001, BR-AI-004, BR-AI-012, BR-PEO-006, BR-MEM-008, BR-AUD-008, BR-AUP-016.

---

## 24. Criterios de aceptación

El conjunto de reglas se considera correctamente consolidado cuando:

1. Cada regla expresa una condición funcional verificable.
2. Las reglas no redefinen los conceptos del glosario.
3. Conversation conserva mensajes y procedencia.
4. Commitment sólo nace por confirmación.
5. Avance y resolución permanecen separados.
6. People no infiere ni fusiona identidades automáticamente.
7. Memory conserva relevancia, no todo.
8. La IA no crea, confirma ni modifica recursos por iniciativa propia.
9. Authorization limita toda acción protegida.
10. Privacy sigue aplicando aunque exista acceso.
11. Events representa hechos, no intenciones.
12. Notifications comunica sin probar conocimiento.
13. Search y Retrieval no amplían permisos.
14. Files no existe conceptualmente aislado.
15. Offline First no finge confirmación.
16. Synchronization distingue recepción de aceptación.
17. Los resultados desconocidos permanecen visibles.
18. Los conflictos relevantes no se resuelven silenciosamente.
19. Audit no vuelve válida una acción inválida.
20. Las correcciones no borran historia sin trazabilidad.
21. El lenguaje ubicuo conserva diferencias conceptuales.
22. Las decisiones pendientes no se presentan como reglas vigentes.
23. Las políticas futuras permanecen dentro de invariantes.
24. No se introducen mecanismos técnicos.
25. Las reglas son coherentes con los documentos 00 al 18.

---

## 25. Decisiones pendientes

Este documento consolida, pero no resuelve, las decisiones pendientes de los documentos anteriores.

Antes de implementar políticas o capacidades condicionadas debe definirse:

1. segmento y alcance de la primera beta;
2. colaboración básica;
3. propiedad y acciones en recursos compartidos;
4. cancelación de compromisos;
5. delegación;
6. estados visibles definitivos;
7. criterios de relevancia y prioridad;
8. selección, permanencia y eliminación de Memory;
9. capacidades de IA sin conexión;
10. reglas de conflictos y duplicados;
11. alcance de múltiples dispositivos;
12. recursos y acciones disponibles offline;
13. versiones y disponibilidad de Files;
14. tratamiento conceptual del audio;
15. criterios de Search y contexto de Retrieval;
16. lecturas, búsquedas y recuperaciones sensibles;
17. evidencia auditable;
18. privacidad, consentimiento y conservación;
19. corrección, eliminación y exportación;
20. vocabulario visible definitivo.

Cada decisión aprobada deberá:

- identificar las reglas afectadas;
- conservar compatibilidad con invariantes;
- actualizar el lenguaje ubicuo si cambia un término;
- evitar decisiones técnicas prematuras;
- quedar trazable.

---

## 26. Resumen

Las reglas de negocio de Ping protegen el significado del producto.

Conversation conserva conversaciones y mensajes con procedencia. Commitment sólo nace tras confirmación, mantiene responsable y no confunde avance con resolución. People representa identidades y relaciones sin inferir perfiles. Memory recuerda lo relevante sin sustituir fuentes.

La IA propone y explica, pero no decide ni modifica por iniciativa propia. Authorization limita acciones. Privacy limita propósito y uso. Events representa hechos. Notifications comunica. Search localiza y Retrieval recupera sin ampliar permisos. Files pertenece a recursos.

Offline First protege intención sin fingir confirmación. Synchronization distingue presentación, recepción, aceptación, rechazo y resultado desconocido. Audit conserva evidencia proporcional y Traceability relaciona origen con resultado.

El lenguaje ubicuo debe nombrar el estado real.

La regla consolidada fundamental es:

> Ping nunca debe convertir una propuesta, inferencia, intención, recepción o representación local en un hecho confirmado sin la decisión, autorización y validación de dominio que correspondan.
