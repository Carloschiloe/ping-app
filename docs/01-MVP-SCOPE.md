# Ping — Alcance del MVP

Este documento deriva el alcance oficial del MVP de Ping desde `docs/00-VISION-PING.md`.

## 1. Objetivo del MVP

El objetivo del MVP es validar que Ping puede ayudar a una persona a recordar lo importante y cumplir aquello a lo que se comprometió.

El MVP debe demostrar de principio a fin el flujo:

captura natural
→ detección
→ confirmación
→ seguimiento
→ resolución

La validación no termina cuando se crea un compromiso. El MVP debe demostrar que Ping conserva su contexto, ayuda a darle seguimiento y permite registrar su resolución.

El primer producto será móvil y debe funcionar para un solo usuario mediante self-chat y captura rápida, sin depender de colaboración, grupos avanzados ni integraciones periféricas.

## 2. Usuario objetivo

El usuario objetivo inicial es una persona que maneja muchas conversaciones, responsabilidades y asuntos pendientes durante el día y necesita evitar que sus compromisos se pierdan.

Puede ser:

- trabajador;
- profesional;
- jefe de equipo;
- emprendedor;
- encargado operacional;
- persona que necesita organizar su vida personal.

La experiencia principal debe ser útil individualmente. La colaboración puede existir, pero no debe reemplazar ni complicar el uso personal.

**Decisión pendiente:** seleccionar el primer segmento específico dentro de estos perfiles para realizar la validación inicial.

## 3. Problemas que resuelve

El MVP debe resolver los siguientes problemas:

- los compromisos quedan dispersos entre conversaciones, mensajes, audios, reuniones, llamadas y recuerdos;
- el usuario olvida qué prometió o solicitó;
- el usuario pierde quién quedó responsable;
- el usuario pierde la fecha o plazo;
- el usuario no recuerda en qué conversación o mensaje nació un asunto;
- el usuario no tiene claridad sobre qué asuntos siguen abiertos;
- el usuario no registra qué seguimiento realizó;
- el usuario no conserva el resultado final;
- las conversaciones, tareas y calendarios mantienen información separada, sin conectar persona, contexto, compromiso y seguimiento.

El MVP no busca almacenar más mensajes ni producir una lista aislada de tareas. Debe preservar el contexto necesario para comprender por qué existe cada compromiso y ayudar a avanzar hacia su cierre.

## 4. Casos de uso obligatorios

1. Un usuario se registra e inicia sesión.
2. Un usuario abre un self-chat o una conversación disponible.
3. Un usuario escribe o graba una captura de manera natural.
4. Ping detecta que la captura puede contener un compromiso.
5. Ping presenta la sugerencia: “Esto parece un compromiso. ¿Quieres guardarlo?”.
6. El usuario confirma, corrige o rechaza la sugerencia antes de crear el compromiso.
7. El compromiso conserva su fuente y el contexto de origen.
8. El usuario consulta sus compromisos en un tablero.
9. El usuario consulta pendientes por persona, fecha o conversación.
10. Ping muestra compromisos abiertos, próximos o atrasados y realiza seguimiento.
11. El usuario registra avances o cambia el estado de un compromiso.
12. El usuario resuelve el compromiso y conserva el resultado y su historial.
13. El usuario puede corregir o eliminar información recordada que le pertenece.

## 5. Flujo principal del producto

### Captura natural

El usuario escribe o graba información de manera rápida, sin completar primero un formulario complejo.

### Detección

Ping interpreta la captura e identifica un posible compromiso, incluyendo la información disponible sobre descripción, fecha, responsable, persona y contexto.

La detección es una sugerencia. Ping no debe inventar un compromiso ni presentarlo como una verdad confirmada.

### Confirmación

Ping muestra la sugerencia al usuario para que pueda:

- confirmarla;
- corregirla;
- completarla;
- rechazarla.

Ningún compromiso sugerido por IA debe convertirse en una acción relevante sin confirmación del usuario.

### Seguimiento

Una vez confirmado, el compromiso permanece abierto hasta su cierre. Ping debe ayudar al usuario a reconocer que sigue pendiente y a avanzar mediante información como:

- fecha o plazo;
- estado;
- responsable;
- contexto;
- avances;
- recordatorios;
- asuntos atrasados;
- acciones posteriores.

### Resolución

El usuario registra que el asunto fue resuelto y conserva:

- el resultado;
- el contexto de origen;
- las personas relacionadas;
- los eventos y cambios relevantes;
- el seguimiento realizado.

## 6. Funcionalidades obligatorias

- aplicación móvil como producto inicial;
- registro, inicio y cierre de sesión;
- self-chat o conversación para captura;
- captura rápida mediante texto;
- captura mediante audio;
- detección de posibles compromisos;
- extracción de información disponible, como descripción, fecha o plazo y responsable;
- confirmación, corrección y rechazo antes de crear un compromiso sugerido;
- creación y consulta de compromisos;
- propietario y responsable del compromiso;
- vínculo con conversación y mensaje de origen;
- conservación de contexto y procedencia;
- estados del compromiso;
- prioridad cuando corresponda;
- tablero de compromisos;
- consulta de pendientes por persona, fecha o conversación;
- identificación de compromisos abiertos, próximos, atrasados y resueltos;
- seguimiento posterior a la creación;
- recordatorios o avisos cuando corresponda;
- registro de avances y cambios de estado;
- resolución y resultado final;
- historial de eventos o cambios relevantes;
- relación básica con personas o contactos;
- acceso autorizado a conversaciones, mensajes, compromisos y recuerdos;
- posibilidad de corregir o eliminar información recordada;
- tratamiento de los resúmenes de IA como información derivada, no como verdad primaria.

## 7. Funcionalidades opcionales

Las siguientes funcionalidades son compatibles con la visión, pero no son necesarias para considerar terminado el MVP. Sólo pueden habilitarse si no complican el flujo personal principal:

- colaboración básica con otra persona;
- grupos básicos;
- reacciones;
- archivos asociados a una conversación;
- resúmenes de contexto generados por IA;
- sugerencias adicionales de seguimiento;
- vinculación de nuevos mensajes con un compromiso abierto;
- presencia básica;
- vistas adicionales de pendientes con una persona.

La existencia actual de alguna de estas capacidades en el código no la convierte en obligatoria para el MVP.

**Decisión pendiente:** determinar cuáles, si alguna, se habilitarán durante la primera validación.

## 8. Funcionalidades fuera del MVP

Quedan fuera del alcance oficial del MVP:

- grupos avanzados;
- presencia avanzada;
- calendarios externos múltiples;
- llamadas;
- grabaciones;
- reportes complejos;
- insights avanzados;
- modo Operación;
- checklists;
- reportes de turno;
- un chatbot genérico;
- un calendario completo;
- un sistema ERP;
- una plataforma industrial;
- un reemplazo de Alexa;
- una red social;
- un marketplace o framework general de plugins;
- una IA que actúa sin control del usuario;
- web;
- aplicación de escritorio;
- televisión;
- automóvil;
- dispositivos dedicados;
- expansión multidispositivo antes de validar el producto móvil.

Estas capacidades pueden conservarse en el código cuando ya existan, pero no deben liderar, bloquear ni ampliar la primera validación del producto.

## 9. Criterios para considerar el MVP terminado

El MVP se considera funcionalmente terminado cuando:

1. El flujo completo de captura, detección, confirmación, seguimiento y resolución funciona en la aplicación móvil.
2. Un usuario puede obtener valor mediante self-chat y captura rápida sin depender de colaboración.
3. La IA sugiere compromisos y el usuario conserva el control para confirmarlos, corregirlos o rechazarlos.
4. Ninguna acción relevante sugerida por IA se ejecuta sin confirmación.
5. Cada compromiso confirmado conserva una fuente identificable y contexto suficiente para comprender su origen.
6. El usuario puede consultar compromisos por persona, fecha o conversación.
7. Ping distingue asuntos abiertos, atrasados y resueltos.
8. El seguimiento continúa después de crear el compromiso y permite registrar avances.
9. El usuario puede resolver un compromiso y conservar su resultado e historial.
10. El usuario puede corregir o eliminar información recordada que le pertenece.
11. El acceso a conversaciones, compromisos, personas y memoria respeta autorización y privacidad.
12. Los resúmenes de IA permanecen identificados como información derivada.
13. Las funcionalidades opcionales o fuera del MVP no son necesarias para completar el flujo principal.
14. Puede medirse cuántos compromisos reciben seguimiento y alcanzan una resolución.

Los umbrales cuantitativos de éxito no se fijan en este documento.

**Decisión pendiente:** definir los valores mínimos de adopción, seguimiento y resolución necesarios para declarar validado el MVP.

## 10. Riesgos de ampliar el alcance

- convertir Ping en una aplicación de mensajería y desplazar memoria y seguimiento;
- medir actividad por mensajes enviados en lugar de compromisos resueltos;
- añadir formularios que vuelvan lenta la captura;
- automatizar acciones antes de tener confirmación y confianza del usuario;
- tratar resúmenes de IA como hechos permanentes;
- habilitar colaboración avanzada antes de validar la experiencia individual;
- dedicar la primera beta a llamadas, calendarios, Operación, checklists o reportes;
- crear listas de tareas sin contexto ni procedencia;
- acumular compromisos sin ayudar a cerrarlos;
- ampliar interfaces antes de estabilizar el producto móvil;
- incorporar integraciones que no contribuyan al flujo principal;
- postergar privacidad, corrección o borrado para priorizar nuevas funciones.

Toda ampliación debe evaluarse con los criterios aprobados en la visión. Si no ayuda claramente a capturar, comprender, recordar, seguir o resolver algo importante, debe postergarse.

## 11. Métricas de validación del MVP

La métrica principal es:

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

La cantidad de mensajes enviados no es la métrica principal del MVP.

**Decisión pendiente:** definir el período de medición, qué constituye un seguimiento útil y los umbrales de éxito de cada métrica.

## 12. Decisiones pendientes del fundador

1. Seleccionar el primer segmento de usuario para la validación inicial.
2. Definir si la primera validación será exclusivamente personal o incluirá colaboración básica.
3. Determinar cuáles funcionalidades opcionales estarán visibles en la primera beta.
4. Definir los umbrales cuantitativos para considerar validado el MVP.
5. Definir el período utilizado para medir seguimiento y resolución.
6. Definir qué comportamiento contará como seguimiento útil.
7. Definir el alcance inicial de las consultas por persona cuando existan contactos y usuarios registrados.
