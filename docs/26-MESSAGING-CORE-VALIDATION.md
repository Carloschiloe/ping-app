# C-3 — Messaging Core canónico

## Flujo reconstruido

Flujo mobile/backend vigente antes de C-3:

1. Mobile obtiene o crea conversación mediante `/conversations`,
   `/conversations/self`, invitación o grupos.
2. `useSendConversationMessage` agrega una fila optimista con
   `client_message_id` y llama `POST /conversations/:id/messages`.
3. `processUserMessage` valida participante, reply, mention y adjunto; después
   insertaba directamente en `messages`.
4. La respuesta HTTP y Realtime reconciliaban por `client_message_id`; un
   polling cada 4/5 segundos cubría eventos perdidos y reentrada.
5. Mobile escribía delivery mediante `PATCH /messages/:id/status` y lectura
   mediante `PATCH /conversations/:id/read`; ambos mutaban el único
   `messages.status`.
6. Reactions escriben directamente en `message_reactions` bajo RLS; replies
   usan `reply_to_id`; forward crea un mensaje nuevo con identidad nueva y
   metadata `forwarded`.
7. `DELETE /messages/:id` y `DELETE /groups/:id` ejecutaban deletes físicos.

Writers de mensajes encontrados:

- `messagingApplication.service.ts`: envío humano y sistema canónicos;
- `message.service.ts`: adapter con análisis/sugerencia y metadata derivada;
- `commitment.service.ts`: ahora delega la notificación de Commitment;
- `morningRoutine.service.ts`: writer legacy de Ping AI fuera de C-3;
- `call-processing.service.ts`: writer legacy de Calls fuera de C-3.

Los writers legacy fuera de alcance pasan igualmente por los triggers de base
que crean el snapshot de receipts y rechazan conversaciones eliminadas.

Readers principales:

- `GET /conversations` y `GET /conversations/:id/messages`;
- suscripciones Realtime de `messages`, `message_receipts` y reactions;
- cache React Query y cola offline mobile;
- Search, media, replies, Commitment/Proposal y archivos como referencias.

## Contrato canónico

- La fila `messages` confirma persistencia (`sent`).
- `message_receipts(message_id, user_id, delivered_at, read_at)` guarda un
  snapshot de cada receptor real al insertar el mensaje.
- Un mensaje humano excluye al emisor del snapshot; un mensaje de sistema sin
  emisor incluye a los participantes actuales.
- Self-chat no crea receipts: delivery/read no aplica y `status` legacy queda
  `sent`.
- `mark_message_receipt` sólo avanza el receipt del actor autenticado o del
  actor explícito validado por backend service role.
- `mark_conversation_read` avanza sólo receipts del actor y `last_read_at`.
- `messages.status` es una proyección legacy: `read`/`delivered` sólo cuando
  todos los receptores alcanzaron el estado; no acepta updates directos.
- El backfill histórico sólo traslada `delivered/read` cuando existe un único
  receptor. En grupos conserva `sent` para no inventar lectores.

## Realtime, polling y offline

- Realtime mantiene la actualización inmediata de mensajes y receipts.
- Refetch en mount/reconnect/subscription recupera eventos perdidos.
- El polling de seguridad baja de 4/5 segundos a 30 segundos y no corre en
  background.
- HTTP y Realtime convergen por `client_message_id`, independientemente del
  orden de llegada.
- Un timeout queda como `result_unknown`; el retry reutiliza la misma identidad
  y la constraint única devuelve una sola fila confirmada.

## Delete y procedencia

- `DELETE /messages/:id` es adapter de `tombstone_message`.
- Tombstone escribe `deleted_at`, actor, razón y `message_events.tombstoned` en
  una transacción.
- El contenido original y los FK de Proposal/Commitment permanecen en base;
  los adapters HTTP/mobile presentan `Mensaje eliminado` sin metadata/media.
- Un trigger bloquea `DELETE` físico de mensajes.
- Grupos usan tombstone de conversación; no se borran mensajes ni
  participantes por cascada.
- Reactions nuevas y replies hacia un tombstone quedan rechazadas.

## Conversaciones

`create_conversation_with_participants` crea conversación y participantes en
una transacción. Para direct/self usa advisory lock y reutilización exacta para
que dos creaciones concurrentes converjan en la misma conversación.

## Validación local

- Reset Supabase local desde cero: todas las migraciones aplicadas.
- PostgreSQL real: 1:1, grupo B/C/D, external, self-chat, idempotencia,
  concurrencia, RLS/grants, tombstone y procedencia: aprobado.
- Backend TypeScript: aprobado.
- Backend tests: 34 archivos, 250/250.
- Mobile TypeScript: aprobado.
- Mobile tests: 22 archivos, 107/107.
- Backend `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprobado.

## Staging

Identidad verificada: `Ping Staging V2`, ref
`oonijgmddgyymhrlnvuu`, organización `ittyqubvpwfnsfjqmkkx`,
`ACTIVE_HEALTHY`. El dry-run previo mostró exclusivamente
`20260830010000_messaging_core_canonical.sql`, sin seeds ni roles. Con
autorización explícita del usuario, esa única migración fue aplicada el
2026-08-30. El dry-run posterior y el control final del 2026-08-31 quedaron
`upToDate=true`, sin migraciones pendientes.

`npm run test:messaging-core:staging-e2e` levantó el backend compilado local
contra staging y aprobó 35 checks: A/B/C, mensajes y receipts 1:1/grupo,
self-chat, retry y concurrencia por `client_message_id`, creación concurrente
de conversación, Realtime/reconciliación HTTP, tombstone, procedencia
Proposal/Commitment y autorización/RLS. La certificación final terminó
`status=passed`.

Cada intento usa usuarios y datos con marcador único. La limpieza
administrativa se ejecuta incluso ante fallo, queda acotada a los UUID del
run y reactiva los triggers antes de confirmar la transacción. El control
final verificó cero usuarios Auth, perfiles, conversaciones con marcador,
mensajes y Commitments temporales; también confirmó todos los triggers de
dominio habilitados y `message_receipts` publicado en Realtime.

Producción no fue consultada por base de datos, modificada ni desplegada. No
se hizo deploy de frontend/backend y no se implementó C-4.
