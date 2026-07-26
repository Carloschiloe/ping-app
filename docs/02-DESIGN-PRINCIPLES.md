# Ping — Principios de Diseño

Este documento define los principios obligatorios de producto, experiencia y comportamiento derivados de `docs/00-VISION-PING.md` y `docs/01-MVP-SCOPE.md`.

## 1. Propósito

Los principios de este documento deben orientar cualquier decisión futura sobre Ping.

Su propósito es asegurar que cada implementación preserve la promesa:

> Ping recuerda lo importante y ayuda al usuario a cumplirlo.

Toda decisión debe contribuir al flujo:

captura natural
→ detección
→ confirmación
→ seguimiento
→ resolución

Estos principios no describen funcionalidades nuevas ni sustituyen el alcance del MVP. Definen cómo deben comportarse las capacidades aprobadas y cómo deben evaluarse las decisiones futuras.

Cuando una decisión entre en conflicto con estos principios, debe corregirse o postergarse.

## 2. Principios del producto

**El cierre es el resultado, no la creación**

El valor de Ping no termina cuando se guarda un compromiso. Termina cuando el usuario puede darle seguimiento y registrar su resolución.

**El núcleo prevalece sobre la periferia**

La captura, el contexto, los compromisos, las personas, el seguimiento y la resolución tienen prioridad sobre integraciones, interfaces y capacidades avanzadas.

**Ping conecta información que normalmente queda separada**

Una conversación, persona, fecha, compromiso y resultado deben conservar una relación comprensible. Ping no debe reducir esta información a mensajes aislados, listas sin contexto o eventos desconectados.

**La experiencia personal debe funcionar por sí sola**

El usuario debe obtener valor mediante self-chat y captura rápida. La colaboración no puede ser una condición para usar el producto ni complicar la experiencia individual.

**La actividad no sustituye al valor**

La cantidad de mensajes, capturas o pantallas visitadas no demuestra éxito. La medida principal es que los compromisos reciban seguimiento y alcancen una resolución.

**Lo existente no se habilita automáticamente**

Que una capacidad exista en el código no significa que pertenezca al MVP ni que deba mostrarse al usuario.

## 3. Principios de experiencia de usuario

**Captura antes que formularios**

La entrada debe ser natural y rápida. El usuario debe poder escribir o grabar antes de completar detalles adicionales.

**Confirmación antes que automatización**

Ping presenta sugerencias y el usuario decide. Una acción relevante no debe ejecutarse únicamente porque el sistema la detectó.

**Contexto antes que listas aisladas**

El usuario debe poder comprender por qué existe un compromiso, de dónde provino y con quién está relacionado.

**Seguimiento antes que acumulación**

La experiencia debe ayudar a reconocer qué sigue abierto, qué está atrasado, qué avanzó y qué se resolvió. No debe limitarse a acumular elementos.

**Personas antes que identificadores**

Las relaciones deben mostrarse de una forma comprensible para el usuario. Un asunto pendiente debe poder entenderse en relación con la persona correspondiente.

**El estado debe ser comprensible**

El usuario debe distinguir compromisos abiertos, próximos, atrasados y resueltos, así como conocer quién es responsable y qué ocurrió después.

**La corrección debe ser parte normal del flujo**

El usuario debe poder corregir una sugerencia antes de confirmarla y corregir o eliminar información recordada posteriormente.

**Las capacidades opcionales no deben interrumpir el recorrido principal**

Colaboración, grupos, reacciones, archivos, resúmenes o vistas adicionales sólo pueden mostrarse si no dificultan capturar, confirmar, seguir y resolver.

## 4. Principios de memoria

**La memoria es relevante, no infinita**

Ping no debe tratar todo el historial como memoria permanente. La memoria está formada por información útil para comprender y seguir asuntos importantes.

**Toda memoria tiene propietario**

Cada recuerdo pertenece a un usuario y sólo puede utilizarse dentro de los permisos correspondientes.

**Toda memoria tiene procedencia**

Un compromiso o información recordada debe conservar una fuente identificable, como una conversación, mensaje, captura o persona relacionada.

**La memoria conserva contexto**

No basta con recordar una acción. Ping debe conservar la información necesaria para comprender por qué existe, cuándo surgió, con quién se relaciona y qué ocurrió posteriormente.

**La memoria puede consultarse**

El usuario debe poder recuperar pendientes y asuntos por persona, fecha o conversación.

**La memoria puede corregirse y eliminarse**

La información recordada no es inmutable. El usuario debe conservar control sobre ella.

**Los cambios relevantes forman parte de la memoria**

Estados, seguimientos, avances, resultados y eventos del compromiso deben permitir comprender su evolución.

**La información derivada no reemplaza la fuente**

Un resumen generado por IA puede ayudar a comprender el contexto, pero no constituye por sí solo una verdad permanente ni sustituye el mensaje, conversación o compromiso original.

## 5. Principios de IA

**La IA ayuda; el usuario decide**

La IA puede interpretar, detectar, extraer, resumir y sugerir. No debe ejecutar acciones importantes sin confirmación.

**Una detección es una propuesta**

Cuando Ping identifica un posible compromiso, debe presentarlo como una sugerencia que puede confirmarse, corregirse, completarse o rechazarse.

**La IA no inventa compromisos**

Una respuesta del modelo no debe transformarse en un compromiso confirmado si no existe información suficiente o si el usuario no lo aprueba.

**La incertidumbre debe ser visible**

La IA no debe ocultar dudas sobre fechas, responsables, contexto o intención.

**La IA utiliza únicamente información autorizada**

No debe acceder a conversaciones, personas, compromisos o recuerdos que el usuario no puede consultar.

**La IA conserva procedencia**

No debe guardar hechos permanentes sin una fuente identificable.

**La salida crítica debe poder validarse**

Las funciones críticas deben conservar reglas determinísticas y validación estructurada. La IA no sustituye estados, permisos ni decisiones explícitas del usuario.

**La IA no toma decisiones personales por el usuario**

No debe tomar decisiones financieras, legales o personales ni actuar como un sistema autónomo fuera del control del usuario.

## 6. Principios de privacidad

**Privacidad desde el diseño**

La autorización no es una mejora posterior. Forma parte del comportamiento esperado de conversaciones, mensajes, compromisos, personas y memoria.

**Acceso mínimo y explícito**

Una persona sólo debe acceder a la información que le pertenece o para la cual tiene autorización.

**La colaboración no elimina la propiedad**

Que un compromiso o conversación involucre a varias personas no convierte toda su información en pública.

**La fuente conserva su protección**

Archivos, audios, mensajes y conversaciones asociados a un recuerdo deben mantener controles coherentes con el recurso de origen.

**El usuario conserva control**

El producto debe permitir corregir y eliminar información recordada cuando corresponda.

**Los datos no se reutilizan sin propósito**

La información personal debe utilizarse para ayudar al usuario a comprender, recordar, seguir o resolver sus asuntos, no para crear funciones ajenas a la promesa principal.

**La IA respeta los mismos límites**

El uso de IA no amplía los permisos del usuario ni autoriza a consultar información adicional.

## 7. Principios de arquitectura

**La arquitectura sirve al producto móvil**

Durante la validación inicial, las decisiones deben favorecer una experiencia móvil estable y no anticipar interfaces futuras.

**Ping Core mantiene un núcleo coherente**

Conversation, Commitment, People y Memory Foundation deben poder colaborar sin perder autorización, contexto ni procedencia.

**La modularidad no implica distribución**

Ping se mantendrá como un monolito modular durante los próximos 6 a 12 meses. Separar responsabilidades no exige crear microservicios.

**Una capacidad interna antes que una plataforma general**

Memory Foundation será inicialmente una capacidad interna del producto, no un microservicio ni una base vectorial.

**La complejidad requiere evidencia**

No se introducirán microservicios, Kubernetes, Kafka, una base vectorial, Redis o un framework general de plugins sin una necesidad demostrada.

**Las capacidades periféricas deben ser separables**

Llamadas, calendarios múltiples, modo Operación, checklists y reportes no deben dominar ni bloquear el núcleo del producto.

**La expansión comparte el mismo núcleo sólo después de validarlo**

Web, escritorio, televisión, automóvil y otros clientes pertenecen a la visión de largo plazo. No deben condicionar el diseño de la primera experiencia antes de estabilizar Ping Core.

## 8. Principios para nuevas funcionalidades

Antes de aprobar una funcionalidad se debe responder:

1. ¿Ayuda a capturar algo importante?
2. ¿Ayuda a comprenderlo?
3. ¿Ayuda a recordarlo?
4. ¿Ayuda a darle seguimiento?
5. ¿Ayuda a resolverlo?
6. ¿Conserva contexto y procedencia?
7. ¿Respeta autorización y privacidad?
8. ¿Es necesaria para validar el producto?

Además:

- una funcionalidad no se aprueba sólo porque sea técnicamente posible;
- una funcionalidad existente no se habilita sólo porque ya fue implementada;
- una funcionalidad opcional no puede bloquear el recorrido obligatorio;
- una integración no se añade si distrae del núcleo;
- una automatización no puede eliminar la confirmación del usuario;
- una nueva vista no debe fragmentar la comprensión de los compromisos;
- una nueva métrica no debe reemplazar seguimiento y resolución como medida de valor.

Si no existe una respuesta clara y respaldada por la visión o por evidencia de uso, la funcionalidad debe postergarse.

## 9. Ejemplos de buenas decisiones

- permitir que el usuario escriba una frase natural y revisar después los detalles detectados;
- mostrar “Esto parece un compromiso. ¿Quieres guardarlo?” antes de crear una acción relevante;
- permitir corregir fecha, responsable o descripción antes de confirmar;
- mostrar el mensaje o conversación que originó un compromiso;
- destacar un compromiso atrasado junto con su contexto y responsable;
- registrar un avance sin marcar prematuramente el asunto como resuelto;
- conservar el resultado final y el historial de cambios;
- permitir consultar asuntos abiertos relacionados con una persona;
- identificar claramente un resumen de IA como contenido derivado;
- permitir corregir o eliminar información recordada;
- mantener una capacidad avanzada oculta si no es necesaria para validar el MVP;
- postergar una integración que no mejora captura, seguimiento o resolución;
- mantener el producto móvil como primera experiencia mientras se estabiliza el núcleo.

## 10. Ejemplos de decisiones prohibidas

- crear automáticamente un compromiso sugerido por IA sin confirmación;
- ejecutar una acción importante únicamente a partir de una interpretación del modelo;
- presentar una sugerencia incierta como un hecho confirmado;
- tratar un resumen de IA como sustituto permanente de la fuente;
- recordar información sin propietario, contexto o procedencia;
- permitir que un usuario consulte conversaciones o recuerdos no autorizados;
- hacer públicos archivos, audios o mensajes privados por conveniencia;
- impedir que el usuario corrija o elimine información recordada;
- reducir Ping a una lista de tareas sin origen ni personas relacionadas;
- medir el éxito principalmente por la cantidad de mensajes enviados;
- priorizar la acumulación de compromisos sobre su seguimiento y cierre;
- exigir colaboración o grupos para obtener valor personal;
- convertir llamadas, calendarios, Operación, checklists o reportes en condición para terminar el MVP;
- diseñar primero web, escritorio, televisión, automóvil u otras interfaces;
- convertir Ping en un chatbot genérico, una copia de WhatsApp, un ERP, una plataforma industrial o un calendario completo;
- introducir microservicios, Kubernetes, Kafka, una base vectorial, Redis o un framework de plugins sin evidencia;
- habilitar una funcionalidad sólo porque ya existe en el código;
- añadir una función que no contribuya claramente a capturar, comprender, recordar, seguir o resolver algo importante.
