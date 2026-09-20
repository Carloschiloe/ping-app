# M-7/M-8 — Escenarios de certificación física en iPhone

Estado: código completo, probado con 45 pruebas automatizadas nuevas
(backend 113/113 archivos, 2060/2060 pruebas; mobile 824/824), sin
certificación física. Este documento es la guía mínima para ejecutar esa
certificación cuando corresponda — no reemplaza el resto de la suite
existente (M-1 a M-6), la complementa para las cuatro capacidades nuevas de
la rama `test/m7-read-followup-regression-20260920` (PR #3).

No fusionar la rama a `codex/staging-beta` para esta prueba sin
autorización explícita — la rama está deliberadamente apilada sobre la PR
#1 para evitar el despliegue automático de staging. Si se necesita probar
en un build real, coordinar primero cómo desplegar esa rama de forma
aislada.

## Antes de empezar

- Confirmar hash Git exacto de la rama probada y anotarlo junto al
  resultado.
- Usar una cuenta de prueba, nunca una cuenta real de producción.
- Cada escenario indica qué falla contaría como bloqueo (`FALLA`) y qué
  detalle menor no bloquea pero debe anotarse (`ANOTAR`).

## Escenario 1 — Seguimiento de una pregunta de lectura

Objetivo: confirmar que una pregunta de seguimiento corta recupera el
compromiso correcto sin que el usuario repita el nombre.

1. Preguntar: «¿Qué pasó con [nombre de un compromiso ya resuelto o
   cancelado real]?» — confirmar que la respuesta cita ese compromiso.
2. Sin mencionar el nombre de nuevo, preguntar inmediatamente después:
   «¿Y cuándo lo completamos?» (o «¿cuándo lo cancelamos?», según el
   estado real del compromiso usado).
3. Confirmar que la respuesta se refiere al mismo compromiso del paso 1,
   con fecha y hora correctas.
4. Repetir el paso 2 con una frase distinta que use otro verbo de la
   familia (por ejemplo «¿y cuándo lo resolvimos?» si el compromiso está
   resuelto).

**FALLA si:** la segunda pregunta produce una respuesta genérica de "no
encontré evidencia", o cita un compromiso distinto al del primer turno.
**ANOTAR si:** la respuesta es correcta pero tarda notablemente más que
una pregunta de un solo turno.

## Escenario 2 — Desambiguación de un compromiso por nombre repetido

Requiere tener (o crear primero) dos compromisos con el mismo título,
fechas distintas.

1. Decir: «Completa [título repetido]».
2. Confirmar que Ping pregunta cuál de los dos, mostrando ambas fechas.
3. Responder distinguiendo por fecha, por ejemplo «el del [día de la
   semana correcto]».
4. Confirmar que el plan mostrado a continuación apunta al compromiso
   correcto (verificar por la fecha mostrada en el plan, no solo el
   título, ya que ambos comparten título).
5. Confirmar el plan y verificar que el compromiso correcto —y solo
   ese— cambió de estado.

**FALLA si:** Ping completa el compromiso equivocado, o el plan no
distingue cuál de los dos eligió.
**ANOTAR si:** la pregunta de desambiguación es correcta pero el texto se
siente poco natural.

## Escenario 3 — Corrección de un plan ya mostrado

1. Decir algo que produzca un plan de reprogramación con fecha
   verificable, por ejemplo: «Mueve [nombre de un compromiso real] al
   viernes».
2. Confirmar que el plan mostrado dice viernes.
3. Sin confirmar el plan, decir: «mejor al sábado».
4. Confirmar que aparece un plan **nuevo** que dice sábado, no el de
   viernes.
5. Confirmar este segundo plan y verificar que el compromiso quedó con la
   fecha de sábado, nunca la de viernes.

**FALLA si:** el plan corregido sigue mostrando la fecha vieja, o el
compromiso termina con la fecha de viernes tras confirmar el plan
corregido.
**ANOTAR si:** el paso 3 requiere una frase más explícita que "mejor al
sábado" para ser reconocido como corrección.

## Escenario 4 — Recordar un hecho pedido explícitamente

Este es el escenario prioritario de esta lista: es el único de los cuatro
cuya corrección depende de un segundo subsistema (recuperación de memoria
en lectura), no solo de que la escritura tenga éxito.

1. Decir: «Recuerda que mi hermano se llama Andrés» (o un hecho real y no
   sensible equivalente).
2. Confirmar que el plan mostrado dice literalmente ese contenido, sin
   parafrasear ni agregar nada.
3. Confirmar el plan.
4. Verificar que la ejecución se reporta como exitosa.
5. **En un turno completamente nuevo** (idealmente tras cerrar y reabrir
   la app, o al menos varios turnos después), preguntar: «¿cómo se llama
   mi hermano?» o «¿qué me pediste que recordara?».
6. Confirmar que Ping cita el hecho guardado en el paso 1.

**FALLA si:** el paso 6 no encuentra el hecho, o Ping responde con algo
distinto a lo guardado. Este es el fallo más importante de detectar: el
paso 4 puede reportar éxito mientras el hecho queda en un estado que nunca
se recupera — el propósito completo de este escenario es descartar
exactamente eso.
**ANOTAR si:** el hecho se recupera correctamente pero solo con una
frase de búsqueda muy parecida a la original, nunca con una reformulación
natural.

## Registro de resultados

Para cada escenario, registrar: fecha, hash Git, resultado (PASA/FALLA),
y cualquier nota. No registrar el contenido literal de mensajes con datos
personales reales — usar datos de prueba genéricos en los pasos que lo
permitan (todos excepto el Escenario 4, que por su naturaleza requiere un
hecho real pero no sensible).
