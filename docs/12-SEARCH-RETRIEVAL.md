# Ping — Búsqueda y Recuperación

Este documento define oficialmente el modelo conceptual de Search y Retrieval de Ping para el MVP.

Search permite localizar información existente. Retrieval permite recuperar esa información con contexto, procedencia y autorización suficientes para comprenderla.

## 1. Propósito

El propósito de Search y Retrieval es ayudar al usuario a encontrar información que ya existe y volver a ella sin perder el contexto que le da significado.

El modelo debe permitir al usuario:

- localizar conversaciones, mensajes y capturas autorizadas;
- localizar compromisos;
- consultar pendientes por persona;
- consultar asuntos por fecha;
- consultar compromisos por conversación;
- encontrar compromisos abiertos, próximos, atrasados o resueltos;
- recuperar seguimientos, avances y resultados;
- volver a la fuente;
- comprender por qué existe un asunto;
- conservar autorización y procedencia.

Search reduce el espacio de información. Retrieval convierte una ubicación encontrada en información comprensible.

## 2. Qué es Search

Search es la capacidad de localizar información existente mediante criterios comprensibles.

Search puede:

- localizar;
- filtrar;
- ordenar;
- encontrar;
- limitar resultados por recurso;
- limitar resultados por persona;
- limitar resultados por fecha;
- limitar resultados por conversación;
- limitar resultados por estado o condición confirmada;
- devolver referencias a recursos autorizados.

El resultado de Search indica qué recursos coinciden con los criterios permitidos.

Search no necesita recuperar todo el contexto para establecer que un recurso autorizado coincide. La comprensión completa corresponde a Retrieval.

## 3. Qué es Retrieval

Retrieval es la capacidad de recuperar un recurso localizado junto con la información autorizada necesaria para comprenderlo.

Retrieval puede:

- obtener el recurso desde su dominio propietario;
- recuperar la fuente;
- recuperar contexto;
- conservar procedencia;
- conservar autorización;
- recuperar personas relacionadas;
- recuperar fechas y responsables;
- recuperar seguimiento, avances y resultado;
- distinguir información original, confirmada, derivada e incierta;
- permitir volver al origen.

Retrieval no sólo devuelve “Llamar a Juan”.

Debe permitir comprender algo equivalente a:

> “Llamar a Juan por la cotización comentada ayer en la conversación del proyecto”.

## 4. Qué no son

Search no:

- interpreta;
- resume;
- recuerda;
- decide relevancia permanente;
- concede permisos;
- modifica recursos;
- crea información;
- corrige fuentes;
- confirma identidades;
- confirma compromisos;
- inventa criterios;
- amplía una consulta por inferencia.

Retrieval no:

- inventa contexto;
- reemplaza la fuente;
- elimina información relevante para comprender;
- modifica el resultado encontrado;
- cambia estados;
- corrige historia;
- fusiona personas;
- fusiona recuerdos;
- concede permisos;
- convierte una inferencia en hecho.

Search no es Memory.

Memory no es Search.

Retrieval no es un resumen. Una explicación derivada puede acompañar una recuperación, pero debe distinguirse del recurso y su fuente.

## 5. Principios

**Localizar antes que interpretar**

Search utiliza criterios explícitos para encontrar información existente.

**Contexto antes que resultados aislados**

Retrieval debe permitir comprender por qué el recurso es relevante.

**Fuente preservada**

El recurso recuperado mantiene relación con su origen.

**Autorización en cada paso**

Tanto localizar como recuperar requieren permiso vigente.

**Mínimo privilegio**

Sólo se expone la información necesaria que el usuario puede consultar.

**Dominios propietarios**

Conversation, Commitment y People siguen siendo responsables de su información.

**Memoria distinta de búsqueda**

Memory conserva capacidad de recordar información relevante; Search sólo localiza información existente.

**IA como ayuda**

La IA puede proponer una formulación de consulta, pero no cambia el conjunto autorizado de resultados.

**Incertidumbre visible**

Si un criterio, una persona o una fecha es ambigua, la búsqueda no debe fingir precisión.

## 6. Recursos recuperables

Search puede localizar y Retrieval puede recuperar, dentro de la autorización aplicable:

**Recursos de Conversation**

- conversaciones;
- mensajes;
- capturas de texto;
- capturas de audio;
- contexto conversacional;
- archivos asociados cuando la capacidad esté habilitada;
- referencias de procedencia.

**Recursos de Commitment**

- compromisos confirmados;
- responsables;
- fechas o plazos;
- estados y condiciones;
- prioridades cuando corresponda;
- seguimientos;
- respuestas;
- avances;
- resultados;
- eventos y cambios relevantes.

**Recursos de People**

- personas;
- referencias de personas;
- relaciones autorizadas;
- contexto por persona;
- funciones dentro de compromisos.

**Recursos de Memory**

- recuerdos relevantes;
- referencias a fuentes;
- relaciones recuperables;
- contexto autorizado.

**Recursos de Events**

- hechos relevantes de un recurso;
- secuencia autorizada;
- correcciones posteriores;
- procedencia temporal.

Una notificación puede orientar al usuario hacia un recurso recuperable, pero no sustituye ese recurso. La búsqueda específica de notificaciones no forma parte de los casos obligatorios definidos.

## 7. Criterios de búsqueda

Los criterios del MVP se derivan de información confirmada y autorizada.

**Por persona**

Permite localizar asuntos relacionados con una persona reconocible o una referencia todavía incompleta, sin mezclar identidades ambiguas.

**Por fecha**

Permite localizar asuntos por fecha de origen, fecha o plazo confirmado, seguimiento o resolución, según el criterio explícito.

**Por conversación**

Permite localizar compromisos y asuntos vinculados con una conversación autorizada.

**Por estado o condición del compromiso**

Permite distinguir compromisos abiertos, próximos, atrasados, en seguimiento y resueltos.

**Por responsable**

Permite localizar compromisos según la persona confirmada de quien se espera una acción, respuesta, revisión o decisión.

**Por tipo de recurso**

Permite limitar la búsqueda a conversaciones, mensajes, compromisos, personas, recuerdos o eventos autorizados.

**Por procedencia**

Permite localizar información vinculada con una fuente identificable.

**Por relación entre criterios**

El usuario puede acotar una consulta mediante más de un criterio confirmado, sin que Search invente relaciones.

El orden puede ayudar a presentar primero lo más cercano en tiempo, lo que requiere atención o lo que mejor coincide con los criterios explícitos. Las reglas oficiales de orden y combinación quedan pendientes.

## 8. Contexto recuperado

Retrieval debe devolver suficiente contexto para que el usuario reconozca el asunto.

Según el recurso, puede incluir:

- descripción confirmada;
- conversación y mensaje de origen;
- fecha de origen;
- fecha o plazo;
- propietario;
- responsable;
- personas relacionadas;
- estado o condición;
- prioridad cuando corresponda;
- seguimiento;
- avances;
- cambios relevantes;
- resultado;
- procedencia;
- autorización aplicable;
- distinción entre fuente e información derivada;
- incertidumbre pendiente.

El contexto recuperado debe:

- ser relevante para comprender;
- provenir de fuentes autorizadas;
- conservar la relación con cada dominio;
- evitar una presentación engañosa por omisión;
- reconocer cuando falta información;
- permitir volver al origen cuando existe permiso.

Si parte del contexto no puede recuperarse por falta de autorización o porque la fuente ya no está disponible, Retrieval debe reconocer la limitación. No puede completar el vacío mediante invención.

## 9. Relación con Conversation

Conversation conserva:

- conversaciones;
- participantes;
- mensajes;
- capturas;
- secuencia;
- archivos o audios asociados cuando corresponda;
- contexto conversacional;
- procedencia.

Search puede localizar recursos de Conversation sólo cuando el usuario puede consultarlos.

Retrieval solicita a Conversation:

- el recurso original;
- mensajes de contexto autorizados;
- origen;
- participantes comprensibles;
- secuencia necesaria;
- referencias relacionadas.

Search y Retrieval no:

- copian toda conversación;
- cambian mensajes;
- alteran participantes;
- exponen conversaciones privadas;
- convierten una conversación en recuerdo;
- sustituyen la fuente por una descripción.

Conversation sigue siendo propietaria de su información.

## 10. Relación con Commitment

Commitment conserva:

- compromisos;
- propietario;
- responsable;
- personas relacionadas;
- origen;
- descripción;
- fecha o plazo;
- estado;
- prioridad;
- seguimiento;
- avances;
- resultado;
- historial relevante.

Search puede localizar compromisos por:

- persona;
- fecha;
- conversación;
- estado o condición;
- responsable;
- procedencia.

Retrieval obtiene desde Commitment:

- situación confirmada;
- contexto;
- evolución relevante;
- resultado;
- relación con la fuente.

Search y Retrieval no:

- crean compromisos;
- cambian estados;
- asignan responsables;
- registran seguimiento;
- resuelven asuntos;
- modifican resultados.

Commitment sigue siendo propietario de su información y ciclo de vida.

## 11. Relación con People

People conserva:

- identidad;
- referencias;
- representaciones comprensibles;
- relaciones desde la perspectiva del usuario;
- ambigüedad;
- contexto autorizado por persona.

Search utiliza People para:

- acotar asuntos por persona;
- distinguir referencias confirmadas;
- evitar mezclar identidades parecidas;
- localizar relaciones autorizadas.

Retrieval utiliza People para presentar:

- quién está relacionado;
- quién es responsable;
- qué función cumple una persona;
- qué ambigüedad permanece.

Search y Retrieval no:

- confirman identidad;
- fusionan personas;
- inventan datos;
- amplían relaciones;
- convierten una coincidencia en permiso;
- presentan la identidad técnica como modelo mental.

People sigue siendo propietario de identidad y relaciones.

## 12. Relación con Memory

Memory conserva la capacidad de recordar información relevante con contexto y procedencia.

Search:

- localiza recursos existentes;
- aplica criterios;
- devuelve referencias autorizadas;
- no decide qué debe recordarse;
- no crea recuerdos.

Retrieval:

- recupera recursos y contexto;
- puede utilizar referencias de Memory;
- no convierte automáticamente lo recuperado en recuerdo;
- no decide permanencia.

Memory puede ayudar a identificar qué información relevante debe poder recuperarse, pero no sustituye los criterios de Search ni la fuente entregada por Retrieval.

Una búsqueda puede localizar un Memory Item y luego recuperar su fuente autorizada.

Realizar una búsqueda o recuperación no convierte por sí solo el resultado en memoria permanente.

## 13. Relación con IA

La IA puede ayudar al usuario a formular una consulta.

Puede proponer:

- criterios explícitos;
- una persona posiblemente mencionada;
- una fecha posiblemente relevante;
- un tipo de recurso;
- una reformulación comprensible;
- una aclaración cuando la consulta es ambigua.

La propuesta de IA:

- permanece derivada;
- conserva incertidumbre;
- no amplía el alcance;
- no cambia permisos;
- no altera los recursos encontrados;
- no reordena silenciosamente los resultados;
- no elimina resultados autorizados;
- no inventa contexto.

Search ejecuta los criterios aceptados y devuelve el conjunto autorizado.

Retrieval recupera los recursos desde sus dominios.

Si la IA resume o explica los resultados, esa salida es una ayuda derivada y no forma parte de Search ni sustituye Retrieval.

## 14. Relación con Authorization

Authorization limita toda búsqueda y toda recuperación.

Antes de localizar:

- el usuario debe estar autorizado para conocer el recurso;
- no debe exponerse la existencia de información privada;
- una relación no debe ampliar el alcance;
- una referencia anterior no debe evitar una revocación.

Antes de recuperar:

- debe comprobarse la autorización vigente;
- el contexto debe aplicar mínimo privilegio;
- cada fuente mantiene su protección;
- sólo puede mostrarse lo que el usuario puede consultar.

Poder buscar un tipo de recurso no concede acceso a todos sus elementos.

Poder localizar una referencia no concede acceso al contenido.

Compartir un compromiso no permite recuperar conversaciones privadas no relacionadas.

La IA recibe el mismo conjunto autorizado, nunca uno mayor.

## 15. Relación con Events

Events conserva hechos significativos, secuencia, procedencia y temporalidad.

Search puede localizar eventos autorizados por:

- recurso;
- persona relacionada;
- momento;
- tipo de hecho;
- procedencia.

Retrieval puede obtener una secuencia relevante para comprender:

- origen;
- confirmación;
- cambios;
- seguimientos;
- avances;
- correcciones;
- resolución;
- resultado.

Search no interpreta el significado histórico.

Retrieval no reordena ni modifica eventos.

Los resultados de una búsqueda no son eventos.

La realización de una búsqueda o recuperación no se convierte automáticamente en evento relevante ni en memoria permanente. Esa decisión permanece pendiente.

## 16. Temporalidad

Search puede utilizar criterios temporales confirmados.

Debe distinguir:

- momento de origen;
- momento de un evento;
- fecha o plazo del compromiso;
- momento de seguimiento;
- momento de avance;
- momento de resolución;
- período solicitado por el usuario.

Retrieval debe conservar la temporalidad necesaria para comprender la evolución.

No debe:

- confundir fecha de origen con plazo;
- presentar una fecha propuesta como confirmada;
- inventar precisión;
- alterar la cronología;
- ocultar correcciones posteriores.

Cuando una fecha sea ambigua, Search debe solicitar un criterio más claro o mantener la ambigüedad. Retrieval debe presentar la incertidumbre disponible.

Las reglas predeterminadas de período y orden temporal quedan pendientes.

## 17. Reglas e invariantes

1. Search localiza.
2. Search filtra.
3. Search ordena.
4. Search encuentra.
5. Retrieval recupera.
6. Retrieval contextualiza.
7. Retrieval conserva procedencia.
8. Retrieval conserva autorización.
9. Search nunca interpreta.
10. Search nunca resume.
11. Search nunca recuerda.
12. Search nunca concede permisos.
13. Search nunca modifica recursos.
14. Search no crea información.
15. Retrieval nunca inventa contexto.
16. Retrieval nunca reemplaza la fuente.
17. Retrieval nunca elimina información relevante para comprender.
18. Retrieval nunca modifica el resultado encontrado.
19. Retrieval no cambia estados.
20. Retrieval no corrige historia.
21. Memory no es Search.
22. Search no es Memory.
23. Buscar no crea un recuerdo.
24. Recuperar no crea un recuerdo.
25. Conversation conserva conversaciones y mensajes.
26. Commitment conserva compromisos y su ciclo de vida.
27. People conserva identidad y relaciones.
28. Memory conserva información relevante.
29. Authorization limita toda búsqueda.
30. Authorization limita toda recuperación.
31. Ninguna búsqueda expone la existencia de recursos no autorizados.
32. Cada fuente mantiene su protección.
33. Una relación no amplía resultados autorizados.
34. La IA puede ayudar a formular consultas.
35. La IA no altera el conjunto autorizado de resultados.
36. Una explicación de IA permanece derivada.
37. Search utiliza criterios explícitos.
38. Retrieval reconoce contexto incompleto.
39. La incertidumbre no se reemplaza con invención.
40. Los resultados conservan temporalidad y procedencia.

## 18. Casos de uso del MVP

**Consultar pendientes por persona**

Search localiza compromisos autorizados relacionados con una persona y Retrieval devuelve contexto suficiente para comprenderlos.

**Consultar por fecha**

Search localiza compromisos según fechas o plazos confirmados y Retrieval conserva su significado temporal.

**Consultar por conversación**

Search localiza compromisos vinculados con una conversación autorizada y Retrieval permite volver al origen.

**Consultar compromisos abiertos**

Search filtra compromisos que todavía requieren atención.

**Consultar compromisos próximos**

Search localiza compromisos que se acercan a una fecha confirmada.

**Consultar compromisos atrasados**

Search localiza asuntos que superaron su plazo sin resolución.

**Consultar compromisos resueltos**

Search localiza asuntos cerrados y Retrieval recupera su resultado.

**Recuperar un compromiso**

Retrieval entrega descripción, responsable, estado, contexto, procedencia y evolución relevante.

**Recuperar el mensaje de origen**

Retrieval obtiene desde Conversation la fuente que el usuario puede consultar.

**Recuperar seguimiento y avances**

Retrieval permite comprender qué ocurrió después de la creación.

**Recuperar resultado**

Retrieval permite comprender cómo terminó el asunto.

**Formular una consulta con ayuda de IA**

La IA propone criterios comprensibles sin ampliar permisos ni modificar resultados.

## 19. API conceptual

La API conceptual describe capacidades y resultados de negocio. No define decisiones técnicas.

**Definir criterios**

Resultado esperado: la consulta expresa qué recurso, persona, fecha, conversación, estado o procedencia busca el usuario.

**Localizar recursos**

Resultado esperado: Search devuelve referencias que coinciden y que el usuario puede conocer.

**Filtrar resultados**

Resultado esperado: el conjunto se limita según criterios explícitos sin modificar los recursos.

**Ordenar resultados**

Resultado esperado: las referencias se presentan mediante una regla comprensible sin cambiar su contenido.

**Buscar por persona**

Resultado esperado: se localizan sólo asuntos autorizados relacionados con la referencia correcta o se mantiene la ambigüedad.

**Buscar por fecha**

Resultado esperado: se localizan recursos según la dimensión temporal explícita.

**Buscar por conversación**

Resultado esperado: se localizan compromisos y asuntos vinculados con una conversación autorizada.

**Buscar por situación del compromiso**

Resultado esperado: se distinguen compromisos abiertos, próximos, atrasados, en seguimiento o resueltos.

**Recuperar un recurso**

Resultado esperado: el dominio propietario entrega el recurso autorizado sin modificación.

**Recuperar contexto**

Resultado esperado: se obtiene información suficiente, autorizada y con procedencia para comprender.

**Recuperar la fuente**

Resultado esperado: el usuario alcanza el origen que mantiene permiso para consultar.

**Recuperar evolución**

Resultado esperado: se presentan eventos, seguimientos, avances, correcciones y resultado relevantes en secuencia.

**Reconocer una limitación**

Resultado esperado: se indica que falta contexto o autorización sin inventar información.

**Proponer criterios mediante IA**

Resultado esperado: el usuario recibe una formulación derivada que no altera el resultado autorizado.

## 20. Criterios de aceptación

El modelo se considera definido correctamente para el MVP cuando:

1. Search se define como localización de información existente.
2. Retrieval se define como recuperación contextualizada.
3. Search puede localizar, filtrar, ordenar y encontrar.
4. Retrieval conserva contexto, procedencia y autorización.
5. Search no interpreta ni resume.
6. Search no recuerda.
7. Search no modifica recursos.
8. Retrieval no inventa contexto.
9. Retrieval no reemplaza la fuente.
10. Retrieval no modifica el resultado.
11. Search y Memory se mantienen separados.
12. Conversation conserva conversaciones y mensajes.
13. Commitment conserva compromisos y ciclo de vida.
14. People conserva identidad y relaciones.
15. El usuario puede consultar por persona.
16. El usuario puede consultar por fecha.
17. El usuario puede consultar por conversación.
18. El usuario puede localizar compromisos abiertos, próximos, atrasados y resueltos.
19. El usuario puede recuperar origen, seguimiento, avances y resultado.
20. Authorization limita toda búsqueda y recuperación.
21. No se expone la existencia de información no autorizada.
22. La IA sólo ayuda a formular consultas y no altera resultados autorizados.
23. La temporalidad y las correcciones permanecen comprensibles.
24. El modelo se mantiene dentro del significado del negocio.

## 21. Decisiones pendientes

1. Definir qué tipos de recursos serán localizables durante la primera beta además de los casos obligatorios.
2. Definir qué criterios estarán disponibles inicialmente.
3. Definir las reglas oficiales para combinar criterios.
4. Definir la regla predeterminada de orden.
5. Definir cómo se ordenan asuntos que requieren atención frente a resultados recientes.
6. Definir cómo se presenta una persona ambigua en una consulta.
7. Definir qué dimensión temporal se utiliza cuando el usuario sólo indica una fecha.
8. Definir el período predeterminado de una consulta temporal.
9. Definir cuánto contexto conversacional es suficiente para Retrieval.
10. Definir qué eventos son necesarios para recuperar la evolución de un compromiso.
11. Definir cómo se informa que una fuente ya no está disponible.
12. Definir cómo se informa que parte del contexto no puede consultarse.
13. Definir si las notificaciones podrán localizarse como recursos independientes.
14. Definir si las búsquedas o recuperaciones realizadas constituyen eventos relevantes.
15. Definir si una búsqueda o recuperación puede influir en Memory y bajo qué confirmación.
16. Definir el alcance inicial de las consultas por persona cuando existan contactos y usuarios registrados.
17. Definir cómo el usuario revisa o corrige criterios propuestos por IA.
18. Definir qué ocurre cuando una formulación de IA es ambigua.
19. Definir cómo se evita que una explicación derivada oculte resultados autorizados.
20. Definir qué información mínima hace comprensible cada tipo de resultado.

Hasta resolver estas decisiones, no deben asumirse criterios, orden, contexto adicional, relaciones ni alcance por inferencia.

## 22. Resumen

Search localiza información existente.

Retrieval recupera la información localizada con contexto, procedencia y autorización.

La regla de Search es:

> Localiza, filtra, ordena y encuentra sin interpretar ni modificar.

La regla de Retrieval es:

> Recupera desde la fuente y conserva el contexto necesario para comprender.

La regla de autorización es:

> Ninguna búsqueda ni recuperación expone información que el usuario no puede consultar.

La regla de separación es:

> Search no es Memory y Memory no es Search.

Conversation conserva conversaciones y mensajes. Commitment conserva compromisos y su ciclo de vida. People conserva identidad y relaciones. Memory conserva la capacidad de recordar información relevante. Events conserva hechos. Search y Retrieval sólo permiten encontrar y comprender esos recursos dentro del alcance autorizado.

La IA puede ayudar a formular criterios, pero no altera el conjunto autorizado de resultados ni sustituye las fuentes.

Su valor consiste en que el usuario pueda encontrar un asunto y comprenderlo sin perder origen, personas, temporalidad, evolución ni permisos.
