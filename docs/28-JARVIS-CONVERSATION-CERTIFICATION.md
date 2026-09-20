# Certificación física — conversaciones completas en iPhone

Estado: código completo y probado con pruebas automatizadas (backend
115/115 archivos, 2088/2088 pruebas; mobile 49/49 archivos, 824/824
pruebas), sin certificación física. Este documento complementa, no
reemplaza, a [docs/27-M7-M8-PHYSICAL-CERTIFICATION-SCENARIOS.md](27-M7-M8-PHYSICAL-CERTIFICATION-SCENARIOS.md).

La diferencia con ese documento es deliberada: allí cada escenario aísla
un mecanismo con la frase mínima necesaria para activarlo. Aquí cada
escenario es una **conversación completa**, con el desorden natural de
cómo alguien realmente le habla a un asistente — cambios de tema,
correcciones a mitad de camino, referencias sueltas a algo dicho antes,
una tarea que empieza en una app y termina confirmada en otra pantalla.
El objetivo es certificar que Ping sostiene el hilo completo de una
tarea real de principio a fin, no solo que cada mecanismo individual
responde a su disparador exacto.

No fusionar la rama a `codex/staging-beta` para esta prueba sin
autorización explícita — sigue apilada sobre la PR #1 para evitar el
despliegue automático de staging. Confirmar el hash exacto de la rama
probada (`test/m7-read-followup-regression-20260920`, o el commit
específico si hay pushes posteriores) antes de empezar.

## Antes de empezar

- Usar una cuenta de prueba, nunca una cuenta real de producción.
- Para los escenarios que requieren una segunda persona (compromisos
  compartidos), usar una segunda cuenta de prueba, no una cuenta real de
  un tercero.
- Ejecutar cada conversación en una sesión nueva de la app cuando el
  escenario lo indique explícitamente ("cerrar y reabrir") — esto es lo
  que certifica continuidad real y no solo memoria de la sesión en curso.
- Anotar el resultado de cada PASO, no solo el resultado final: si la
  conversación se rompe a mitad de camino, el paso exacto donde ocurre
  es la evidencia útil, no solo "falló el escenario 3".
- No usar datos personales reales sensibles. Los compromisos y hechos de
  ejemplo deben ser genéricos aunque coherentes entre sí.

## Escenario A — Organizar la semana en una sola conversación

Objetivo: confirmar que Ping sostiene múltiples tareas relacionadas
dentro de un mismo hilo, sin perder de vista cuál compromiso se está
discutiendo en cada momento, incluyendo una corrección a mitad de
camino y una desambiguación real.

Preparación: tener (o crear durante el escenario) al menos dos
compromisos propios llamados igual, por ejemplo dos compromisos
"Entrenar" en días distintos de la semana.

Conversación (un solo hilo, sin cerrar la app entre turnos):

1. «Agenda entrenar el martes a las 7».
2. Confirmar el plan mostrado y confirmarlo.
3. «Agenda entrenar también el jueves a las 7».
4. Confirmar este segundo plan y confirmarlo (ahora existen dos
   compromisos "Entrenar").
5. «Mueve entrenar al viernes».
6. Confirmar que Ping pregunta cuál de los dos "Entrenar" (martes o
   jueves), mostrando ambas fechas.
7. Responder: «el del jueves».
8. Confirmar que el plan mostrado ahora dice viernes y se refiere al
   compromiso que antes era del jueves — no al del martes.
9. Sin confirmar todavía ese plan, decir: «mejor el sábado».
10. Confirmar que aparece un plan **nuevo** que dice sábado, nunca
    viernes.
11. Confirmar ese plan.
12. Preguntar: «¿qué tengo esta semana?» y confirmar que aparecen
    exactamente dos compromisos "Entrenar": uno el martes (sin tocar) y
    uno el sábado (el que se movió dos veces).

**FALLA si:** el paso 6 no pregunta cuál (mueve el equivocado
silenciosamente); el paso 8 apunta al compromiso del martes en vez del
jueves; el paso 10 sigue mostrando viernes; el paso 12 muestra una
fecha distinta a sábado para el compromiso movido, o muestra un tercer
compromiso fantasma.
**ANOTAR si:** cualquier paso individual es correcto pero el lenguaje
usado para referirse a "el del jueves" se siente forzado o poco natural
en pantalla.

## Escenario B — Un compromiso compartido, de principio a fin

Objetivo: confirmar que una conversación sobre un compromiso con otra
persona sostiene el contexto a través de la propuesta, la respuesta de
la otra parte, y una pregunta posterior sobre el resultado — cruzando
lectura y escritura en el mismo hilo.

Preparación: dos cuentas de prueba, A (quien usa Ping en este
escenario) y B (la contraparte, puede operar desde la app o
directamente si hace falta simular su respuesta).

Conversación desde la cuenta A:

1. «Propónle a [B] almorzar el miércoles a la 1».
2. Confirmar el plan y confirmarlo.
3. Preguntar de inmediato: «¿qué le propuse a [B]?» — confirmar que la
   respuesta cita el almuerzo del miércoles recién creado, sin que se
   haya nombrado de nuevo explícitamente en esta pregunta.
4. Desde la cuenta B, aceptar la propuesta (vía la app, normalmente).
5. Desde la cuenta A, sin reabrir la app si es posible, preguntar:
   «¿[B] confirmó el almuerzo?».
6. Confirmar que la respuesta refleja el estado real (aceptado), citando
   la fecha correcta.
7. Dos turnos después, sobre un tema distinto («¿qué tengo hoy?»),
   volver a preguntar: «¿y ya quedó confirmado lo del miércoles?».
8. Confirmar que Ping vuelve a identificar correctamente el compromiso
   del paso 1 pese a la interrupción temática en el medio.

**FALLA si:** el paso 3 no encuentra la propuesta recién creada; el
paso 6 muestra un estado desactualizado o incorrecto; el paso 8 pierde
la referencia tras el tema intermedio o cita un compromiso distinto.
**ANOTAR si:** el paso 6 requiere que la cuenta A cierre y reabra la
app para reflejar la respuesta de B (latencia de sincronización, no un
fallo del mecanismo conversacional en sí).

## Escenario C — Un hecho recordado, usado después en una tarea real

Objetivo: confirmar que un hecho guardado explícitamente con
`remember_fact` no solo se recupera cuando se pregunta directamente por
él, sino que además puede sostener el contexto de una tarea distinta
más adelante — el punto completo de tener memoria útil en un asistente
ambiental.

1. «Recuerda que mi hermana se llama Valentina y su cumpleaños es el 14
   de octubre» (o un hecho real y no sensible equivalente, con dos
   datos distintos en la misma frase).
2. Confirmar que el plan mostrado cita ese contenido literal.
3. Confirmar el plan.
4. **Cerrar completamente la app y volver a abrirla.**
5. En una conversación nueva, preguntar: «¿cuándo es el cumpleaños de
   mi hermana?».
6. Confirmar que la respuesta da la fecha correcta (14 de octubre) sin
   pedir que se repita el nombre.
7. Sin cerrar la app, decir: «Recuérdame comprarle un regalo a Valentina
   antes de su cumpleaños».
8. Confirmar que el plan de recordatorio se crea razonablemente (la
   fecha exacta del recordatorio puede variar; lo que se certifica es
   que la tarea se crea con el nombre correcto, no que Ping infiera una
   fecha específica de antelación por sí solo salvo que el usuario la
   haya dado).
9. Preguntar, en un tercer momento, con una reformulación distinta a la
   original: «¿qué sabes de mi hermana?».
10. Confirmar que la respuesta incluye el hecho guardado en el paso 1,
    aunque la pregunta no use las mismas palabras.

**FALLA si:** el paso 6 no encuentra el hecho (el fallo más grave de
todo memory: guardado exitoso, pero invisible para siempre); el paso 10
no recupera el hecho con una reformulación natural.
**ANOTAR si:** el paso 8 requiere que el usuario repita el nombre
completo en vez de un pronombre o referencia corta.

## Escenario D — Cancelar en medio de una conversación con distracciones

Objetivo: confirmar que cancelar un compromiso sostiene el contexto
igual que reprogramar o completar, incluyendo desambiguación por fecha,
y que una pregunta histórica sobre algo ya cancelado nunca se confunde
con una nueva acción — el escenario más nuevo (M-9) puesto a prueba
dentro de una conversación realista, no aislado.

Preparación: crear (o tener) dos compromisos propios con el mismo
título, por ejemplo dos "Reunión con el equipo", en días distintos.

1. «Cancela la reunión con el equipo».
2. Confirmar que Ping pregunta cuál de las dos, mostrando ambas fechas.
3. Antes de responder la pregunta, cambiar de tema: «¿qué tengo
   pendiente hoy?» — confirmar que esto se responde con normalidad,
   sin quedar atrapado en la pregunta anterior.
4. Retomar: «Cancela la reunión con el equipo» de nuevo.
5. Esta vez responder directamente a la pregunta: «la del jueves».
6. Confirmar que el plan mostrado nombra correctamente esa reunión (la
   del jueves, no la otra) y confirmarlo.
7. Verificar que la reunión del jueves quedó cancelada y la otra
   reunión con el mismo nombre sigue intacta.
8. Una conversación después, preguntar: «¿cancelamos la reunión con el
   equipo?» como pregunta sobre lo ya ocurrido.
9. Confirmar que la respuesta es informativa (confirma que sí, cuál, y
   cuándo se canceló) y que en ningún momento se ofrece un plan de
   acción nuevo ni se pide confirmar nada.

**FALLA si:** el paso 3 rompe el flujo en vez de responder con
normalidad; el paso 6 cancela la reunión equivocada o no logra
distinguir cuál; el paso 9 ofrece un plan de acción o confunde la
pregunta histórica con una nueva orden.
**ANOTAR si:** el paso 2 y el paso 5 (la segunda vez que se pide
cancelar) generan preguntas de desambiguación con redacciones
ligeramente distintas entre sí.

## Escenario E — Una tarea que cruza voz y texto

Objetivo: confirmar que el contexto conversacional sobrevive un cambio
de modalidad de entrada, ya que la visión de producto asume que el
usuario puede alternar libremente entre hablar y escribir dentro de la
misma tarea.

1. Por voz, decir: «Agenda comprar el regalo de cumpleaños para el
   sábado».
2. Confirmar el plan mostrado (verificando que la transcripción se
   interpretó correctamente) y confirmarlo.
3. Por texto (no por voz), escribir inmediatamente: «mejor el domingo».
4. Confirmar que esto se reconoce como una corrección del plan recién
   mostrado por voz, no como una nueva tarea separada.
5. Confirmar el plan corregido y verificar que el compromiso quedó con
   fecha domingo.

**FALLA si:** el paso 4 no reconoce la corrección (crea un segundo
compromiso en vez de corregir el primero, o pregunta de qué está
hablando).
**ANOTAR si:** el paso 1 requiere repetir el dictado por errores de
transcripción — eso es una certificación aparte (calidad de voz), no
un fallo de este escenario, pero vale la pena anotarlo si ocurre.

## Registro de resultados

Para cada escenario registrar: fecha, hash Git exacto probado,
resultado por paso (no solo el resultado final), y cualquier nota. No
registrar contenido literal con datos personales reales — los datos de
ejemplo de este documento (Valentina, reuniones de equipo, etc.) son
genéricos a propósito y pueden reutilizarse tal cual.

Si algún escenario requiere coordinación que solo el usuario puede dar
(por ejemplo, disponer de una segunda cuenta de prueba ya vinculada
como contacto, o decidir el momento de ejecutar la prueba física), eso
debe resolverse antes de ejecutar el Escenario B específicamente — los
escenarios A, C, D y E no requieren una segunda cuenta y pueden
ejecutarse de forma independiente.
