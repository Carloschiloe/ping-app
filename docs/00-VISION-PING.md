# Ping — Visión de Producto

Estado: Borrador estratégico v0.1
Responsable de producto: Fundador
Responsable técnico: CTO
Producto: Ping

---

## 1. Qué es Ping

Ping es una aplicación de memoria y seguimiento personal que ayuda al usuario a recordar lo importante y cumplir aquello a lo que se comprometió.

Ping permite que una persona escriba, hable, converse o registre algo de manera natural y que el sistema pueda transformar esa información en contexto útil, compromisos claros y seguimiento posterior.

Ping no busca solamente almacenar mensajes.

Busca evitar que los asuntos importantes se pierdan dentro de conversaciones, notas, audios, llamadas o recuerdos aislados.

---

## 2. Promesa principal

> Ping recuerda lo importante y ayuda al usuario a cumplirlo.

El producto debe demostrar esta promesa mediante un flujo sencillo:

captura natural
→ detección
→ confirmación
→ seguimiento
→ resolución

Cada función del producto debe contribuir directamente a una o más etapas de este flujo.

---

## 3. Problema que resuelve

Las personas reciben y generan compromisos constantemente:

- durante conversaciones;
- en mensajes;
- mediante audios;
- en reuniones;
- durante llamadas;
- al pensar o recordar algo;
- al coordinarse con otras personas.

Estos compromisos suelen quedar dispersos.

El usuario puede olvidar:

- qué prometió;
- quién quedó responsable;
- cuándo debía cumplirse;
- en qué conversación nació;
- qué seguimiento realizó;
- cuál fue el resultado final.

Las aplicaciones de mensajería almacenan conversaciones.

Las aplicaciones de tareas almacenan listas.

Los calendarios almacenan eventos.

Ping conecta conversación, persona, contexto, compromiso y seguimiento.

---

## 4. Usuario inicial

El usuario inicial de Ping es una persona que maneja muchas conversaciones, responsabilidades y asuntos pendientes durante el día.

Puede ser:

- trabajador;
- profesional;
- jefe de equipo;
- emprendedor;
- encargado operacional;
- persona que necesita organizar su vida personal.

La primera experiencia debe funcionar incluso para un solo usuario mediante self-chat y captura rápida.

La colaboración entre personas existe, pero no debe reemplazar ni complicar la experiencia personal principal.

---

## 5. El momento de valor

El momento principal de valor ocurre cuando el usuario escribe o dicta algo naturalmente y Ping responde:

“Esto parece un compromiso. ¿Quieres guardarlo?”

Después Ping debe:

- recordar el contexto;
- mostrar el responsable;
- conservar la fuente;
- recordar la fecha;
- permitir seguimiento;
- avisar cuando corresponda;
- registrar su resolución.

El valor no termina al crear una tarea.

El valor termina cuando Ping ayuda a cerrar el asunto.

---

## 6. Qué significa memoria en Ping

La memoria de Ping no es un historial infinito ni una copia completa de todas las conversaciones.

Memoria es información relevante que:

- pertenece a un usuario;
- tiene una fuente identificable;
- tiene contexto;
- puede relacionarse con personas;
- puede consultarse;
- puede corregirse;
- puede eliminarse;
- puede usarse para ayudar al usuario posteriormente.

En la primera versión, la memoria está formada principalmente por:

- compromisos;
- eventos del compromiso;
- conversaciones de origen;
- mensajes de origen;
- personas relacionadas;
- fechas;
- responsables;
- estados;
- seguimientos;
- resultados.

Los resúmenes generados por IA son información derivada.

No constituyen por sí solos una verdad permanente.

---

## 7. Qué significa compromiso

Un compromiso es algo que una persona:

- prometió hacer;
- solicitó a otra persona;
- aceptó realizar;
- necesita recordar;
- debe revisar;
- debe decidir;
- debe confirmar;
- espera recibir.

Un compromiso debe poder tener:

- propietario;
- responsable;
- participantes;
- origen;
- descripción;
- fecha o plazo;
- estado;
- prioridad;
- seguimiento;
- resultado;
- historial de cambios.

La IA puede sugerir un compromiso.

La creación o ejecución de acciones relevantes debe ser confirmada por el usuario.

---

## 8. Qué significa seguimiento

Seguimiento no es únicamente enviar una notificación.

Seguimiento significa que Ping comprende que un asunto sigue abierto y ayuda a avanzar hacia su cierre.

Puede incluir:

- recordar antes del vencimiento;
- mostrar compromisos atrasados;
- preguntar si hubo avances;
- registrar una respuesta;
- cambiar el estado;
- vincular nuevos mensajes;
- recomendar una acción;
- mostrar asuntos pendientes con una persona;
- advertir que algo continúa sin resolver.

---

## 9. Qué significa persona

Una persona en Ping no es solamente un contacto con nombre y teléfono.

Es una entidad contextual relacionada con:

- conversaciones;
- compromisos;
- solicitudes;
- promesas;
- asuntos abiertos;
- historial compartido;
- roles;
- organizaciones, cuando corresponda.

Ping debe permitir responder preguntas como:

- ¿Qué tengo pendiente con esta persona?
- ¿Qué me prometió?
- ¿Qué le prometí?
- ¿Cuándo hablamos de este asunto?
- ¿Qué compromisos siguen abiertos?
- ¿Qué ocurrió finalmente?

Este concepto formará el People Domain de Ping.

---

## 10. Qué significa contexto

Contexto es la información necesaria para comprender por qué existe un compromiso.

Puede incluir:

- mensaje de origen;
- conversación;
- persona;
- fecha;
- archivo;
- audio;
- asunto;
- mensajes relacionados;
- acciones posteriores.

Ping no debe mostrar solamente:

“Llamar a Juan”.

Debe poder mostrar:

“Llamar a Juan por la cotización comentada ayer en la conversación del proyecto”.

---

## 11. Componentes principales

Ping se organizará inicialmente alrededor de cuatro dominios:

### Conversation Domain

Gestiona:

- conversaciones;
- participantes;
- mensajes;
- grupos básicos;
- reacciones;
- archivos asociados;
- contexto conversacional.

### Commitment Domain

Gestiona:

- creación;
- confirmación;
- asignación;
- estados;
- eventos;
- plazos;
- seguimiento;
- resolución.

### People Domain

Gestiona:

- personas;
- contactos;
- relaciones;
- compromisos compartidos;
- contexto por persona.

### Memory Foundation

Permite recuperar información relevante de Conversation, Commitment y People con autorización, procedencia y trazabilidad.

Memory Foundation no será inicialmente un microservicio ni una base vectorial.

Será una capacidad interna del monolito modular.

---

## 12. Rol de la inteligencia artificial

La IA ayuda a:

- interpretar lenguaje natural;
- detectar posibles compromisos;
- extraer fechas y responsables;
- resumir contexto;
- sugerir seguimientos;
- responder preguntas sobre información autorizada;
- transformar audio en información útil.

La IA no debe:

- ejecutar acciones importantes sin confirmación;
- inventar compromisos;
- tratar un resumen como verdad primaria;
- acceder a conversaciones no autorizadas;
- guardar hechos permanentes sin procedencia;
- tomar decisiones financieras, legales o personales por el usuario;
- ocultar incertidumbre.

Las funciones críticas deben conservar reglas determinísticas y validación estructurada.

---

## 13. Producto inicial

El primer producto seguirá siendo móvil.

Debe permitir:

1. Registrarse e iniciar sesión.
2. Abrir un self-chat o conversación.
3. Escribir o grabar una captura.
4. Detectar un compromiso.
5. Confirmarlo o corregirlo.
6. Consultarlo en un tablero.
7. Recibir seguimiento.
8. Ver su contexto de origen.
9. Resolverlo.
10. Consultar pendientes por persona, fecha o conversación.

---

## 14. Capacidades que se mantienen, pero no lideran el MVP

Las siguientes capacidades pueden conservarse en el código, pero no deben dominar la primera beta:

- grupos avanzados;
- presencia avanzada;
- calendarios externos múltiples;
- llamadas;
- grabaciones;
- reportes complejos;
- insights avanzados;
- modo Operación;
- checklists;
- reportes de turno.

Se habilitarán únicamente cuando exista evidencia de necesidad y estabilidad técnica.

---

## 15. Qué no es Ping

Ping no será inicialmente:

- otra copia de WhatsApp;
- un chatbot genérico;
- una lista de tareas convencional;
- un calendario completo;
- un sistema ERP;
- una plataforma industrial;
- un reemplazo de Alexa;
- una red social;
- un marketplace de plugins;
- un sistema de vigilancia;
- una IA que actúa sin control del usuario.

---

## 16. Principios de producto

### Captura antes que formularios

La entrada debe ser natural y rápida.

### Confirmación antes que automatización

La IA sugiere; el usuario decide.

### Contexto antes que listas aisladas

Un compromiso debe conservar su origen.

### Seguimiento antes que acumulación

El objetivo es cerrar asuntos, no llenar tableros.

### Personas antes que identificadores

El usuario debe comprender con quién tiene asuntos pendientes.

### Privacidad desde el diseño

Cada recuerdo pertenece a alguien y debe tener autorización explícita.

### Corrección y borrado

El usuario debe poder corregir o eliminar información recordada.

### Núcleo antes que periferia

No se añadirán interfaces o integraciones que distraigan del flujo central.

---

## 17. Arquitectura estratégica

Ping se mantendrá como un monolito modular durante los próximos 6 a 12 meses.

Componentes:

- aplicación móvil;
- API versionable;
- autenticación;
- Conversation Domain;
- Commitment Domain;
- People Domain;
- Memory Foundation;
- AI Orchestration;
- notificaciones y programación;
- Storage privado;
- adaptadores externos;
- observabilidad;
- Supabase/PostgreSQL.

No se introducirán sin evidencia:

- microservicios;
- Kubernetes;
- Kafka;
- una base vectorial;
- Redis;
- un framework general de plugins.

---

## 18. Visión de largo plazo

En el futuro, Ping Core podrá ser utilizado desde:

- móvil;
- web;
- escritorio;
- tablet;
- televisión;
- automóvil;
- dispositivos dedicados;
- aplicaciones empresariales.

Estas interfaces compartirán:

- identidad;
- conversaciones;
- compromisos;
- personas;
- memoria;
- seguimiento;
- herramientas autorizadas.

La expansión multidispositivo sólo comenzará después de validar el producto móvil y estabilizar Ping Core.

---

## 19. Criterio para aprobar una función

Antes de desarrollar una nueva función se debe responder:

1. ¿Ayuda a capturar algo importante?
2. ¿Ayuda a comprenderlo?
3. ¿Ayuda a recordarlo?
4. ¿Ayuda a darle seguimiento?
5. ¿Ayuda a resolverlo?
6. ¿Conserva contexto y procedencia?
7. ¿Respeta autorización y privacidad?
8. ¿Es necesaria para validar el producto?

Si no existe una respuesta clara, la función debe postergarse.

---

## 20. Métrica principal inicial

La métrica principal no será la cantidad de mensajes enviados.

Será:

> Porcentaje de compromisos creados en Ping que reciben seguimiento y alcanzan una resolución.

Métricas complementarias:

- compromisos detectados;
- compromisos confirmados;
- compromisos resueltos;
- compromisos vencidos;
- tiempo medio hasta resolución;
- usuarios que regresan a consultar su memoria;
- seguimientos útiles;
- porcentaje de sugerencias corregidas o rechazadas.

---

## 21. Declaración final

Ping no busca que las personas hablen más con una aplicación.

Busca que olviden menos, comprendan mejor sus responsabilidades y cumplan aquello que realmente importa.