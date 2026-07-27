# Ping — Archivos y Adjuntos

Este documento define oficialmente el modelo conceptual de archivos y adjuntos de Ping para el MVP.

Los archivos representan evidencia, soporte o contenido asociado a un recurso del dominio. No constituyen un dominio de negocio independiente y nunca son propietarios de la información.

## 1. Propósito

El propósito de los archivos y adjuntos es permitir que un recurso de Ping conserve evidencia, soporte o contenido necesario para comprender un asunto.

Un archivo puede ayudar al usuario a:

- reconocer el origen de una conversación;
- comprender por qué existe un compromiso;
- conservar evidencia relacionada con un seguimiento;
- apoyar un avance;
- comprender un resultado;
- volver a contenido relevante;
- mantener contexto y procedencia.

El valor del archivo depende de su relación con un recurso autorizado. Fuera de esa relación no tiene significado independiente dentro de Ping.

## 2. Qué es un archivo

Un archivo es contenido identificable asociado conceptualmente con un recurso de Ping.

Puede representar:

- evidencia;
- soporte;
- contenido de origen;
- contenido relacionado;
- información necesaria para comprender un asunto;
- información relevante para un seguimiento;
- información relacionada con un resultado.

Todo archivo posee:

- recurso propietario;
- propietario conceptual derivado de ese recurso;
- procedencia;
- contexto;
- momento de asociación;
- autorización;
- vigencia;
- relación comprensible con el asunto.

El archivo puede contener información, pero no interpreta ni decide qué significa esa información.

## 3. Qué es un adjunto

Un adjunto es la relación conceptual que une un archivo con un recurso.

El adjunto permite comprender:

- a qué recurso pertenece el archivo;
- por qué está asociado;
- quién realizó la asociación cuando corresponda;
- cuándo ocurrió;
- qué contexto la explica;
- qué permisos se aplican;
- si continúa vigente.

Un adjunto no es una copia conceptual del recurso.

Un mismo archivo no debe quedar sin recurso propietario. Si existen referencias desde otros recursos, esas referencias no cambian automáticamente la propiedad original.

La posibilidad de relacionar un archivo con más de un recurso y las reglas para hacerlo quedan como decisión pendiente.

## 4. Qué no son

Un archivo o adjunto no es:

- un dominio de negocio;
- una conversación;
- un mensaje;
- un compromiso;
- una persona;
- un recuerdo;
- un evento;
- una notificación;
- una autorización;
- una interpretación de IA;
- un resultado derivado;
- una decisión;
- una acción.

Un archivo nunca:

- reemplaza una conversación;
- reemplaza un compromiso;
- reemplaza una persona;
- reemplaza un recuerdo;
- reemplaza su procedencia;
- concede permisos;
- ejecuta acciones;
- crea compromisos;
- cambia estados;
- resuelve asuntos;
- toma decisiones.

Un adjunto no adquiere existencia conceptual separada de la relación que representa.

## 5. Principios

**Todo archivo pertenece a un recurso**

No existen archivos aislados dentro del modelo de negocio.

**Contexto antes que acumulación**

Un archivo debe expresar por qué está asociado y para qué ayuda a comprender el asunto.

**Procedencia siempre**

Debe poder identificarse el origen del archivo y de su asociación.

**Propiedad derivada**

El archivo no se posee a sí mismo; su propiedad conceptual proviene del recurso al que pertenece.

**Autorización coherente**

Acceder al archivo requiere permiso sobre el archivo y el contexto que puede mostrarse.

**Fuente antes que interpretación**

La información derivada no sustituye el archivo original.

**Historia preservada**

Una corrección, nueva versión o eliminación no debe afirmar que los hechos anteriores nunca ocurrieron.

**Relevancia antes que permanencia**

Memory sólo recuerda referencias relevantes y no convierte todo archivo en recuerdo.

**Capacidad opcional**

Los archivos asociados no pueden bloquear captura, confirmación, seguimiento ni resolución del MVP.

## 6. Recursos que pueden tener archivos

Los siguientes recursos pueden relacionarse conceptualmente con archivos.

**Conversation**

Una conversación o mensaje puede contener un archivo asociado como parte de su contexto.

**Commitment**

Un compromiso puede contener un archivo como evidencia, soporte de seguimiento, avance o resultado.

**Message o Capture**

Una captura o mensaje puede actuar como origen directo de un archivo.

**Follow-up**

Un seguimiento puede relacionarse con un archivo que ayuda a comprender qué ocurrió.

**Progress**

Un avance puede relacionarse con evidencia o soporte.

**Outcome**

Un resultado puede relacionarse con contenido que ayuda a comprender el cierre.

People puede estar relacionado con archivos a través de conversaciones y compromisos autorizados, pero no convierte a la persona en recurso propietario por la sola relación.

Memory puede recordar referencias relevantes, pero no pasa a ser propietaria del archivo.

Events puede expresar que un archivo fue asociado, corregido, versionado o eliminado, pero el evento no es propietario.

## 7. Propiedad conceptual

Todo archivo tiene un recurso propietario conceptual.

La propiedad determina:

- a qué asunto pertenece;
- quién controla la relación;
- qué autorización se aplica;
- qué contexto puede mostrarse;
- quién puede corregir o eliminar cuando corresponda.

La propiedad no se infiere desde:

- la persona mencionada en el contenido;
- la persona que aparece relacionada;
- el responsable de un compromiso;
- quien puede consultar una conversación;
- una referencia desde Memory;
- una coincidencia sugerida por IA.

La persona que asocia un archivo puede ser parte de su procedencia, pero no necesariamente define por sí sola la propiedad.

En una conversación personal, el archivo asociado pertenece conceptualmente al recurso del usuario.

En una conversación compartida, las reglas completas de propiedad entre conversación, mensaje y participantes no están resueltas.

Un archivo relacionado con un compromiso conserva la propiedad y autorización definidas por el recurso propietario, aunque también tenga una referencia a su origen.

## 8. Relación con Conversation

Conversation puede contener archivos asociados con:

- una conversación;
- un mensaje;
- una captura;
- contexto conversacional.

Conversation conserva:

- recurso de origen;
- participantes autorizados;
- secuencia;
- mensaje o captura relacionada;
- contexto;
- procedencia.

El archivo:

- no reemplaza el mensaje;
- no reemplaza la conversación;
- no cambia participantes;
- no hace pública la conversación;
- no concede acceso a personas mencionadas;
- mantiene controles coherentes con su origen.

Una referencia desde Commitment, Memory o Search no amplía el acceso al archivo conversacional.

Los archivos asociados a Conversation son una capacidad opcional del MVP.

## 9. Relación con Commitment

Commitment puede relacionar archivos con:

- origen del compromiso;
- contexto;
- seguimiento;
- respuesta;
- avance;
- resultado.

El archivo puede ayudar a comprender:

- qué sustenta el asunto;
- qué ocurrió después;
- qué evidencia existe;
- qué cambió;
- cómo se alcanzó el resultado.

Commitment conserva:

- ciclo de vida;
- propietario;
- responsable;
- estado;
- seguimiento;
- avance;
- resolución;
- resultado.

El archivo no:

- confirma el compromiso;
- asigna responsable;
- cambia estado;
- demuestra automáticamente que un avance resolvió el asunto;
- determina el resultado;
- modifica la fuente.

Relacionar un archivo con un compromiso requiere autorización y contexto confirmado.

## 10. Relación con People

People puede relacionar una persona con un archivo mediante:

- participación autorizada en una conversación;
- autoría u origen identificable;
- responsabilidad dentro de un compromiso;
- relación contextual con un seguimiento, avance o resultado.

La relación con una persona:

- no convierte a la persona en propietaria;
- no concede acceso;
- no confirma identidad por el contenido;
- no permite inferir datos adicionales;
- no convierte el archivo en perfil;
- no hace pública la información.

People aporta una representación comprensible de las personas relacionadas.

El archivo no sustituye el contexto de la relación.

Una persona mencionada dentro del contenido no queda automáticamente confirmada ni relacionada.

## 11. Relación con Memory

Memory puede recordar una referencia relevante a un archivo cuando éste ayuda a comprender, seguir o resolver un asunto.

Memory puede conservar conceptualmente:

- referencia al archivo;
- recurso propietario;
- procedencia;
- contexto autorizado;
- relación con conversación, compromiso o persona;
- vigencia;
- ausencia posterior cuando corresponda.

Memory no:

- convierte todos los archivos en recuerdos;
- copia conceptualmente todo el contenido;
- se vuelve propietaria;
- conserva referencias sin procedencia;
- mantiene acceso después de una revocación;
- reemplaza un archivo ausente por una interpretación derivada.

Si el archivo deja de existir, Memory puede conservar que existió una relación relevante dentro de la historia autorizada, sin presentar el contenido como disponible.

La retención de referencias después de una eliminación queda pendiente.

## 12. Relación con IA

La IA puede interpretar contenido de un archivo únicamente cuando:

- el usuario está autorizado;
- el recurso propietario permite el acceso;
- existe un propósito relacionado con recordar, comprender, seguir o resolver;
- se conserva procedencia.

La IA puede producir:

- una interpretación;
- un resumen;
- información extraída;
- una relación sugerida;
- una explicación.

Todo resultado de IA:

- es información derivada;
- se distingue del archivo fuente;
- conserva procedencia;
- expresa incertidumbre;
- no sustituye el contenido original;
- no adquiere permisos adicionales;
- no modifica el archivo;
- no crea hechos permanentes sin confirmación.

La IA no puede inventar el contenido de un archivo ausente, ilegible o no autorizado.

## 13. Relación con Authorization

Authorization determina quién puede:

- conocer que el archivo existe;
- consultar el archivo;
- consultar su contexto;
- relacionarlo con otro recurso;
- utilizarlo mediante IA;
- corregir su relación;
- añadir una versión conceptual;
- eliminarlo cuando corresponda.

Acceder al recurso propietario no siempre implica poder realizar todas las acciones sobre el archivo.

Acceder a una referencia no implica acceder al contenido.

Compartir un compromiso no comparte automáticamente archivos de conversaciones privadas no relacionadas.

Compartir una conversación no comparte archivos asociados a otros recursos.

Una revocación debe impedir accesos futuros al archivo y a su contenido derivado dentro del alcance retirado.

El archivo nunca concede permisos por estar relacionado con una persona o recurso.

## 14. Relación con Events

Events puede expresar hechos significativos relacionados con archivos.

Eventos conceptuales posibles:

**Archivo asociado**

Ocurrió que un archivo quedó relacionado con un recurso autorizado.

**Relación de archivo corregida**

Ocurrió que el usuario corrigió el contexto o recurso relacionado.

**Nueva versión conceptual relacionada**

Cuando esa capacidad esté aprobada, ocurrió que un nuevo archivo fue confirmado como revisión de otro.

**Archivo eliminado**

Ocurrió una eliminación autorizada.

**Archivo dejó de estar vigente**

Si se considera un hecho relevante, ocurrió que dejó de representar soporte actual para el asunto.

El evento:

- no reemplaza el archivo;
- no contiene necesariamente todo su contenido;
- no concede acceso;
- no recupera un archivo eliminado;
- conserva que el hecho ocurrió.

Eliminar un archivo no elimina ni reescribe los eventos anteriores.

## 15. Relación con Search & Retrieval

Search puede localizar archivos autorizados mediante criterios confirmados como:

- recurso propietario;
- conversación;
- compromiso;
- persona relacionada;
- fecha;
- procedencia;
- vigencia.

Search:

- no interpreta contenido;
- no amplía permisos;
- no modifica el archivo;
- no confirma relaciones;
- no expone la existencia de archivos no autorizados.

Retrieval recupera:

- archivo autorizado;
- recurso propietario;
- contexto;
- procedencia;
- relación con el asunto;
- vigencia;
- versiones conceptuales cuando estén definidas.

Retrieval no:

- inventa contenido ausente;
- sustituye el archivo por un resumen;
- modifica el resultado;
- evita una revocación.

Si el archivo ya no existe, Retrieval debe reconocer su ausencia sin modificar los hechos relacionados.

## 16. Procedencia

Todo archivo posee procedencia identificable.

La procedencia debe permitir comprender:

- cuál es el recurso propietario;
- dónde se originó;
- quién realizó la asociación cuando corresponda;
- cuándo se relacionó;
- por qué se relacionó;
- qué contexto estaba disponible;
- qué autorización se aplicaba;
- si existieron correcciones, versiones o eliminación posterior.

La fuente de procedencia puede ser:

- conversación;
- mensaje;
- captura;
- compromiso;
- seguimiento;
- avance;
- resultado.

El archivo no sustituye su procedencia.

Una interpretación derivada no puede convertirse en procedencia del contenido original.

Cuando el origen no sea claro, la ambigüedad debe mantenerse y no inventarse.

## 17. Temporalidad

Todo archivo posee momentos conceptualmente relevantes:

- momento de origen cuando sea conocido;
- momento de asociación con el recurso;
- momento de una corrección;
- momento de una versión posterior;
- momento en que pierde vigencia;
- momento de eliminación.

Estos momentos no deben confundirse.

El contenido puede existir fuera de Ping antes de su asociación. Dentro del modelo de Ping, sólo se reconoce como archivo cuando pertenece a un recurso.

Una vez asociado, un archivo puede:

- seguir existiendo y perder vigencia para un asunto;
- ser eliminado después de haber apoyado un hecho;
- tener una versión posterior sin que la anterior deje de haber existido.

La temporalidad debe permitir comprender qué archivo estaba relacionado con el asunto en cada momento relevante.

Si un momento es desconocido, no debe inventarse precisión.

## 18. Versiones conceptuales

Una versión conceptual es un archivo posterior que el usuario confirma como revisión, actualización o reemplazo de otro dentro del mismo contexto.

Una nueva versión:

- es un archivo distinguible;
- conserva su propia procedencia;
- conserva su propio momento;
- mantiene relación con el archivo anterior;
- no reescribe el contenido anterior;
- no hereda permisos por inferencia;
- no se considera vigente automáticamente;
- requiere contexto comprensible.

La versión anterior:

- no deja de haber existido;
- puede perder vigencia;
- puede continuar siendo relevante para la historia;
- puede dejar de estar disponible según eliminación y autorización.

La similitud entre archivos no crea una relación de versión.

La IA puede sugerir una relación, pero sólo una decisión confirmada puede establecerla.

Las versiones no son una capacidad obligatoria para terminar el MVP. Sus reglas detalladas quedan pendientes.

## 19. Eliminación conceptual

Eliminar conceptualmente un archivo significa que deja de estar disponible dentro del alcance autorizado correspondiente.

La eliminación:

- requiere autorización;
- se relaciona con el recurso propietario;
- conserva el hecho de que ocurrió;
- no modifica conversaciones;
- no modifica compromisos;
- no modifica personas;
- no modifica recuerdos por sí sola;
- no falsifica la historia;
- no convierte información derivada en sustituto.

Si un archivo deja de existir:

- su ausencia no modifica los hechos que ocurrieron;
- un compromiso no deja de haber existido;
- un seguimiento no deja de haber ocurrido;
- un avance no se convierte en falso automáticamente;
- un resultado no se borra por inferencia;
- las referencias deben indicar que el contenido ya no está disponible cuando corresponda.

Los efectos exactos sobre referencias, versiones, recursos compartidos y contexto recuperable quedan pendientes.

## 20. Reglas e invariantes

1. Un archivo representa evidencia, soporte o contenido.
2. Todo archivo pertenece conceptualmente a un recurso.
3. Ningún archivo existe aislado dentro del dominio.
4. Todo archivo posee propietario conceptual.
5. Todo archivo posee procedencia.
6. Todo archivo posee contexto.
7. Todo archivo posee autorización.
8. Un archivo puede perder vigencia.
9. Un adjunto es una relación entre archivo y recurso.
10. El archivo no es un dominio de negocio.
11. El archivo nunca es propietario de información.
12. Un archivo no reemplaza una conversación.
13. Un archivo no reemplaza un compromiso.
14. Un archivo no reemplaza una persona.
15. Un archivo no reemplaza un recuerdo.
16. Un archivo no reemplaza su fuente.
17. Un archivo no concede permisos.
18. Un archivo no ejecuta acciones.
19. Un archivo no toma decisiones.
20. Conversation puede contener archivos.
21. Commitment puede contener archivos.
22. People puede relacionarse con archivos.
23. Una relación con People no concede acceso.
24. Memory puede recordar referencias relevantes.
25. Memory no convierte todos los archivos en recuerdos.
26. Search sólo localiza archivos autorizados.
27. Retrieval recupera archivo, contexto y procedencia.
28. Authorization determina quién puede acceder.
29. La IA sólo interpreta contenido autorizado.
30. La interpretación de IA no reemplaza el archivo.
31. Todo resultado derivado se distingue de la fuente.
32. Una nueva versión no reescribe la anterior.
33. Una relación de versión no se infiere por similitud.
34. La eliminación no falsifica la historia.
35. La ausencia posterior no cambia los hechos ocurridos.
36. Los archivos asociados son opcionales para completar el MVP.

## 21. Casos de uso del MVP

Los archivos son una capacidad compatible pero opcional. Ningún caso de esta sección es condición para completar el flujo principal del MVP.

**Asociar un archivo a una conversación**

Cuando la capacidad esté habilitada, el usuario relaciona contenido con una conversación autorizada y conserva contexto.

**Asociar un archivo a un mensaje o captura**

El archivo conserva procedencia directa dentro de Conversation.

**Asociar un archivo a un compromiso**

El usuario autorizado relaciona evidencia o soporte con el asunto.

**Relacionar un archivo con un seguimiento**

El archivo ayuda a comprender qué ocurrió sin registrar seguimiento por sí mismo.

**Relacionar un archivo con un avance**

El contenido aporta evidencia, pero no resuelve automáticamente el compromiso.

**Relacionar un archivo con un resultado**

El archivo ayuda a comprender el cierre sin sustituir el resultado registrado.

**Recuperar un archivo desde su contexto**

El usuario autorizado vuelve desde conversación, compromiso, persona o recuerdo al recurso propietario.

**Localizar un archivo autorizado**

Search encuentra el archivo sin exponer contenido ajeno.

**Interpretar un archivo mediante IA**

La IA produce información derivada y conserva la diferencia con la fuente.

**Eliminar un archivo**

El usuario autorizado lo elimina sin reescribir la historia del asunto.

## 22. API conceptual

La API conceptual describe capacidades y resultados del negocio. No define decisiones técnicas.

**Asociar un archivo**

Resultado esperado: el archivo queda vinculado con un recurso propietario, contexto, procedencia y autorización.

**Obtener un archivo autorizado**

Resultado esperado: se entrega el contenido permitido o se rechaza el acceso.

**Obtener contexto del archivo**

Resultado esperado: se comprende por qué está asociado y con qué asunto se relaciona.

**Relacionar con Conversation**

Resultado esperado: Conversation conserva la asociación sin perder participantes, origen ni permisos.

**Relacionar con Commitment**

Resultado esperado: el archivo aporta evidencia o soporte sin modificar el ciclo de vida.

**Relacionar con People**

Resultado esperado: se conserva una relación contextual sin cambiar identidad ni acceso.

**Recordar una referencia**

Resultado esperado: Memory conserva únicamente una referencia relevante, autorizada y con procedencia.

**Localizar un archivo**

Resultado esperado: Search encuentra sólo archivos que el usuario puede conocer.

**Recuperar un archivo**

Resultado esperado: Retrieval entrega archivo, recurso propietario y contexto autorizado.

**Solicitar interpretación**

Resultado esperado: la IA devuelve información derivada distinguible de la fuente.

**Relacionar una versión conceptual**

Resultado esperado: un archivo posterior queda relacionado con uno anterior sólo después de confirmación.

**Marcar pérdida de vigencia**

Resultado esperado: se reconoce que el archivo ya no representa soporte actual sin reescribir la historia.

**Eliminar un archivo**

Resultado esperado: deja de estar disponible dentro del alcance autorizado y se conserva el hecho de la eliminación.

## 23. Criterios de aceptación

El modelo se considera definido correctamente cuando:

1. El archivo se define como evidencia, soporte o contenido.
2. El adjunto se define como relación con un recurso.
3. Ningún archivo existe conceptualmente aislado.
4. Todo archivo tiene recurso propietario.
5. Todo archivo tiene procedencia y contexto.
6. Conversation puede contener archivos.
7. Commitment puede contener archivos.
8. People puede relacionarse con archivos.
9. Memory recuerda sólo referencias relevantes.
10. Search localiza únicamente archivos autorizados.
11. Retrieval recupera archivo y contexto.
12. Authorization limita toda consulta y acción.
13. La IA sólo interpreta contenido autorizado.
14. La información derivada no reemplaza la fuente.
15. El archivo no reemplaza Conversation, Commitment, People ni Memory.
16. El archivo no concede permisos.
17. El archivo no ejecuta acciones ni toma decisiones.
18. Una versión posterior no reescribe la anterior.
19. Una eliminación no falsifica la historia.
20. La ausencia de un archivo no modifica hechos ocurridos.
21. La capacidad sigue siendo opcional para el MVP.
22. El modelo permanece dentro del significado del negocio.

## 24. Decisiones pendientes

1. Definir si los archivos asociados estarán habilitados en la primera beta.
2. Definir qué recursos podrán ser propietarios de archivos durante la validación inicial.
3. Definir la propiedad conceptual de archivos dentro de conversaciones compartidas.
4. Definir la relación entre quien asocia el archivo y el propietario conceptual.
5. Definir si un archivo puede relacionarse con varios recursos.
6. Definir qué relación se considera propietaria cuando existen varias referencias.
7. Definir qué información mínima describe el contexto de un adjunto.
8. Definir cuándo un archivo pierde vigencia.
9. Definir si las versiones conceptuales estarán disponibles.
10. Definir quién puede confirmar una relación de versión.
11. Definir cuál versión se considera vigente cuando existen varias.
12. Definir si una versión hereda alguna autorización y bajo qué decisión explícita.
13. Definir cómo se presenta un archivo cuya fuente fue eliminada.
14. Definir qué referencias conserva Memory después de una eliminación.
15. Definir qué ocurre al eliminar un archivo relacionado con un compromiso resuelto.
16. Definir qué actor puede eliminar archivos en recursos compartidos.
17. Definir el efecto de una revocación sobre interpretaciones derivadas existentes.
18. Definir qué criterios de Search estarán disponibles para archivos.
19. Definir cuánto contexto recupera Retrieval junto con un archivo.
20. Definir si una captura de audio se representa bajo este mismo modelo conceptual o conserva una categoría específica de Conversation.
21. Definir qué hechos relacionados con archivos son eventos relevantes.

Hasta resolver estas decisiones, no deben asumirse propiedad compartida, múltiples relaciones, versiones, vigencia ni alcance de eliminación.

## 25. Resumen

Un archivo en Ping representa evidencia, soporte o contenido asociado a un recurso del dominio.

Un adjunto es la relación que expresa a qué recurso pertenece el archivo y por qué.

La regla de propiedad es:

> Todo archivo pertenece conceptualmente a otro recurso y nunca existe aislado.

La regla de fuente es:

> Una interpretación o resumen nunca reemplaza el archivo original.

La regla de autorización es:

> Relacionar, localizar o recuperar un archivo no amplía permisos.

La regla de historia es:

> Eliminar un archivo no modifica los hechos que ocurrieron ni falsifica el pasado.

Conversation puede contener archivos. Commitment puede relacionarlos con origen, seguimiento, avance o resultado. People puede mantener relaciones contextuales. Memory sólo recuerda referencias relevantes. Search localiza archivos autorizados y Retrieval los recupera con contexto. Events conserva hechos relacionados. Authorization controla el acceso. La IA sólo interpreta contenido permitido.

Los archivos no son un dominio de negocio, no son propietarios y no sustituyen Conversation, Commitment, People o Memory.

Su valor consiste en conservar evidencia y soporte con contexto, procedencia y control del usuario sin convertir la capacidad opcional en requisito del flujo principal.
