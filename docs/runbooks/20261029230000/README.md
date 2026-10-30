# Aplicar `20261029230000` en producción

Revoca las escrituras directas del cliente (PostgREST con la sesión del usuario) en `messages` y en las columnas de identidad de `profiles`. El backend usa `service_role` y no se ve afectado.

## Qué sigue funcionando en la app

- **Escrituras directas que se mantienen.** Verificadas en `mobile/src`; son las únicas que hace la app:
  - `privacy_read_receipts` y `privacy_last_seen` (`ProfileScreen`).
  - `last_seen`, `timezone`, `country_code` y `language_code` (`AuthContext`).
- **Nombre, teléfono y avatar.** Ya pasan por `PATCH /user/profile` en el backend.
- **Mensajes.** Se crean, editan y borran siempre por el backend. La app no escribe en `messages`.

## Pasos

Todos se ejecutan desde la carpeta de la rama (`Ping-audit`).

1. **Comprobar a qué proyecto apunta la CLI.** Debe estar enlazada a producción (`wbigqhtuzfmpnxservlf`), el único proyecto de Ping. Si el archivo muestra otro ref, no sigas y vuelve a enlazar:
   ```
   type supabase\.temp\project-ref
   supabase link --project-ref wbigqhtuzfmpnxservlf
   ```
2. **Hacer un backup** desde el panel de Supabase (Database → Backups), o confirmar que hay uno reciente.
3. **Guardar el estado actual.** Ejecuta `01-precheck.sql` en el SQL Editor de producción y guarda el resultado. El rollback restaura exactamente ese estado.
4. **Ver qué está pendiente:**
   ```
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```
   El dry-run **sólo** debe listar `20261029230000_restrict_client_message_profile_writes.sql`. Si lista otra migración, no sigas.
5. **Aplicar:**
   ```
   supabase db push --linked
   ```
6. **Verificar:** ejecuta `03-postcheck.sql`. Todas las filas deben decir `true`.
7. **Probar en la app:**
   - Abre el perfil y cambia los dos switches de privacidad.
   - Cierra la app y vuelve a abrirla (esto sincroniza idioma y presencia).
   - Envía un mensaje.

## Si algo falla

Ejecuta `04-rollback.sql`. Antes, revisa el resultado del paso 3: si algún permiso salía `false`, quítalo del `grant` correspondiente.

La migración es idempotente, así que volver a aplicarla después de un rollback es seguro.

## Probado localmente (Postgres 16, cadena de 48 migraciones)

Se probó esta secuencia: aplicar → postcheck (12/12 ok) → rollback (estado original restaurado, política incluida) → reaplicar → postcheck (12/12 ok).
