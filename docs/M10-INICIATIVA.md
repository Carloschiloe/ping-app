# M10 — Ping toma la iniciativa

Estado: propuesta, pendiente de visto bueno. Este documento no cambia nada en tiempo de ejecución.

## La idea

Hoy Ping solo habla cuando le hablas. Con M10, Ping también te escribe cuando hay algo que vale la pena:
- un resumen al empezar el día;
- un aviso cuando algo se atrasó, con una propuesta para moverlo;
- un aviso cuando alguien responde a algo que le propusiste.

Ping no escribe un aviso suelto. Escribe un **turno del asistente en tu chat con Ping**, y una notificación te lleva a ese chat. Así puedes contestar ahí mismo ("muévelo al viernes", "¿y qué más tengo?") y el asistente sabe de qué le hablas.

## Lo que ya existe (y qué pasa con eso)

| Pieza | Hoy | En M10 |
|---|---|---|
| Notificaciones push (Expo) y token del teléfono | Funcionan, tu perfil tiene token | Se reutilizan |
| Recordatorio 30 min / 5 min / ahora antes de un compromiso | Funciona | Se mantiene igual |
| Resumen de las 08:00 (`morningRoutine`) | Usa un generador de texto aparte (`ai.service`). Nunca llegó: escribía directo en `messages` y chocaba con las columnas antiguas | Se borra y lo reemplaza el motor de iniciativa |
| Revisión semanal de los viernes | Igual que el resumen, y a la hora del servidor, no a la tuya | Se borra. Si se quiere, vuelve después como otro tipo de aviso |

## Cómo funciona

1. **Un solo motor** revisa cada 5 minutos, por usuario y en su zona horaria, si hay algo que contar:
   - **resumen del día**: a la hora que elijas (08:00 por defecto), solo si tienes algo para hoy o algo atrasado;
   - **atrasado**: un compromiso tuyo que venció y sigue abierto, una sola vez por compromiso;
   - **respuesta de otro**: alguien aceptó, rechazó o contrapropuso algo tuyo.
2. Para cada evento, el **mismo asistente** (mismo modelo, mismas herramientas de lectura, mismo tono) escribe el mensaje. Recibe el evento como dato, no como palabras tuyas.
3. Si el asistente propone algo (por ejemplo, mover lo atrasado), queda como **acción pendiente** con los botones Confirmar/Cancelar, igual que hoy. Como no son palabras tuyas, nunca se ejecuta nada sin que tú confirmes.
4. El turno se guarda en tu chat con Ping y sale la notificación. Al tocarla, se abre ese chat.

## Reglas para que no moleste

- Máximo 3 avisos por día (sin contar los recordatorios de hora exacta).
- Horario de silencio de 22:00 a 08:00: lo que ocurra en ese rango se junta en el resumen de la mañana.
- Nunca dos veces el mismo aviso: cada evento tiene una clave única guardada en la base de datos.
- En Perfil, un interruptor por tipo de aviso y la hora del resumen.

## Cambios en la base de datos (los aplicas tú en el SQL Editor)

- Tabla `agent_initiatives`: un registro por evento enviado (usuario, tipo, clave única, fecha), para no repetir y contar el límite diario.
- En `profiles`: preferencias de aviso (activado por tipo, hora del resumen).

Ambos cambios solo agregan cosas; no tocan datos existentes.

## Fases

| Fase | Entrega | Cómo lo comprobamos |
|---|---|---|
| I1 | Motor de iniciativa + resumen del día escrito por el asistente en tu chat con Ping + notificación. Se borran `morningRoutine` y la revisión semanal | Pruebas automáticas y te llega el resumen en el teléfono |
| I2 | Aviso de atrasado con propuesta para moverlo (botones Confirmar/Cancelar) | Creamos un compromiso "prueba" ya vencido y te llega el aviso |
| I3 | Aviso cuando alguien responde a tu propuesta | Prueba con una propuesta tuya |
| I4 | Preferencias en Perfil (interruptores y hora) y abrir el chat al tocar la notificación | Lo pruebas en Expo Go |

Cada fase se publica solo con tu autorización.

## Riesgos

- **Expo Go en Android** no recibe notificaciones remotas desde SDK 53. En iPhone sí. Si usas Android, el mensaje igual queda en tu chat con Ping, pero la notificación llegará solo cuando la app esté instalada de verdad.
- **Costo**: una llamada al modelo por aviso, máximo 3 por usuario al día.
- **Que moleste**: por eso el límite diario, el horario de silencio y los interruptores.
