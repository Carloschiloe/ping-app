# Ping — consolidación nocturna M-7/M-8/M-9

Fecha: 2026-09-21
Rama: `codex/conversational-core-review-20260920`
Alcance: validación local; sin cambios remotos, sin deploy y sin uso de producción/staging.

## Causas estructurales confirmadas

1. `a las siete` no era reconocido por la rama canónica de días de semana en `date-parser.service.ts`. Al no encontrar hora explícita, esa rama usaba 12:00 como valor por defecto. La zona horaria no era la causa: para Santiago, 07:00 local se convierte correctamente a 10:00Z en la fecha probada.
2. Un plan es una propuesta efímera. Sólo la autorización explícita y la ejecución verificada crean o modifican el compromiso. Por eso intentar mover `entrenar` antes de confirmar no podía encontrar un compromiso persistido; no se debe convertir una propuesta no confirmada en una acción implícita.
3. La pantalla móvil invalidaba el plan en el primer carácter escrito porque despachaba `SOURCE_EDITED` desde `onChangeText`. Además, permitía enviar otra solicitud mientras el plan seguía pendiente. Eso producía la tarjeta “ya no está disponible” y rompía la continuidad entre propuesta y confirmación.
4. La configuración local no define `PING_M7_DATABASE_URL`; esa ruta requiere el Session Pooler privado con TLS verificado para staging. Las pruebas se bloquearon inicialmente por aislamiento de red y después por mezclar una URL Postgres local con claves Supabase de staging. Se corrigió el procedimiento de validación, no la infraestructura: todas las suites reales se ejecutaron con URL, Auth, REST y Postgres locales coherentes.

## Cambios consolidados

- El parser canónico reconoce horas escritas en español, minutos `y media`, `y cuarto`, `menos cuarto` y meridiem (`de la tarde`, `de la noche`, `a. m.`, `p. m.`).
- La app móvil mantiene activo el plan mientras se redacta una corrección, bloquea el siguiente envío de texto/voz hasta confirmar o cancelar y muestra una indicación clara. El reducer conserva la invalidación explícita para eventos de cambio de fuente que no provengan de la edición normal del composer.
- La regresión del orquestador comprueba que `Agenda entrenar el martes a las siete` produce un step `create_commitment` con `dueAt=2026-09-22T10:00:00.000Z` para `America/Santiago`.
- El E2E existente quedó determinista para ejecución local sin OpenAI en los fixtures de comunicación; no cambia el comportamiento productivo ni expone credenciales.

## Evidencia ejecutada

- Backend: build TypeScript correcto.
- Backend offline: 122 suites, 2.118 tests aprobados y 18 `todo`.
- Integración M-7/M-8/M-9 contra Supabase local: 4 suites, 15/15 aprobados.
- E2E real local: 44 comprobaciones aprobadas: plan → autorización → ejecución → verificación → persistencia, incluida la recuperación de `mañana a las siete` como `07:00` en Santiago, replay idempotente, protección de digest/step, actor externo, revocación, TOCTOU, reschedule y espera condicional. Los fixtures se limpiaron; el residuo de mensajes tombstone es el comportamiento de limpieza ya documentado por Messaging Core.
- Mobile: 49 suites, 826 tests aprobados.
- Mobile TypeScript: `tsc --noEmit` correcto.
- Backend local: `http://127.0.0.1:3001/health` respondió `{"status":"ok"}`; Metro consolidado continúa en 8082. Los procesos antiguos en 3000/8081 no se tocaron.

## Estado para certificación física

La campaña física queda deliberadamente pendiente hasta la siguiente sesión con iPhone. El build local está listo para repetir la campaña completa del documento M-7/M-8/M-9, no una secuencia de micropruebas. En la conversación A se debe confirmar cada plan antes de intentar moverlo; una edición escrita mantiene visible el plan y el botón exige confirmación o cancelación previa.

La certificación física debe registrar el resultado de A–E en conjunto y comprobar al final el estado persistido desde una segunda lectura/sesión. No usar la rama antigua 8081 ni cuentas de staging.

## Siguiente etapa de producto

Con el contrato de propuesta/autorización/persistencia estable, el siguiente ciclo debe reforzar el estado conversacional durable y la sincronización del mismo Core entre mobile, desktop/tablet y voz. La prioridad es exponer un contrato de estado independiente de la interfaz (turno, plan pendiente, autorización, ejecución y resultado verificado), manteniendo el modelo como proponente y el Core como autoridad.
