# Commitment Core — validación operativa

## Contratos canónicos

- La fuente de verdad del esquema es `supabase/migrations/`, aplicada por timestamp.
- La frontera HTTP/aplicación es `backend/src/services/commitmentApplication.service.ts`.
- `POST /commitments`, `PATCH /commitments/:id`, `DELETE /commitments/:id`,
  propuestas y rutas de lifecycle son contratos/adapters hacia esa frontera.
- Ningún cliente autenticado debe escribir directamente en `public.commitments`.
  Las mutaciones confirmadas usan RPCs restringidas a `service_role` y escriben
  fila, evento y auditoría en una misma transacción.

Calls, Calendar y Operation conservan writers satélite temporalmente. Están en
la allowlist del test `commitmentWriterGuard.test.ts` con la marca:
`LEGACY SATELLITE WRITER — migrate in future slice`.

## Validación local

Requisitos: Docker Desktop, Supabase CLI, Node y dependencias instaladas.

1. Ejecutar `supabase start` desde la raíz.
2. Confirmar que `supabase status` muestra únicamente URLs `127.0.0.1`.
3. Cargar en la terminal de prueba los valores locales reportados por
   `supabase status -o env`: `API_URL` como `SUPABASE_URL`, `ANON_KEY` como
   `SUPABASE_ANON_KEY` y `SERVICE_ROLE_KEY` como `SUPABASE_SERVICE_ROLE_KEY`.
   No copiarlos a archivos versionados ni imprimirlos en logs compartidos.
4. Ejecutar en `backend/`:
   - `npm run build`
   - `npm test`
   - `npm run test:commitment-core:local-e2e`
5. Para la prueba SQL/concurrencia contra PostgreSQL local, definir únicamente:
   - `PING_C2_DATABASE_URL` con host `127.0.0.1` o `localhost`;
   - `PING_C2_PSQL_BIN` si `psql` no está en `PATH`;
   - ejecutar `npm run test:commitment-core:postgres`.

El runner PostgreSQL rechaza cualquier hostname no loopback. El E2E backend
también rechaza URLs Supabase que no sean HTTP local; además arranca un backend
temporal contra esos valores, sin reutilizar un proceso remoto.

Para reconstruir desde cero se puede usar `supabase db reset`, pero sólo después
de comprobar con `supabase status` que el objetivo es local. Nunca usar
`--linked` para esta validación.

## Verificación de staging

El identificador aprobado de staging es `oonijgmddgyymhrlnvuu`
(`Ping Staging V2`). Antes de cualquier operación remota deben coincidir:

1. `supabase/.temp/project-ref`;
2. el proyecto marcado `linked` por `supabase projects list`;
3. el subdominio de `SUPABASE_URL`, comprobado sin imprimir claves;
4. `PING_EXPECTED_SUPABASE_PROJECT_REF` cuando el backend staging se ejecuta.

El nombre “staging” no basta. Si alguno de esos identificadores difiere, si el
proyecto aparece inactivo o si el dry-run no puede leer su tabla de migraciones,
no se ejecuta `db push` ni ningún E2E remoto.

Secuencia remota permitida, una vez recuperado y verificado staging:

1. backup de staging;
2. `supabase migration list --linked`;
3. `supabase db push --linked --dry-run`;
4. revisar que sólo estén pendientes las migraciones aprobadas;
5. `supabase db push --linked`;
6. ejecutar el E2E de Commitment Core con fixtures temporales y limpieza;
7. volver a comprobar migraciones y ausencia de fixtures.

Producción requiere una autorización separada y nunca se infiere de esta
secuencia.

## Certificación C-2R de staging (2026-08-29)

- Proyecto certificado: `Ping Staging V2`, ref `oonijgmddgyymhrlnvuu`.
- El proyecto fue restaurado desde `INACTIVE` mediante la Management API
  oficial y alcanzó `ACTIVE_HEALTHY` sin cambiar organización, región o versión.
- Preflight: nueve migraciones aplicadas; sólo C-1 y C-2 pendientes; sin drift
  material ni eventos incompatibles con el constraint de C-1.
- Recuperación: WAL habilitado; PITR deshabilitado y sin backups físicos
  listables. C-1/C-2 se verificaron como DDL transaccional sin DML de datos.
- Se aplicaron, en orden, `20260828160000_commitment_core_canonical_writes.sql`
  y `20260829010000_harden_commitment_direct_writes.sql`.
- El E2E remoto se ejecuta con
  `npm run test:commitment-core:staging-e2e`; valida el ref antes de conectar,
  limita cada request a 60 segundos y elimina exclusivamente sus fixtures.
- Resultado certificado: 38 checks, flujo self-chat completo, autorización A/B/C,
  hardening, trazabilidad, archivo lógico y concurrencia `resolve` vs `cancel`,
  con limpieza verificada.
- Producción no fue conectada ni modificada; no hubo deploy.
