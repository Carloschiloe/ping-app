# Procedimiento de Storage privado

`chat-media-private.sql` prepara el bucket definido por ADR-024.

No se aplica automáticamente. El orden obligatorio es:

1. confirmar que el proyecto es `oonijgmddgyymhrlnvuu` (`Ping Staging V2`);
2. comprobar que mobile, cron y capacidades no-MVP siguen cerrados;
3. ejecutar `scripts/backup-staging-readonly.ps1`;
4. verificar el manifiesto y `pg_restore --list`;
5. revisar el SQL;
6. obtener aprobación para la intervención remota;
7. aplicar primero la migración de referencias;
8. aplicar `chat-media-private.sql` dentro de la transacción incluida;
9. ejecutar las consultas de verificación;
10. mantener `ENABLE_PRIVATE_FILE_UPLOADS=false`.

Resultado esperado:

- `chat-media.public = false`;
- límite específico de 20 MiB;
- MIME types explícitos;
- acceso directo de `anon` y `authenticated` cerrado;
- backend como único emisor autorizado de firmas;
- cero URLs firmadas persistidas.

Reversión funcional:

- cerrar gates;
- dejar de emitir firmas;
- conservar bucket, objetos y columnas;
- no cambiar `public` a `true`.
