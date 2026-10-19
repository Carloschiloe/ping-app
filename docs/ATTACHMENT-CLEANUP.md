# Adjuntos expirados y objetos huérfanos

## Estado actual

Attachment Core ya expone la función `list_expired_message_attachments`, que
identifica adjuntos `pending` o `uploaded` sin mensaje y con `expires_at` en el
pasado. Esa función sólo lista candidatos; no elimina filas ni objetos de
Storage.

El comando operativo disponible es:

```powershell
cd backend
npm run build
npm run attachments:audit-expired -- 100
```

El comando es deliberadamente `audit-only`: informa los candidatos y no hace
borrado físico, tombstone, modificación de base de datos ni llamada de
eliminación en Storage.

## Jobs

`render.yaml` no declara un servicio `cron` y mantiene
`RUN_CRON_JOBS=false` junto con `ENABLE_AUTOMATIONS=false`. El coordinador de
jobs tampoco invoca la auditoría de adjuntos. Por lo tanto, esta revisión no
activa ningún proceso automático ni cambia el comportamiento productivo.

## Trabajo pendiente para una purga segura

Una purga real requeriría, como mínimo, un diseño idempotente y reversible para
coordinar la fila de `attachments` con el objeto privado de Storage, además de
una migración/RPC y pruebas contra staging. Hasta que exista ese diseño, los
candidatos deben revisarse mediante el comando de auditoría y no deben
eliminarse automáticamente.
