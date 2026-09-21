# Ping — campaña integral M-7/M-8/M-9

Fecha de preparación: 2026-09-21
Checkout certificado: `codex/conversational-core-review-20260920`  
Base reconciliada: `8d05698` + corrección local del flujo de sustitución de planes pendientes

Esta campaña sustituye la comprobación de frases aisladas. Cada caso se ejecuta como una conversación completa y se evalúan las invariantes del núcleo: interpretación, continuidad, referencias, memoria, autorización, confirmación y estado final.

## Entorno preparado

- Supabase local `ping-c2-local`: API `54321`, PostgreSQL `54322`.
- Backend del checkout actual: `http://192.168.1.15:3001/api`.
- Metro/Expo Go del checkout actual: `exp://192.168.1.15:8082`.
- El `mobile/.env` remoto no fue modificado; las URLs locales se inyectaron únicamente en el proceso de Expo.
- Los procesos antiguos de Claude permanecen intactos en los puertos 3000/8081 y no forman parte de esta certificación.

## Preparación en el iPhone

1. Conectar el iPhone y el computador a la misma red Wi‑Fi.
2. Abrir Expo Go y escanear el QR de Metro, o abrir `exp://192.168.1.15:8082`.
3. Iniciar sesión solo con la cuenta de prueba local disponible. No cambiar a staging ni a una cuenta real.
4. Ejecutar A, C, D y E en ese orden. Ejecutar B solo si ya existen dos cuentas de prueba vinculadas.
5. No borrar la aplicación ni limpiar los datos entre pasos salvo donde se indica cerrar y reabrir. No reiniciar la base local durante la campaña.
6. Registrar el resultado de cada paso y la respuesta observada. No copiar datos personales reales al registro.

Si Expo Go no carga, comprobar primero que el teléfono puede abrir `http://192.168.1.15:3001/health` en la misma red y que el firewall de Windows permite Node/Expo en red privada. No cambiar las URLs a `localhost`: desde el iPhone `localhost` significa el propio teléfono.

## Conversación A — semana, ambigüedad y corrección

Preparar dos compromisos propios con el mismo título `Entrenar`, uno martes a las 07:00 y otro jueves a las 07:00. Se pueden crear dentro de la conversación:

1. “Agenda entrenar el martes a las siete.”
2. Confirmar el plan.
3. “Y agrega entrenar también el jueves a las siete.”
4. Confirmar el segundo plan.
5. “Mueve entrenar al viernes.”
6. Ping debe pedir cuál, mostrando martes y jueves. No debe elegir silenciosamente.
7. Responder con una variante natural: “el del jueves” / “el que estaba para el jueves”.
8. Confirmar que el plan nuevo conserva el compromiso del jueves y propone viernes.
9. Sin confirmar ni cancelar el plan de viernes, escribir y enviar: “No, mejor déjalo para el sábado.”
10. El plan anterior debe quedar sustituido y debe aparecer un plan nuevo para sábado, con un digest diferente. El plan de viernes no puede seguir siendo confirmable.
11. Confirmar el plan corregido.
12. Preguntar, con otra formulación, “¿Qué tengo esta semana?” o “¿Cómo quedó mi semana?”.

Resultado esperado: exactamente dos `Entrenar`: martes intacto y sábado reprogramado. La respuesta semanal debe filtrar el período solicitado y no mezclar cancelados o resueltos.

Variaciones opcionales: “el segundo”, “el de más adelante”, “¿y el otro?”, “mejor el sábado entonces”. Si una variante es genuinamente ambigua, Ping debe pedir el dato faltante y no adivinar.

## Conversación B — compromiso compartido y cambio de tema

Requiere cuentas de prueba A y B.

1. Desde A: “Propónle a B almorzar el miércoles a la una.”
2. Confirmar el plan.
3. Preguntar: “¿Qué le propuse?”
4. Desde B, aceptar la propuesta.
5. Desde A: “¿B confirmó lo del almuerzo?”
6. Cambiar de tema: “¿Qué tengo hoy?”
7. Retomar: “¿Y ya quedó confirmado lo del miércoles?”

Resultado esperado: Ping conserva el compromiso aunque la pregunta use pronombres y haya una interrupción temática; el estado leído coincide con la aceptación real. La propuesta no se convierte en compromiso sin confirmación de A.

## Conversación C — memoria durable y tarea posterior

Usar solo datos de prueba no sensibles.

1. “Recuerda que mi hermana se llama Valentina y cumple el 14 de octubre.”
2. Revisar que el plan cite ambos hechos sin agregar información inventada.
3. Confirmar el plan y verificar que la ejecución se reporte como exitosa.
4. Cerrar completamente la app y volver a abrirla.
5. En una conversación nueva preguntar: “¿Cuándo cumple mi hermana?”
6. Preguntar luego: “¿Qué sabes de ella?”
7. Crear una tarea relacionada: “Recuérdame comprarle un regalo antes de su cumpleaños.”

Resultado esperado: el hecho guardado se recupera después de reabrir y con una reformulación; la nueva tarea usa el nombre correcto. Guardar memoria no autoriza por sí solo una acción de dominio: la tarea requiere su propio plan y confirmación.

## Conversación D — cancelación, interrupción y lectura histórica

Preparar dos compromisos propios llamados `Reunión con el equipo`, en días distintos.

1. “Cancela la reunión con el equipo.”
2. Ping debe pedir cuál y mostrar las dos fechas.
3. Interrumpir deliberadamente: “¿Qué tengo pendiente hoy?”
4. Volver al hilo con: “Cancela la reunión con el equipo, la del jueves.”
5. Revisar el plan y confirmar.
6. Verificar que solo la del jueves quedó cancelada y la otra sigue intacta.
7. Preguntar en un turno posterior: “¿Cancelamos la reunión con el equipo?”

Resultado esperado: la pregunta histórica del paso 7 es informativa; no genera otro plan ni una nueva confirmación. Si se prueba desde una cuenta asignada que no creó el compromiso, cancelar debe ser rechazado por autorización; completar o reprogramar deben conservar sus reglas propias.

## Conversación E — voz, texto y corrección

1. Por voz: “Agenda comprar el regalo de cumpleaños para el sábado.”
2. Revisar la transcripción y el plan antes de confirmar.
3. Mantener el plan pendiente; no confirmarlo ni cancelarlo todavía.
4. Escribir y enviar inmediatamente: “Mejor el domingo.” No cancelar primero: esta es la prueba de corrección conversacional.
5. Confirmar que el Core invalida el plan anterior y presenta una corrección, no una segunda compra independiente.
6. Confirmar el nuevo plan y verificar que el compromiso final queda el domingo.

Si el plan del sábado ya fue confirmado, no registrar la siguiente solicitud como sustitución de plan pendiente: corresponde a otro flujo de reprogramación y debe evaluarse separadamente.

Variar la entrada de voz con “para este sábado” y la corrección escrita con “al final, el domingo”. Registrar errores de transcripción por separado de errores del núcleo conversacional.

## Contrato vigente para corregir un plan pendiente

- Mientras el usuario escribe, el plan mostrado permanece visible y no se ejecuta ni se invalida por cada carácter.
- Al enviar una corrección explícita, la pantalla entrega el nuevo turno al Core. El Core decide si es una corrección válida, una solicitud independiente o una salida del contexto.
- Para una corrección válida de fecha, el Core registra la sustitución, invalida la referencia/digest anterior y devuelve un plan nuevo. Sólo ese plan nuevo puede confirmarse.
- Si el usuario quiere conservar el plan, toca `Confirmar`. Si quiere abandonarlo sin otra solicitud, toca `Cancelar`. Ninguna de las dos acciones es necesaria para enviar una corrección explícita.
- Si la corrección no tiene fecha reconocible o es ambigua, Ping debe pedir aclaración; no debe crear ni modificar un compromiso.
- La evidencia de aprobación debe incluir el plan anterior, el plan corregido y el resultado persistido final, sin contar como éxito la mera prosa de la respuesta.

## Criterios de fallo transversal

Marcar FALLA si ocurre cualquiera de estos casos:

- se ejecuta una acción sin confirmación explícita;
- una referencia con varios candidatos se resuelve por adivinación;
- una corrección crea un segundo compromiso o conserva la fecha anterior;
- una lectura semanal mezcla períodos o estados no solicitados;
- una pregunta histórica se transforma en una orden;
- la memoria se confirma como guardada pero no se recupera después de reabrir;
- la cuenta sin autorización puede cancelar el compromiso;
- el resultado informado no coincide con el estado persistido.

Marcar ANOTAR si el resultado es correcto pero la respuesta es excesivamente larga, tarda de forma inusual, exige una reformulación innecesaria o muestra una latencia de sincronización que desaparece al actualizar.

## Registro compacto

| Caso | Paso | Resultado | Respuesta/estado observado | Evidencia |
|---|---:|---|---|---|
| A/B/C/D/E |  | PASA / FALLA / ANOTAR | resumen sin datos reales | captura o hora |

Al terminar los cinco casos, enviar el registro completo en un solo informe. El análisis debe agrupar fallos por causa (clasificación, continuidad, resolución de entidad, autorización, persistencia, sincronización o síntesis), no por frase individual.
