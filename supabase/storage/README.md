# Procedimiento de Storage privado

`chat-media-private.sql` prepara el bucket definido por ADR-024.

No se aplica automáticamente. El orden obligatorio es:

1. confirmar que el proyecto es `oonijgmddgyymhrlnvuu` (`Ping Staging V2`);
2. comprobar que mobile, cron y capacidades no-MVP siguen cerrados;
3. disponer `PING_STAGING_DB_PASSWORD` únicamente en el entorno del proceso;
4. ejecutar `scripts/backup-staging-readonly.ps1`;
5. verificar `manifest.json`, `manifest.sha256` y ambos listados de
   `pg_restore`;
6. revisar el SQL;
7. obtener aprobación para la intervención remota;
8. aplicar primero la migración de referencias;
9. aplicar `chat-media-private.sql` dentro de la transacción incluida;
10. ejecutar las consultas de verificación;
11. mantener `ENABLE_PRIVATE_FILE_UPLOADS=false`.

## Respaldo previo

El script recibe la URL de conexión sin contraseña. La contraseña sólo se lee
de `PING_STAGING_DB_PASSWORD`; no existe parámetro para proporcionarla.
Selecciona un conjunto completo de herramientas PostgreSQL cuya versión mayor
sea igual o superior a `-ExpectedPostgresMajor` (17 por defecto). Puede fijarse
una instalación concreta con `-PostgresBinPath`; el script registra las rutas
y versiones efectivamente utilizadas.

Ejemplo de validación local, sin conexión:

```powershell
.\scripts\backup-staging-readonly.ps1 `
  -DatabaseUrl (Get-Content .\supabase\.temp\pooler-url -Raw).Trim() `
  -OutputDirectory 'C:\ruta-cifrada\ping-backups' `
  -ConfirmEncryptedDestination `
  -ValidateOnly
```

La ejecución real omite `-ValidateOnly` y sólo puede realizarse después de que
el proceso herede `PING_STAGING_DB_PASSWORD`.

En Windows, la contraseña no debe escribirse en el comando, guardarse con
`setx`, copiarse a `.env` ni enviarse por chat. Para una ejecución manual se
puede mantener sólo en la memoria de una sesión de PowerShell:

```powershell
$securePassword = Read-Host 'Staging database password' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:PING_STAGING_DB_PASSWORD =
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

  # Ejecutar el respaldo desde esta misma sesión.
}
finally {
  $env:PING_STAGING_DB_PASSWORD = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
```

Si Codex debe ejecutar el respaldo, la aplicación debe iniciarse como proceso
hijo de esa sesión temporal para heredar la variable. La variable debe
eliminarse y la aplicación cerrarse al terminar.

El destino debe estar fuera del repositorio y sobre almacenamiento cifrado. El
script crea primero un directorio con sufijo `.incomplete`; sólo lo renombra a
su nombre final cuando:

- los dumps de aplicación y Storage pueden inspeccionarse con `pg_restore`;
- todos los archivos obligatorios existen y no están vacíos;
- se exportaron RLS, grants, funciones, triggers, publicaciones, buckets,
  objetos y migraciones;
- los roles no contienen contraseñas;
- los artefactos de texto no contienen la contraseña ni la URL de conexión;
- cada payload posee tamaño y SHA-256 en el manifiesto;
- `manifest.sha256` verifica el propio manifiesto.

El respaldo incluye datos y esquema de `public`, historial de
`supabase_migrations` y metadatos de `storage`. No incluye binarios de Storage:
si existe al menos un objeto, la ejecución falla y exige un respaldo binario
independiente. Tampoco incluye `auth` ni configuración administrada fuera de
PostgreSQL. Estas exclusiones se registran expresamente en el manifiesto.

La restauración nunca debe probarse directamente sobre staging. Cada respaldo
incluye `RESTORE-AND-VERIFY.md` para validarlo primero en un proyecto aislado.

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
