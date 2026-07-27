# Ping — Glosario y Lenguaje Ubicuo

## 1. Propósito

Este documento consolida el lenguaje ubicuo de Ping a partir de los documentos 00 al 17.

Su objetivo es que producto, diseño, negocio, experiencia de usuario, inteligencia artificial y futura arquitectura utilicen los mismos términos con el mismo significado.

El glosario:

- define conceptos aprobados;
- distingue términos parecidos;
- establece vocabulario visible e interno;
- registra sinónimos permitidos;
- identifica términos ambiguos;
- fija reglas de uso;
- conserva decisiones todavía pendientes.

No crea funcionalidades, estados ni dominios nuevos.

Cuando un término posee distintos usos legítimos, debe acompañarse de un calificador que elimine la ambigüedad.

---

## 2. Alcance

Este documento define lenguaje conceptual y funcional.

No define:

- nombres de tablas;
- nombres de clases;
- endpoints;
- eventos de software;
- estructuras de datos;
- convenciones de código;
- nombres de componentes;
- protocolos;
- mecanismos técnicos.

Los nombres técnicos futuros deberán derivarse de este lenguaje, no reemplazarlo.

---

## 3. Reglas generales del lenguaje

1. Un término debe conservar el mismo significado en todos los dominios.
2. Si el contexto cambia el significado, debe utilizarse un calificador explícito.
3. Los nombres visibles para el usuario deben ser claros y naturales.
4. Los nombres internos pueden conservar términos de dominio en inglés cuando ya están aprobados.
5. Un término técnico no debe convertirse en modelo mental del usuario.
6. Los estados deben expresar significado funcional, no comodidad de implementación.
7. Una propuesta nunca debe nombrarse como hecho confirmado.
8. Una inferencia nunca debe nombrarse como dato.
9. Una acción pendiente nunca debe nombrarse como completada.
10. Una referencia incompleta nunca debe nombrarse como identidad confirmada.
11. Un derivado nunca debe nombrarse como fuente.
12. Un resultado desconocido nunca debe nombrarse como éxito o fracaso.
13. Un término no debe ampliar autorización ni propósito.
14. Los términos históricos deben distinguir estado anterior de estado vigente.
15. Las palabras “todo”, “siempre”, “definitivo” y “completo” sólo deben usarse cuando puedan sostenerse.

---

## 4. Cómo leer cada entrada

Cada término puede incluir:

- **Definición:** significado breve y preciso.
- **En Ping:** uso dentro del producto.
- **No significa:** límites del concepto.
- **Relaciones:** conceptos cercanos.
- **Sinónimos permitidos:** alternativas que no cambian el significado.
- **Evitar:** palabras que inducen a error.

La ausencia de un sinónimo no significa que toda variante esté prohibida. Significa que debe preferirse el término oficial.

---

## 5. Producto y conceptos fundamentales

### Ping

- **Definición:** producto que ayuda a capturar información de forma natural y transformarla, con control del usuario, en contexto útil, compromisos claros, seguimiento y resolución.
- **En Ping:** integra Conversation, Commitment, People y Memory, apoyados por capacidades transversales.
- **No significa:** gestor de tareas tradicional, copia de WhatsApp, chatbot genérico, calendario, ERP, red social ni repositorio pasivo.
- **Relaciones:** captura, contexto, compromiso, seguimiento, memoria.
- **Sinónimos permitidos:** ninguno como nombre del producto.
- **Evitar:** “asistente autónomo”, “task manager”, “chatbot”.

### Usuario

- **Definición:** persona que utiliza Ping y desde cuya perspectiva se organizan sus asuntos.
- **En Ping:** puede ser propietario, participante o responsable según el contexto.
- **No significa:** cualquier persona mencionada ni toda persona representada por People.
- **Relaciones:** persona, propietario, participante.
- **Sinónimos permitidos:** “persona usuaria” cuando mejore claridad.
- **Evitar:** usar “usuario” para terceros no registrados.

### Captura

- **Definición:** información que el usuario registra de manera natural para no perderla.
- **En Ping:** puede originarse mediante texto, conversación, audio u otro contenido permitido.
- **No significa:** compromiso confirmado, recuerdo permanente ni evento por sí misma.
- **Relaciones:** mensaje, conversación, propuesta, fuente.
- **Sinónimos permitidos:** “registro inicial” sólo cuando no se confunda con auditoría.
- **Evitar:** “tarea” antes de confirmación.

### Asunto

- **Definición:** tema o situación comprensible que relaciona información, personas, compromisos y resultados.
- **En Ping:** permite hablar de algo relevante sin reducirlo a un recurso técnico.
- **No significa:** entidad independiente obligatoria ni ticket.
- **Relaciones:** contexto, conversación, compromiso.
- **Sinónimos permitidos:** “tema” en lenguaje visible.
- **Evitar:** “caso” cuando sugiera sistema de tickets.

### Contexto

- **Definición:** información necesaria para comprender por qué existe un asunto, compromiso, mensaje o recuerdo.
- **En Ping:** puede incluir origen, conversación, persona, fecha, archivo, asunto y acciones posteriores.
- **No significa:** todo el historial ni todo lo relacionado con una persona.
- **Relaciones:** fuente, procedencia, Memory, Retrieval.
- **Sinónimos permitidos:** “información relacionada” sólo si expresa relevancia.
- **Evitar:** “datos adicionales” sin explicar propósito.

### Procedencia

- **Definición:** relación que permite conocer de dónde proviene una información, decisión, derivación o hecho.
- **En Ping:** conecta fuentes, actores, contexto y transformaciones.
- **No significa:** copia de la fuente ni prueba automática de verdad.
- **Relaciones:** fuente, evidencia, trazabilidad.
- **Sinónimos permitidos:** “origen identificable”.
- **Evitar:** “metadata” como término visible.

---

## 6. Conversation

### Conversation

- **Definición:** dominio que conserva conversaciones, participantes, mensajes y procedencia conversacional.
- **En Ping:** permite capturar e intercambiar información con contexto; self-chat es un caso principal.
- **No significa:** copia de WhatsApp, canal necesariamente compartido ni simple lista de mensajes.
- **Relaciones:** conversación, mensaje, participante, Commitment.
- **Sinónimos permitidos:** “dominio Conversation” en lenguaje interno.
- **Evitar:** “mensajería” cuando reduzca su función.

### Conversación

- **Definición:** contexto conversacional que agrupa mensajes y su procedencia.
- **En Ping:** puede pertenecer sólo al usuario o incluir participantes autorizados.
- **No significa:** que siempre existan varias personas ni que todo contenido sea público para los participantes.
- **Relaciones:** mensaje, self-chat, participante.
- **Sinónimos permitidos:** “conversación”.
- **Evitar:** “grupo” como término general.

### Self-chat

- **Definición:** conversación principal del usuario consigo mismo para capturar y desarrollar asuntos.
- **En Ping:** es un caso central, no una excepción.
- **No significa:** conversación con un bot ni canal compartido.
- **Relaciones:** captura, conversación, usuario.
- **Sinónimos permitidos:** “conversación personal” en lenguaje visible.
- **Evitar:** “chat con la IA”.

### Message

- **Definición:** unidad de contenido dentro de una conversación.
- **En Ping:** conserva autor, momento, conversación y procedencia.
- **No significa:** conversación completa, compromiso automático ni hecho aceptado cuando sigue pendiente.
- **Relaciones:** Conversation, fuente, adjunto.
- **Sinónimos permitidos:** “mensaje”.
- **Evitar:** “evento” para cualquier mensaje.

### Mensaje pendiente

- **Definición:** intención de mensaje que todavía no fue confirmada como mensaje aceptado.
- **En Ping:** permanece distinguible de los mensajes confirmados.
- **No significa:** mensaje recibido ni visible para otras personas.
- **Relaciones:** acción pendiente, resultado desconocido, Synchronization.
- **Sinónimos permitidos:** “pendiente de envío” según el estado exacto.
- **Evitar:** “enviado” sin evidencia.

### Participante

- **Definición:** persona autorizada a intervenir en una conversación dentro de un alcance.
- **En Ping:** su acceso puede variar y ser revocado.
- **No significa:** propietario de toda la conversación, usuario necesariamente registrado ni acceso a toda la memoria.
- **Relaciones:** persona, Conversation, Authorization.
- **Sinónimos permitidos:** “participante autorizado”.
- **Evitar:** “miembro” si sugiere permisos uniformes.

---

## 7. Commitment

### Commitment

- **Definición:** dominio que administra el ciclo de vida de compromisos confirmados.
- **En Ping:** conserva origen, contexto, responsable, seguimiento, evolución y resolución.
- **No significa:** lista de tareas, calendario, ticket, agenda ni tablero de estados.
- **Relaciones:** compromiso, propuesta, seguimiento, resultado.
- **Sinónimos permitidos:** “dominio Commitment” en lenguaje interno.
- **Evitar:** “Task Domain”.

### Compromiso

- **Definición:** asunto confirmado por el usuario que no debe perderse y requiere atención hasta alcanzar una resolución comprensible.
- **En Ping:** posee procedencia y responsable comprensible.
- **No significa:** cualquier mensaje, sugerencia, intención, recordatorio o tarea genérica.
- **Relaciones:** propuesta de compromiso, confirmación, responsable, resolución.
- **Sinónimos permitidos:** ninguno cuando se nombra el concepto formal.
- **Evitar:** “tarea” como sustituto general.

### Propuesta de compromiso

- **Definición:** interpretación previa a la creación de un compromiso.
- **En Ping:** puede confirmarse, corregirse, completarse o rechazarse.
- **No significa:** compromiso abierto ni hecho permanente.
- **Relaciones:** IA, captura, confirmación, rechazo.
- **Sinónimos permitidos:** “posible compromiso”, “propuesta”.
- **Evitar:** “compromiso detectado” si parece confirmado.

### Confirmación del usuario

- **Definición:** decisión explícita mediante la cual el usuario acepta el significado relevante de una propuesta o acción.
- **En Ping:** origina un compromiso cuando se confirma una propuesta válida.
- **No significa:** recepción técnica, sugerencia de IA ni aceptación automática.
- **Relaciones:** decisión, propuesta, compromiso.
- **Sinónimos permitidos:** “confirmación explícita”.
- **Evitar:** “confirmación” sin calificador cuando pueda confundirse con confirmación de sincronización.

### Rechazo de propuesta

- **Definición:** decisión de no convertir una propuesta en compromiso.
- **En Ping:** conserva que la propuesta no fue aceptada.
- **No significa:** estado de un compromiso confirmado.
- **Relaciones:** propuesta, decisión, IA.
- **Sinónimos permitidos:** “propuesta rechazada”.
- **Evitar:** “compromiso rechazado” si nunca existió.

### Rechazo de acción

- **Definición:** resultado por el que una acción evaluada no puede aplicarse.
- **En Ping:** conserva intención, recurso, contexto y motivo funcional conocido.
- **No significa:** rechazo de una propuesta ni cancelación de un compromiso.
- **Relaciones:** acción, Authorization, Synchronization.
- **Sinónimos permitidos:** “acción rechazada”.
- **Evitar:** “error” cuando existió una decisión válida de rechazo.

### Cancelación

- **Definición:** término reservado para una posible condición futura de un compromiso confirmado.
- **En Ping:** su significado, condiciones y relación con el resultado todavía no están aprobados.
- **No significa:** rechazo de propuesta, eliminación ni resolución.
- **Relaciones:** compromiso, resolución, resultado.
- **Sinónimos permitidos:** ninguno hasta resolver la decisión.
- **Evitar:** presentar “Cancelado” como estado oficial.

### Avance

- **Definición:** información que expresa evolución, cambio, respuesta o progreso relevante.
- **En Ping:** ayuda a comprender qué ocurrió durante el seguimiento.
- **No significa:** resolución automática ni cierre.
- **Relaciones:** seguimiento, compromiso, resultado.
- **Sinónimos permitidos:** “progreso” cuando no se confunda con porcentaje de tarea.
- **Evitar:** “completado parcialmente”.

### Seguimiento

- **Definición:** atención posterior a la creación de un compromiso mediante preguntas, respuestas, avances, acciones o mensajes relacionados.
- **En Ping:** acompaña el asunto hasta su resultado.
- **No significa:** sólo recordatorios, notificaciones ni cambio de estado.
- **Relaciones:** avance, Commitment, Notification.
- **Sinónimos permitidos:** “dar seguimiento”.
- **Evitar:** “alerta” como equivalente.

### Resolución

- **Definición:** cierre comprensible de un compromiso con resultado conservado.
- **En Ping:** requiere confirmación; no basta con ocultar o dejar de mostrar el asunto.
- **No significa:** avance, eliminación, expiración ni cancelación no definida.
- **Relaciones:** resultado, compromiso, evento.
- **Sinónimos permitidos:** “asunto resuelto”.
- **Evitar:** “completado” cuando no expresa resultado.

### Resultado del compromiso

- **Definición:** explicación comprensible de cómo terminó o en qué condición quedó el asunto.
- **En Ping:** forma parte de la resolución y preserva contexto.
- **No significa:** mero estado, notificación ni resumen sin fuente.
- **Relaciones:** resolución, evidencia, Memory.
- **Sinónimos permitidos:** “resultado final” cuando realmente sea final.
- **Evitar:** “done”.

### Abierto

- **Definición:** compromiso confirmado que todavía requiere atención y no tiene resolución.
- **En Ping:** puede ser además próximo, atrasado o estar en seguimiento.
- **No significa:** propuesta ni estado técnico exclusivo.
- **Relaciones:** próximo, atrasado, seguimiento.
- **Sinónimos permitidos:** “pendiente” sólo en lenguaje visible cuando no se confunda con acción pendiente.
- **Evitar:** “activo” sin explicar significado.

### Próximo

- **Definición:** condición de un compromiso abierto que se acerca a una fecha confirmada.
- **En Ping:** puede coexistir con otros estados o condiciones.
- **No significa:** prioridad ni notificación.
- **Relaciones:** abierto, fecha.
- **Sinónimos permitidos:** “próximo a vencer” si existe plazo.
- **Evitar:** “urgente” como equivalente.

### Atrasado

- **Definición:** condición de un compromiso abierto que superó una fecha confirmada sin resolución.
- **En Ping:** exige atención, no juicio sobre la persona.
- **No significa:** fracaso, rechazo ni cancelación.
- **Relaciones:** abierto, fecha, seguimiento.
- **Sinónimos permitidos:** “fuera de plazo”.
- **Evitar:** “incumplido” sin una decisión explícita.

### En seguimiento

- **Definición:** condición de un compromiso abierto que recibe atención posterior.
- **En Ping:** puede coexistir con próximo o atrasado.
- **No significa:** resuelto.
- **Relaciones:** seguimiento, avance.
- **Sinónimos permitidos:** “con seguimiento”.
- **Evitar:** “en progreso” si sugiere un flujo genérico de tareas.

### Resuelto

- **Definición:** compromiso cuyo asunto alcanzó un cierre comprensible y conserva resultado.
- **En Ping:** es consecuencia de una resolución confirmada.
- **No significa:** oculto, eliminado o simplemente sin actividad.
- **Relaciones:** resolución, resultado.
- **Sinónimos permitidos:** “cerrado con resultado” en explicaciones.
- **Evitar:** “cerrado” sin resultado.

---

## 8. People

### People

- **Definición:** dominio que administra identidad y relaciones contextualizadas.
- **En Ping:** representa al usuario, contactos, participantes, responsables y referencias incompletas.
- **No significa:** agenda, CRM, red social, directorio global ni perfil automático.
- **Relaciones:** persona, relación, identidad.
- **Sinónimos permitidos:** “dominio People” en lenguaje interno.
- **Evitar:** “Contacts Domain”.

### Persona

- **Definición:** representación comprensible de alguien relacionado con un asunto desde la perspectiva del usuario.
- **En Ping:** puede ser registrada, no registrada o incompleta.
- **No significa:** usuario, contacto completo ni identidad global.
- **Relaciones:** usuario, participante, responsable.
- **Sinónimos permitidos:** ninguno como concepto formal.
- **Evitar:** “usuario” cuando la persona no usa Ping.

### Identidad

- **Definición:** comprensión confirmada de quién representa una persona.
- **En Ping:** puede permanecer incompleta y corregirse.
- **No significa:** identificador técnico ni perfil enriquecido.
- **Relaciones:** persona, referencia, People.
- **Sinónimos permitidos:** “identidad de la persona”.
- **Evitar:** “registro maestro”.

### Referencia de persona

- **Definición:** representación parcial o contextual de una persona todavía no resuelta completamente.
- **En Ping:** permite relacionar asuntos sin inventar identidad.
- **No significa:** persona confirmada ni duplicado seguro.
- **Relaciones:** persona, posible coincidencia.
- **Sinónimos permitidos:** “referencia incompleta”.
- **Evitar:** “contacto” si implica datos completos.

### Posible coincidencia

- **Definición:** propuesta de que dos referencias podrían representar a la misma persona.
- **En Ping:** requiere control del usuario antes de confirmar o fusionar.
- **No significa:** identidad confirmada.
- **Relaciones:** IA, People, referencia.
- **Sinónimos permitidos:** “coincidencia sugerida”.
- **Evitar:** “duplicado” como afirmación.

### Responsable

- **Definición:** persona comprensiblemente asociada con atender o cumplir un compromiso.
- **En Ping:** puede ser el usuario u otra persona relacionada, según contexto confirmado.
- **No significa:** propietario del recurso, participante con acceso ni persona culpable.
- **Relaciones:** compromiso, persona, propietario.
- **Sinónimos permitidos:** “persona responsable”.
- **Evitar:** “asignado” como sustantivo.

### Propietario

- **Definición:** actor cuya relación con el recurso establece propiedad conceptual y control autorizado.
- **En Ping:** puede diferir del responsable de un compromiso.
- **No significa:** persona que debe ejecutar el compromiso ni acceso ilimitado ajeno a Privacy.
- **Relaciones:** Authorization, recurso, responsable.
- **Sinónimos permitidos:** “propietario conceptual”.
- **Evitar:** “owner” en lenguaje visible.

### Relación

- **Definición:** vínculo contextual confirmado entre personas o entre una persona y un asunto.
- **En Ping:** existe desde la perspectiva y propósito del usuario.
- **No significa:** relación pública, permanente ni inferida.
- **Relaciones:** People, contexto, persona.
- **Sinónimos permitidos:** “relación contextual”.
- **Evitar:** “conexión” cuando pueda confundirse con conectividad.

---

## 9. Memory

### Memory

- **Definición:** capacidad que conserva aquello relevante que debe poder recordarse y recuperarse con contexto.
- **En Ping:** relaciona información de Conversation, Commitment y People sin sustituir sus fuentes.
- **No significa:** base de todo, historial completo, perfil exhaustivo, buscador ni tecnología específica.
- **Relaciones:** recuerdo, fuente, contexto, Retrieval.
- **Sinónimos permitidos:** “dominio Memory” en lenguaje interno; la denominación `Memory Foundation` permanece por resolver.
- **Evitar:** “memoria infinita”.

### Recuerdo

- **Definición:** información relevante que Ping puede recuperar con procedencia y contexto.
- **En Ping:** puede relacionarse con personas, conversaciones, compromisos, avances y resultados.
- **No significa:** evidencia auditable, copia de la fuente ni todo lo ocurrido.
- **Relaciones:** Memory, fuente, relevancia.
- **Sinónimos permitidos:** “información recordada”.
- **Evitar:** “registro histórico” como equivalente.

### Fuente

- **Definición:** contenido original del que proviene información, contexto o una derivación.
- **En Ping:** puede ser conversación, mensaje, archivo, compromiso u otro recurso autorizado.
- **No significa:** resumen, inferencia, evidencia o referencia.
- **Relaciones:** procedencia, derivación, Retrieval.
- **Sinónimos permitidos:** “fuente original”.
- **Evitar:** llamar fuente a una salida de IA.

### Relevancia

- **Definición:** valor funcional de una información para recordar, comprender, seguir o resolver un asunto.
- **En Ping:** limita qué entra en Memory y qué contexto se recupera.
- **No significa:** popularidad, frecuencia, volumen ni permanencia automática.
- **Relaciones:** Memory, propósito, minimización.
- **Sinónimos permitidos:** “utilidad contextual”.
- **Evitar:** “score” en lenguaje de negocio.

### Permanencia

- **Definición:** condición por la que una información conserva relevancia durante un período o asunto.
- **En Ping:** está sujeta a propósito, Privacy, corrección y eliminación.
- **No significa:** conservación infinita.
- **Relaciones:** Memory, conservación, Privacy.
- **Sinónimos permitidos:** “vigencia como recuerdo” cuando sea más preciso.
- **Evitar:** “para siempre”.

---

## 10. Inteligencia artificial

### Inteligencia artificial

- **Definición:** capacidad transversal que ayuda a interpretar, proponer, resumir, relacionar y explicar.
- **En Ping:** apoya dominios sin sustituir decisiones del usuario.
- **No significa:** dominio de negocio, actor autónomo, fuente de verdad ni autoridad.
- **Relaciones:** sugerencia, interpretación, derivación, incertidumbre.
- **Sinónimos permitidos:** “IA”.
- **Evitar:** “agente autónomo”, “la IA decidió”.

### Sugerencia

- **Definición:** propuesta generada para consideración del usuario.
- **En Ping:** permanece diferenciada de información confirmada.
- **No significa:** decisión, hecho, compromiso ni acción aplicada.
- **Relaciones:** IA, confirmación, rechazo.
- **Sinónimos permitidos:** “propuesta de IA”.
- **Evitar:** “recomendación definitiva”.

### Interpretación

- **Definición:** lectura derivada del significado posible de una fuente.
- **En Ping:** puede detectar contexto, fechas, responsables o posibles compromisos.
- **No significa:** verdad, fuente ni confirmación.
- **Relaciones:** IA, fuente, inferencia.
- **Sinónimos permitidos:** “interpretación propuesta”.
- **Evitar:** “dato extraído” cuando exista incertidumbre.

### Derivación

- **Definición:** información producida a partir de una o más fuentes.
- **En Ping:** incluye resúmenes, clasificaciones, relaciones o explicaciones.
- **No significa:** fuente original ni hecho confirmado.
- **Relaciones:** información derivada, procedencia, IA.
- **Sinónimos permitidos:** “información derivada”.
- **Evitar:** “nuevo dato” sin procedencia.

### Inferencia

- **Definición:** conclusión posible que no está expresada ni confirmada directamente por la fuente.
- **En Ping:** debe conservar incertidumbre y no volverse permanente sin control del usuario.
- **No significa:** hecho, identidad, permiso ni información sensible confirmada.
- **Relaciones:** IA, sugerencia, incertidumbre.
- **Sinónimos permitidos:** “posible conclusión”.
- **Evitar:** “hallazgo” cuando no fue confirmado.

### Resumen

- **Definición:** derivación condensada de una fuente o conjunto autorizado de fuentes.
- **En Ping:** ayuda a comprender sin sustituir el contenido original.
- **No significa:** fuente, verdad primaria ni conversación.
- **Relaciones:** IA, fuente, Retrieval.
- **Sinónimos permitidos:** “síntesis”.
- **Evitar:** “historia completa”.

### Incertidumbre

- **Definición:** reconocimiento de que Ping no posee evidencia suficiente para una conclusión.
- **En Ping:** debe mostrarse en identidades, IA, resultados, temporalidad y sincronización.
- **No significa:** error técnico ni permiso para inventar.
- **Relaciones:** inferencia, resultado desconocido, ambigüedad.
- **Sinónimos permitidos:** “no determinado”, “posible”.
- **Evitar:** certeza aparente.

---

## 11. Authorization y Privacy

### Authorization

- **Definición:** modelo que determina quién puede actuar sobre qué recurso, con qué acción y alcance.
- **En Ping:** protege toda consulta, modificación, confirmación, compartición y eliminación.
- **No significa:** autenticación, mecanismo técnico ni permiso para cualquier propósito.
- **Relaciones:** permiso, acceso, alcance, Privacy.
- **Sinónimos permitidos:** “autorización”.
- **Evitar:** “seguridad” como sustituto impreciso.

### Permiso

- **Definición:** capacidad explícita para realizar una acción protegida sobre un recurso dentro de un alcance.
- **En Ping:** sigue mínimo privilegio y puede revocarse.
- **No significa:** propiedad, relación, coincidencia ni propósito ilimitado.
- **Relaciones:** Authorization, acción, alcance.
- **Sinónimos permitidos:** “acción permitida”.
- **Evitar:** “rol” si no se ha definido un rol.

### Acceso

- **Definición:** posibilidad autorizada de consultar o utilizar un recurso dentro de límites.
- **En Ping:** puede cambiar y no garantiza cualquier uso.
- **No significa:** propiedad, consentimiento, propósito ni visibilidad universal.
- **Relaciones:** permiso, visibilidad, Privacy.
- **Sinónimos permitidos:** “acceso autorizado”.
- **Evitar:** “disponibilidad” como equivalente.

### Alcance

- **Definición:** límite de recursos, acciones, personas, contexto, propósito o tiempo al que aplica una autorización.
- **En Ping:** impide que compartir una parte comparta todo.
- **No significa:** dominio completo ni autorización implícita.
- **Relaciones:** permiso, recurso, revocación.
- **Sinónimos permitidos:** “límite autorizado”.
- **Evitar:** “scope” en lenguaje visible.

### Revocación

- **Definición:** decisión que retira un acceso o uso futuro dentro de un alcance.
- **En Ping:** impide accesos futuros sin falsificar hechos anteriores.
- **No significa:** eliminación automática, reescritura histórica ni negación de que existió acceso.
- **Relaciones:** Authorization, Privacy, Audit.
- **Sinónimos permitidos:** “retirar acceso”.
- **Evitar:** “borrar usuario”.

### Privacy

- **Definición:** capacidad que limita qué información se obtiene, para qué se usa, quién la ve, qué se deriva y cuánto se conserva.
- **En Ping:** aplica incluso cuando existe Authorization.
- **No significa:** Authorization, secreto absoluto ni política legal específica.
- **Relaciones:** propósito, minimización, consentimiento.
- **Sinónimos permitidos:** “privacidad”.
- **Evitar:** usar “permisos” como definición completa.

### Propósito

- **Definición:** razón específica y comprensible que justifica utilizar información.
- **En Ping:** debe relacionarse con capturar, recordar, seguir o resolver asuntos.
- **No significa:** utilidad hipotética ni acceso.
- **Relaciones:** Privacy, minimización, consentimiento.
- **Sinónimos permitidos:** “finalidad” cuando resulte natural.
- **Evitar:** “por si acaso”.

### Minimización

- **Definición:** uso de la menor cantidad y detalle de información necesarios para un propósito.
- **En Ping:** aplica a fuentes, contexto, derivados, copias, evidencia y visibilidad.
- **No significa:** eliminar contexto indispensable.
- **Relaciones:** Privacy, relevancia, propósito.
- **Sinónimos permitidos:** “información mínima necesaria”.
- **Evitar:** “ocultar datos” como equivalente.

### Consentimiento

- **Definición:** elección informada y específica de una persona para un uso cuando corresponda.
- **En Ping:** se diferencia de permiso, confirmación de compromiso y aceptación genérica.
- **No significa:** autorización universal, silencio ni condición automática de toda función.
- **Relaciones:** Privacy, propósito, revocación.
- **Sinónimos permitidos:** “consentimiento explícito” cuando sea aplicable.
- **Evitar:** “aceptó los términos” como sustituto.

### Información sensible

- **Definición:** información cuya exposición, uso o inferencia puede producir impacto especialmente significativo según el contexto.
- **En Ping:** requiere minimización y límites adicionales.
- **No significa:** categoría técnica fija ni clasificación legal definida por este glosario.
- **Relaciones:** Privacy, terceros, IA.
- **Sinónimos permitidos:** “contenido sensible” cuando se hable del contenido.
- **Evitar:** inferir sensibilidad como hecho personal.

---

## 12. Events, Audit y Traceability

### Event

- **Definición:** hecho significativo ocurrido dentro del dominio del negocio.
- **En Ping:** posee procedencia, momento y contexto; describe lo que ocurrió.
- **No significa:** intención, orden, propuesta, predicción, respuesta de IA ni detalle técnico.
- **Relaciones:** hecho, decisión, resultado.
- **Sinónimos permitidos:** “evento de dominio” en lenguaje interno; “hecho relevante” en lenguaje natural.
- **Evitar:** “evento” para cada clic.

### Hecho

- **Definición:** algo que ocurrió y puede afirmarse con evidencia suficiente.
- **En Ping:** permanece conceptualmente ocurrido aunque exista corrección posterior.
- **No significa:** inferencia, sugerencia, intención ni posibilidad.
- **Relaciones:** Event, evidencia, fuente.
- **Sinónimos permitidos:** “hecho confirmado”.
- **Evitar:** “dato” cuando se habla de una acción ocurrida.

### Intención

- **Definición:** lo que una persona quiso hacer.
- **En Ping:** puede registrarse localmente antes de cualquier confirmación.
- **No significa:** intento, recepción, decisión ni hecho.
- **Relaciones:** acción pendiente, intento, Audit.
- **Sinónimos permitidos:** “intención del usuario”.
- **Evitar:** “acción realizada”.

### Intento

- **Definición:** acción mediante la que se procuró ejecutar o confirmar una intención.
- **En Ping:** puede terminar aceptado, rechazado o con resultado desconocido.
- **No significa:** recepción, aceptación ni resultado.
- **Relaciones:** intención, Synchronization, Audit.
- **Sinónimos permitidos:** “intento de acción”.
- **Evitar:** “ejecución” si no se conoce resultado.

### Decisión

- **Definición:** determinación autorizada que confirma, corrige, rechaza, revoca, elimina o resuelve.
- **En Ping:** puede producir un hecho cuando se aplica.
- **No significa:** sugerencia, interpretación ni consecuencia automática no autorizada.
- **Relaciones:** actor, Authorization, resultado.
- **Sinónimos permitidos:** “decisión explícita”.
- **Evitar:** atribuir decisiones a IA.

### Resultado

- **Definición:** consecuencia o condición que Ping puede reconocer respecto de una intención, acción o decisión.
- **En Ping:** puede conocerse como aceptación, rechazo, resolución o conflicto, o permanecer como resultado desconocido.
- **No significa:** estado visual sin evidencia.
- **Relaciones:** decisión, hecho, resolución.
- **Sinónimos permitidos:** “resultado conocido”.
- **Evitar:** “éxito” como término general.

### Audit

- **Definición:** capacidad que conserva evidencia proporcional sobre acciones, decisiones y cambios relevantes.
- **En Ping:** puede incluir intentos rechazados o inciertos aunque no produzcan el evento solicitado.
- **No significa:** Event, vigilancia, registro de cada clic ni conservación ilimitada.
- **Relaciones:** evidencia, Traceability, Privacy.
- **Sinónimos permitidos:** “auditoría”.
- **Evitar:** “log” como concepto de negocio.

### Evidencia

- **Definición:** información suficiente para comprender o respaldar una acción, decisión, cambio o resultado relevante.
- **En Ping:** puede ser una fuente, referencia, archivo o registro auditable autorizado.
- **No significa:** recuerdo, prueba de validez automática ni contenido necesariamente visible para todos.
- **Relaciones:** Audit, fuente, Event.
- **Sinónimos permitidos:** “evidencia auditable” cuando corresponda.
- **Evitar:** “prueba definitiva”.

### Traceability

- **Definición:** capacidad de relacionar origen, contexto, transformación, decisión y resultado.
- **En Ping:** permite reconstruir la evolución relevante de un asunto.
- **No significa:** fuente, Event, copia completa ni acceso universal.
- **Relaciones:** procedencia, Audit, reconstrucción histórica.
- **Sinónimos permitidos:** “trazabilidad”.
- **Evitar:** “historial completo”.

### Reconstrucción histórica

- **Definición:** lectura autorizada y contextual de la evolución relevante de un asunto.
- **En Ping:** reconoce hechos, correcciones, eliminaciones, vacíos e incertidumbre.
- **No significa:** recuperación de todo contenido ni recreación de información eliminada.
- **Relaciones:** Traceability, Events, Privacy.
- **Sinónimos permitidos:** “reconstrucción del asunto”.
- **Evitar:** “replay” en lenguaje visible.

---

## 13. Notifications, Search, Retrieval, Files

### Notification

- **Definición:** comunicación dirigida a un usuario para informar un hecho relevante o una situación que requiere atención.
- **En Ping:** posee destinatario, motivo, contexto y vigencia.
- **No significa:** evento, acción automática, permiso ni prueba de conocimiento.
- **Relaciones:** Event, Commitment, Authorization.
- **Sinónimos permitidos:** “notificación”.
- **Evitar:** “alerta” como término universal.

### Vigencia de una notificación

- **Definición:** condición por la que una notificación todavía merece atención o conocimiento.
- **En Ping:** puede perderse sin modificar el hecho de origen.
- **No significa:** lectura, descarte ni resolución.
- **Relaciones:** Notification, relevancia.
- **Sinónimos permitidos:** “notificación vigente”.
- **Evitar:** “activa” sin definir.

### Search

- **Definición:** capacidad que localiza, filtra, ordena y encuentra información existente y autorizada.
- **En Ping:** trabaja sobre recursos disponibles dentro de un alcance.
- **No significa:** interpretación, resumen, memoria, permiso ni modificación.
- **Relaciones:** Retrieval, Authorization, recursos.
- **Sinónimos permitidos:** “búsqueda”.
- **Evitar:** “búsqueda inteligente” si implica inferencia no definida.

### Retrieval

- **Definición:** capacidad que recupera información localizada con contexto, procedencia y autorización suficientes.
- **En Ping:** permite comprender el resultado sin reemplazar la fuente.
- **No significa:** Search, Memory, resumen ni invención de contexto.
- **Relaciones:** Search, fuente, contexto.
- **Sinónimos permitidos:** “recuperación”.
- **Evitar:** “respuesta” como equivalente.

### File

- **Definición:** contenido identificable que representa evidencia, soporte o información asociable a un recurso.
- **En Ping:** posee procedencia y no existe conceptualmente de forma aislada.
- **No significa:** adjunto, propietario, conversación, compromiso ni recuerdo.
- **Relaciones:** Attachment, recurso propietario, evidencia.
- **Sinónimos permitidos:** “archivo”.
- **Evitar:** “documento” cuando puede ser audio u otro contenido.

### Attachment

- **Definición:** relación conceptual que asocia un archivo con un recurso y explica por qué pertenece allí.
- **En Ping:** conserva recurso propietario, contexto y autorización.
- **No significa:** archivo, copia ni categoría de almacenamiento.
- **Relaciones:** File, Conversation, Commitment.
- **Sinónimos permitidos:** “adjunto”, “archivo adjunto” en lenguaje visible.
- **Evitar:** usar “archivo” y “adjunto” como idénticos en lenguaje interno.

### Versión conceptual

- **Definición:** archivo posterior confirmado como revisión, actualización o reemplazo contextual de otro.
- **En Ping:** no reescribe la existencia de versiones anteriores.
- **No significa:** sobrescritura técnica ni versión vigente automática.
- **Relaciones:** File, confirmación, Traceability.
- **Sinónimos permitidos:** “nueva versión”.
- **Evitar:** “última versión” si la vigencia no fue confirmada.

---

## 14. Offline First y Synchronization

### Offline First

- **Definición:** comportamiento por el que Ping sigue siendo útil sin conexión dentro de límites explícitos.
- **En Ping:** protege intención, distingue estados y recupera continuidad.
- **No significa:** disponibilidad total sin conexión ni sincronización automática.
- **Relaciones:** información local, acción pendiente, Synchronization.
- **Sinónimos permitidos:** “funcionamiento sin conexión” en explicaciones.
- **Evitar:** “modo offline” si sugiere un estado binario con todas las funciones.

### Estado de conectividad

- **Definición:** grado de comunicación que Ping puede reconocer.
- **En Ping:** puede ser conectado, inestable, sin conexión o desconocido.
- **No significa:** resultado exitoso de una acción.
- **Relaciones:** disponibilidad funcional, Offline First.
- **Sinónimos permitidos:** “conectividad”.
- **Evitar:** “online” como garantía.

### Información local

- **Definición:** contenido disponible en el dispositivo sin obtenerlo nuevamente en ese momento.
- **En Ping:** puede estar confirmado, pendiente, desactualizado o con vigencia desconocida.
- **No significa:** vigente, autorizado indefinidamente ni sincronizado.
- **Relaciones:** Offline First, Privacy, Synchronization.
- **Sinónimos permitidos:** “disponible en este dispositivo”.
- **Evitar:** “guardado” si parece confirmado remotamente.

### Acción local pendiente

- **Definición:** intención registrada que todavía no fue confirmada por el sistema autorizado.
- **En Ping:** conserva actor, recurso, contexto, momento y estado.
- **No significa:** acción aplicada, Event ni resultado confirmado.
- **Relaciones:** intención, Synchronization, resultado desconocido.
- **Sinónimos permitidos:** “acción pendiente”.
- **Evitar:** “acción completada offline”.

### Synchronization

- **Definición:** capacidad que relaciona y reconcilia cambios realizados en distintos momentos, dispositivos o estados de conectividad.
- **En Ping:** conserva intención, orden, causalidad, autorización y trazabilidad.
- **No significa:** Offline First, aceptación automática ni mecanismo técnico.
- **Relaciones:** reconciliación, conflicto, duplicado.
- **Sinónimos permitidos:** “sincronización”.
- **Evitar:** “sync” en lenguaje visible.

### Presentada

- **Definición:** acción que Ping intentó someter al sistema autorizado.
- **En Ping:** precede a una posible recepción.
- **No significa:** recibida ni aceptada.
- **Relaciones:** intento, recibida.
- **Sinónimos permitidos:** “enviada para evaluación” cuando sea comprensible.
- **Evitar:** “enviada” si parece entregada.

### Recibida

- **Definición:** acción que llegó al ámbito capaz de evaluarla.
- **En Ping:** todavía espera aceptación o rechazo.
- **No significa:** autorizada, válida, aplicada ni confirmada.
- **Relaciones:** presentada, aceptada, rechazada.
- **Sinónimos permitidos:** “recibida para evaluación”.
- **Evitar:** “confirmada”.

### Aceptada

- **Definición:** acción validada que produjo el cambio confirmado correspondiente.
- **En Ping:** puede presentarse como confirmada.
- **No significa:** sólo recibida, propuesta aceptable ni intención local.
- **Relaciones:** confirmación de acción, hecho.
- **Sinónimos permitidos:** “acción confirmada”.
- **Evitar:** “sincronizada” como equivalente universal.

### Reconciliación

- **Definición:** establecimiento de una relación comprensible entre intenciones, acciones y hechos conocidos.
- **En Ping:** puede concluir aceptación, rechazo, duplicado, inaplicabilidad o conflicto.
- **No significa:** aceptación, fusión automática ni reescritura.
- **Relaciones:** Synchronization, conflicto, Traceability.
- **Sinónimos permitidos:** “reconciliación de cambios”.
- **Evitar:** “merge” en lenguaje de negocio.

### Sincronizado

- **Definición:** estado con alcance explícito en el que los cambios confirmados conocidos fueron relacionados y no existe incertidumbre relevante dentro de ese alcance.
- **En Ping:** siempre debe indicar a qué recurso o acción se refiere.
- **No significa:** confirmado por el usuario, actualizado para siempre ni ausencia global de pendientes.
- **Relaciones:** Synchronization, confirmado, resultado desconocido.
- **Sinónimos permitidos:** “actualizado hasta el momento conocido” cuando sea más preciso.
- **Evitar:** “Todo sincronizado” sin evidencia y alcance.

### Conflicto

- **Definición:** diferencia relevante entre cambios que no pueden coexistir o aplicarse juntos sin alterar significado, autorización o historia.
- **En Ping:** debe hacerse visible y puede requerir decisión.
- **No significa:** toda diferencia, error técnico ni duplicado.
- **Relaciones:** Synchronization, decisión, reconciliación.
- **Sinónimos permitidos:** “conflicto de cambios”.
- **Evitar:** “error de sincronización” como término general.

### Duplicado

- **Definición:** más de una representación de la misma intención o hecho.
- **En Ping:** debe reconciliarse sin crear varios hechos de negocio.
- **No significa:** contenido parecido ni personas similares.
- **Relaciones:** intento, identidad, Synchronization.
- **Sinónimos permitidos:** “representación repetida”.
- **Evitar:** afirmar duplicado ante ambigüedad.

### Resultado desconocido

- **Definición:** estado en el que Ping no puede determinar si una acción fue recibida, aceptada o rechazada.
- **En Ping:** conserva incertidumbre y no se marca como sincronizado.
- **No significa:** pendiente simple, fracaso ni éxito.
- **Relaciones:** intento, Synchronization, Audit.
- **Sinónimos permitidos:** “no se pudo determinar el resultado”.
- **Evitar:** “error” o “falló” sin evidencia.

---

## 15. Estados funcionales importantes

### Estados de un compromiso

| Término | Significado | Observación |
|---|---|---|
| Abierto | Confirmado, requiere atención y no tiene resolución | Estado principal |
| Próximo | Se acerca a una fecha confirmada | Puede coexistir con Abierto |
| Atrasado | Superó una fecha confirmada sin resolución | Puede coexistir con seguimiento |
| En seguimiento | Recibe atención posterior | No implica resolución |
| Resuelto | Alcanzó cierre comprensible con resultado | Requiere resolución confirmada |
| Cancelado | No definido oficialmente | Decisión pendiente |

### Estados de una acción sincronizable

| Término | Significado | No equivale a |
|---|---|---|
| Intención registrada | Ping conservó lo que el usuario quiso hacer | Intento |
| Pendiente | Espera una condición necesaria | Presentada |
| Presentada | Se intentó someter para evaluación | Recibida |
| Recibida | Llegó al ámbito capaz de evaluar | Aceptada |
| Aceptada | Produjo el cambio confirmado | Sólo recibida |
| Rechazada | No pudo aplicarse | Resultado desconocido |
| Resultado desconocido | No puede determinarse el resultado | Fracaso |
| Reconciliada | Se conoce la relación con los hechos | Necesariamente aceptada |

### Estados de información

| Término | Significado |
|---|---|
| Confirmada | Existe aceptación o fuente confirmada |
| Local no confirmada | Existe sólo como intención o cambio local |
| Potencialmente desactualizada | Puede no incluir cambios recientes |
| Pendiente de actualización | Ping sabe que debe revisar cambios |
| Vigencia desconocida | No puede determinarse si sigue vigente |
| En conflicto | Existen diferencias relevantes sin resolución |

### Estados de conectividad

| Término | Significado |
|---|---|
| Conectado | Ping puede intentar comunicarse |
| Conexión inestable | La comunicación es intermitente o insuficiente |
| Sin conexión | Ping no puede comunicarse en ese momento |
| Estado desconocido | No puede determinarse la conectividad suficiente |

---

## 16. Vocabulario visible para el usuario

Debe preferirse lenguaje que explique qué sabe Ping y qué puede hacer el usuario.

### Recomendado

- “Guardado en este dispositivo”.
- “Pendiente de envío”.
- “Enviando”.
- “Recibido, pendiente de confirmación”.
- “Confirmado”.
- “No se pudo aplicar”.
- “No se pudo confirmar”.
- “Resultado desconocido”.
- “Requiere revisión”.
- “Información posiblemente desactualizada”.
- “Disponible al recuperar conexión”.
- “Actualizado hasta el momento conocido”.
- “Visible sólo para ti”.
- “Compartido dentro de esta conversación”.
- “Esta información fue derivada por IA”.
- “La fuente ya no está disponible”.
- “El acceso fue revocado”.
- “Parte del contexto no puede mostrarse”.
- “Esta referencia de persona está incompleta”.

### Debe evitarse en lenguaje visible

- “HTTP error”.
- “Sync conflict”.
- “Entity”.
- “Record”.
- “Database”.
- “Scope”.
- “Owner”.
- “Embedding”.
- “RAG”.
- “Vector”.
- “Event sourcing”.
- “Operation succeeded” sin explicar el resultado.

El vocabulario final de algunas experiencias permanece pendiente.

---

## 17. Vocabulario interno de negocio

Los siguientes nombres pueden utilizarse internamente porque identifican conceptos aprobados:

- Conversation;
- Message;
- Commitment;
- Commitment Proposal;
- People;
- Memory;
- AI o IA;
- Authorization;
- Event;
- Notification;
- Search;
- Retrieval;
- File;
- Attachment;
- Offline First;
- Synchronization;
- Audit;
- Traceability;
- Privacy.

Reglas:

- El término inglés no debe imponerse al usuario cuando exista una expresión clara en español.
- Los nombres internos no definen clases ni componentes técnicos.
- El dominio propietario debe acompañar términos ambiguos.
- `Event` significa evento de negocio, no evento técnico.
- `Message` significa mensaje de Conversation.
- `Commitment Proposal` nunca debe abreviarse como Commitment.
- `File` y `Attachment` no son intercambiables.

---

## 18. Diferencias entre conceptos parecidos

### Conversación frente a mensaje

- La conversación conserva el contexto conversacional.
- El mensaje es una unidad de contenido dentro de ella.
- Un mensaje no puede representar por sí solo toda la conversación.

### Propuesta frente a compromiso

- La propuesta todavía espera decisión.
- El compromiso ya fue confirmado.
- Rechazar una propuesta no cambia un compromiso porque éste no nació.

### Avance frente a resolución

- El avance expresa evolución.
- La resolución expresa cierre con resultado.
- Registrar actividad no resuelve automáticamente.

### Responsable frente a propietario

- El responsable atiende el compromiso.
- El propietario posee control conceptual sobre el recurso.
- Pueden ser personas diferentes.

### Persona frente a usuario

- Persona es cualquiera representado contextualmente.
- Usuario es quien utiliza Ping.
- Una persona no registrada nunca debe llamarse usuario.

### Recuerdo frente a evidencia

- El recuerdo es información relevante recuperable por Memory.
- La evidencia respalda o explica acciones, decisiones o hechos.
- No toda evidencia debe convertirse en recuerdo.

### Fuente frente a información derivada

- La fuente es el contenido original.
- La derivación se produce a partir de fuentes.
- Una derivación conserva procedencia y nunca sustituye la fuente.

### Intención frente a hecho

- La intención expresa lo que alguien quiso hacer.
- El hecho expresa algo que ocurrió.
- Registrar una intención no confirma el hecho.

### Recepción frente a aceptación

- Recepción significa que una acción llegó para evaluación.
- Aceptación significa que fue validada y produjo el cambio.
- Una acción recibida todavía puede rechazarse.

### Acceso frente a propósito

- Acceso define qué recurso puede consultarse o utilizarse.
- Propósito define para qué puede usarse la información.
- Tener acceso no autoriza cualquier propósito.

### Archivo frente a adjunto

- El archivo es contenido.
- El adjunto es la relación con un recurso.
- Un archivo no existe conceptualmente aislado dentro de Ping.

### Evento frente a auditoría

- El evento representa un hecho de negocio.
- Audit conserva evidencia relevante, incluso de intentos rechazados.
- No toda evidencia auditable es un evento.

### Sincronizado frente a confirmado

- Confirmado expresa aceptación de una acción o información.
- Sincronizado expresa relación conocida de cambios dentro de un alcance.
- Algo puede estar confirmado en un lugar y todavía no sincronizado en otro.

### Eliminado frente a inexistente

- Eliminado expresa que existió un recurso o contenido y luego fue retirado.
- Inexistente expresa que no existe evidencia de creación dentro del alcance conocido.
- Eliminar no debe reescribir la historia como si nunca hubiera ocurrido.

### Rechazado frente a cancelado

- Rechazado expresa que una propuesta o acción no fue aceptada.
- Cancelado sería una condición de un compromiso ya confirmado.
- Cancelación todavía no es un estado oficial.

### Pendiente frente a abierto

- Pendiente describe una acción que espera confirmación o una expresión visible genérica.
- Abierto describe un compromiso confirmado sin resolución.
- Debe indicarse “acción pendiente” o “compromiso abierto” en lenguaje interno.

### Contexto frente a historial

- Contexto es la información necesaria para comprender.
- Historial es la evolución relevante conocida.
- Ninguno significa conservar todo.

### Notificación frente a evento

- El evento es el hecho.
- La notificación comunica una situación.
- Una notificación puede desaparecer sin modificar el evento.

### Search frente a Retrieval

- Search localiza.
- Retrieval recupera con contexto.
- Ninguno interpreta ni reemplaza Memory.

### Authorization frente a Privacy

- Authorization limita quién puede actuar.
- Privacy limita qué información se usa y para qué.
- Una autorización no elimina límites de privacidad.

---

## 19. Sinónimos permitidos

| Término oficial | Sinónimo permitido | Condición |
|---|---|---|
| Conversation | conversación | Lenguaje visible |
| Message | mensaje | Uso general |
| Commitment | compromiso | Lenguaje visible |
| Commitment Proposal | propuesta de compromiso | Preferido en español |
| People | dominio People | Lenguaje interno |
| Memory | memoria de Ping | Cuando no se confunda con memoria técnica |
| AI | IA | Preferido en español |
| Authorization | autorización | Lenguaje visible y de negocio |
| Event | hecho relevante | Cuando se explique al usuario |
| Notification | notificación | Lenguaje visible |
| Search | búsqueda | Lenguaje visible |
| Retrieval | recuperación | Conservar diferencia frente a Search |
| File | archivo | Lenguaje visible |
| Attachment | adjunto | Lenguaje visible |
| Offline First | funcionamiento sin conexión | Explicación funcional |
| Synchronization | sincronización | Lenguaje visible |
| Audit | auditoría | Lenguaje de negocio |
| Traceability | trazabilidad | Lenguaje de negocio |
| Privacy | privacidad | Lenguaje visible |
| Procedencia | origen identificable | Cuando no pierda relaciones |
| Resultado desconocido | no se pudo determinar el resultado | Mensaje visible |

Los sinónimos no deben mezclarse si borran una distinción conceptual.

---

## 20. Términos que deben evitarse por ambiguos

### Tarea

Evitar como sustituto de compromiso. Reduce contexto, confirmación, responsabilidad y resolución.

### Ticket

Evitar porque convierte el asunto en flujo de soporte o sistema de estados.

### Contacto

Usar sólo para una persona conocida cuando ese matiz sea necesario. No equivale a persona.

### Perfil

Evitar para People o Memory. Ping no construye perfiles exhaustivos.

### Dato

Evitar cuando sea necesario distinguir fuente, hecho, derivación o inferencia.

### Registro

Evitar sin calificador. Puede significar captura, evidencia, persona o detalle técnico.

### Confirmado

Usar con calificador cuando no sea claro si significa:

- confirmado por el usuario;
- acción aceptada;
- información confirmada;
- resultado confirmado.

### Pendiente

Usar con calificador:

- acción pendiente;
- mensaje pendiente;
- compromiso abierto;
- actualización pendiente.

### Eliminado

No utilizar como sinónimo de “nunca existió”.

### Compartido

Debe indicar recurso, personas y alcance.

### Sincronizado

Debe indicar alcance y no ocultar resultados desconocidos.

### Inteligente

Evitar en nombres de funciones porque no explica qué hace la IA ni sus límites.

### Automático

Debe indicar la regla autorizada. Nunca debe sugerir decisión autónoma.

### Historial completo

Evitar porque la reconstrucción es relevante, autorizada y posiblemente parcial.

### Verdad

Evitar como nombre de una representación. Los dominios conservan información confirmada con procedencia.

### Propietario de la información

Usar con cuidado: la propiedad conceptual del recurso no elimina derechos, privacidad ni información de terceros.

---

## 21. Reglas de redacción y uso

### Nombrar el estado real

Usar:

- “La acción está pendiente”.
- “El mensaje fue recibido para evaluación”.
- “El compromiso fue confirmado”.

Evitar:

- “Listo”;
- “Hecho”;
- “Enviado”;

cuando el resultado todavía no se conoce.

### Nombrar al actor real

Usar:

- “El usuario confirmó”.
- “La IA sugirió”.
- “El sistema aplicó una regla autorizada”.

Evitar:

- “Ping decidió”;
- “La IA creó el compromiso”;
- “El sistema asumió”.

### Nombrar la procedencia

Usar:

- “Derivado de este mensaje”.
- “Basado en información disponible”.
- “Confirmado por el usuario”.

Evitar:

- afirmaciones sin fuente;
- “Ping sabe” cuando se trata de una inferencia.

### Nombrar límites

Usar:

- “Dentro de esta conversación”.
- “Visible para estas personas”.
- “Con la información disponible”.
- “Hasta el momento conocido”.

Evitar:

- “Todos”;
- “Siempre”;
- “Completo”;

sin alcance.

### Nombrar correcciones

Usar:

- “Corregido posteriormente”.
- “La información vigente es…”.

Evitar:

- presentar la corrección como si siempre hubiera sido conocida.

---

## 22. Decisiones pendientes y tensiones terminológicas

1. Definir si el nombre interno oficial será `Memory Domain`, `Memory Foundation` o una combinación explícita de ambos.
2. Definir el término visible definitivo para self-chat.
3. Definir si “captura” y “mensaje personal” necesitan una distinción adicional en la interfaz.
4. Definir el significado y las condiciones oficiales de “Cancelado” para Commitment, si se aprueba.
5. Definir si “Pendiente” puede utilizarse visiblemente para compromisos abiertos sin causar confusión con acciones pendientes.
6. Definir el vocabulario visible para Próximo y Atrasado.
7. Definir si “En seguimiento” se mostrará como estado, condición o explicación.
8. Definir el término visible para Commitment en todos los segmentos de usuario.
9. Definir el término visible para referencia incompleta de persona.
10. Definir si “propietario” debe reemplazarse por una expresión más natural según el recurso.
11. Definir el término visible para una posible coincidencia de identidad.
12. Definir cuándo debe decirse “confirmado por el usuario”.
13. Definir cuándo debe decirse “acción aceptada” o “acción confirmada”.
14. Resolver la sobrecarga del término “Confirmado” en Commitment, Offline First y Synchronization.
15. Definir si “Presentada” tendrá una expresión visible distinta.
16. Definir si “Recibido, pendiente de confirmación” será visible o sólo lenguaje interno.
17. Definir cómo distinguir visiblemente rechazo de imposibilidad de confirmar.
18. Definir el término visible definitivo para “Resultado desconocido”.
19. Definir cuándo puede mostrarse “Sincronizado”.
20. Definir el alcance que debe acompañar a “Sincronizado”.
21. Definir si “Reconciliación” será sólo vocabulario interno.
22. Definir el término visible para conflicto conceptual.
23. Definir el término visible para duplicado ambiguo.
24. Definir el nombre visible de Search y Retrieval si aparecen como capacidades separadas.
25. Definir si “archivo adjunto” puede utilizarse visiblemente sin distinguir File de Attachment.
26. Definir el vocabulario visible para versiones conceptuales.
27. Definir el término visible para Audit & Traceability.
28. Definir cómo nombrar evidencia mínima después de una eliminación.
29. Definir el vocabulario visible para información derivada por IA.
30. Definir categorías funcionales de información sensible.
31. Definir cuándo usar “consentimiento” y cuándo otra forma de control del usuario.
32. Definir el vocabulario visible para propósito y minimización.
33. Definir cómo nombrar una explicación parcial limitada por Privacy.
34. Definir si “usuario” o “persona usuaria” será el término preferido en lenguaje de producto.
35. Definir reglas de traducción para nombres internos en inglés.
36. Definir quién mantiene y aprueba cambios futuros del lenguaje ubicuo.

Hasta resolver estas decisiones, deben preferirse calificadores explícitos y evitarse términos que aparenten una decisión ya aprobada.

---

## 23. Criterios de aceptación

El lenguaje ubicuo se considera correctamente consolidado cuando:

1. Los conceptos centrales de los documentos 00 al 17 están representados.
2. Cada término conserva el significado aprobado.
3. Los dominios y capacidades transversales se distinguen.
4. Conversation se distingue de Message.
5. Una propuesta se distingue de un compromiso.
6. Avance se distingue de resolución.
7. Responsable se distingue de propietario.
8. Persona se distingue de usuario.
9. Recuerdo se distingue de evidencia.
10. Fuente se distingue de derivación.
11. Intención se distingue de hecho.
12. Recepción se distingue de aceptación.
13. Acceso se distingue de propósito.
14. File se distingue de Attachment.
15. Event se distingue de Audit.
16. Sincronizado se distingue de confirmado.
17. Eliminado se distingue de inexistente.
18. Se documentan sinónimos permitidos.
19. Se identifican términos ambiguos que deben evitarse.
20. Se ofrece vocabulario visible para el usuario.
21. Se ofrece vocabulario interno de negocio.
22. Los estados funcionales importantes se presentan sin inventar estados.
23. Las tensiones entre documentos se registran como decisiones pendientes.
24. No se definen nombres técnicos, clases, endpoints ni eventos de software.
25. El documento puede consultarse sin necesidad de interpretar tecnología.

---

## 24. Resumen

El lenguaje ubicuo de Ping protege el significado del producto.

Ping captura información natural y ayuda a convertirla, con control del usuario, en contexto, compromisos, seguimiento y resolución.

Conversation conserva conversaciones y mensajes. Commitment conserva compromisos confirmados y su evolución. People conserva identidad contextual. Memory conserva recuerdos relevantes sin sustituir fuentes.

La IA sugiere, interpreta y deriva; no decide ni confirma. Authorization limita acciones y acceso. Privacy limita propósito y uso. Events representa hechos. Audit conserva evidencia. Traceability relaciona origen y resultado.

Search localiza. Retrieval recupera con contexto. File es contenido. Attachment es la relación del archivo con un recurso. Notification comunica, pero no reemplaza el hecho.

Offline First protege utilidad e intención sin conexión. Synchronization relaciona cambios. Recibir no significa aceptar. Sincronizar no significa confirmar. Un resultado desconocido sigue siendo desconocido.

La regla fundamental del lenguaje es:

> Nombrar exactamente lo que Ping sabe, lo que el usuario decidió y lo que realmente ocurrió, sin convertir propuestas, inferencias o intenciones en hechos.
