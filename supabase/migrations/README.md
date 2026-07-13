# Migraciones de Supabase — Ping

## Qué es esto

Este directorio contiene el **baseline V2** del esquema de base de datos de
Ping (`20260712000000_baseline_v2.sql`) y, a partir de ahora, todas las
migraciones futuras del proyecto.

Nace de una auditoría que confirmó que el esquema anterior (`supabase/schema.sql`
+ `supabase/schema.full.sql` + `backend/phase*.sql`) **no representa
completamente** la base de datos real: tablas centrales (`conversations`,
`conversation_participants`) y varias columnas (`profiles.full_name`,
`profiles.avatar_url`, `profiles.phone`, `messages.sender_id`) fueron creadas
manualmente en Supabase Studio en algún momento, sin dejar ninguna migración
versionada. El resultado es una base que **no se puede reconstruir** solo con
el repositorio.

El baseline V2 corta ese problema de raíz: es la primera migración que, aplicada
sola sobre un proyecto Supabase completamente vacío, deja un esquema
100% equivalente al núcleo real de Ping (compromisos + chat), sin depender de
ningún cambio manual posterior.

## A qué proyecto se aplica

**Solo a un proyecto Supabase nuevo ("Ping Staging V2"), todavía no creado.**

**NO aplicar sobre el proyecto Supabase antiguo.** El proyecto antiguo tiene
datos reales, tablas con historia (`conversations`/`conversation_participants`
sin DDL propio) y una estructura que este baseline no intenta replicar 1:1 —
lo reconstruye desde cero con un diseño simplificado. Aplicarlo sobre el
proyecto antiguo generaría conflictos de nombres y, en el peor caso, podría
chocar contra objetos ya existentes con una forma distinta.

## Cómo crear "Ping Staging V2"

1. En el dashboard de Supabase, crear un proyecto nuevo (nombre sugerido:
   `ping-staging-v2`). Anotar el project ref y guardar la contraseña de la
   base de datos en un gestor de secretos local (nunca en el repositorio ni
   en texto plano).
2. Instalar Supabase CLI de forma oficial (binario firmado desde
   `github.com/supabase/cli/releases`, o el método oficial para tu SO).
3. Autenticarse: `supabase login` (interactivo) o exportar
   `SUPABASE_ACCESS_TOKEN` como variable de entorno local si se trabaja sin
   TTY.
4. Vincular el proyecto nuevo: `supabase link --project-ref <PROJECT_REF>`,
   ejecutado desde la raíz del repositorio.

## Cómo aplicar el baseline

Con el proyecto ya vinculado:

```bash
supabase db push
```

Esto aplica, en orden, todos los archivos `.sql` de `supabase/migrations/`
que el proyecto remoto todavía no tenga registrados — hoy, solo
`20260712000000_baseline_v2.sql`.

Alternativa manual (si se prefiere revisar el SQL antes de ejecutarlo): copiar
el contenido del archivo y pegarlo en el SQL Editor del proyecto **nuevo**,
verificando dos veces que el proyecto activo es `ping-staging-v2` y no el
proyecto antiguo.

**Nunca** ejecutar `supabase db reset` sobre un proyecto que ya tenga datos —
ese comando destruye el esquema y lo reconstruye desde cero.

## Cómo crear migraciones futuras

Convención de nombres (14 dígitos de timestamp UTC, formato `YYYYMMDDHHMMSS`):

```
supabase/migrations/YYYYMMDDHHMMSS_descripcion_en_snake_case.sql
```

Ejemplo: `supabase/migrations/20260715093000_add_operation_module.sql`.

Reglas:

- Una migración = un cambio coherente (no mezclar features no relacionadas).
- Usar `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` solo cuando
  realmente se espera volver a ejecutar la migración seguridad (idempotencia
  real), no para ocultar errores de una migración mal escrita.
- Toda tabla nueva debe: habilitar RLS, definir sus políticas en el mismo
  archivo, y (si corresponde) agregarse a la publicación `supabase_realtime`.
- Generar la migración con `supabase migration new <descripcion>` para
  garantizar el timestamp correcto, o crear el archivo a mano respetando el
  formato exacto.
- Antes de mezclar una migración a `main`, aplicarla contra un proyecto de
  staging y confirmar que no rompe nada.

## Prohibición de cambios manuales sin migración

**Ningún cambio de esquema se hace directamente en Supabase Studio.** Todo
`CREATE TABLE`, `ALTER TABLE`, cambio de política RLS, función o trigger nace
como un archivo en `supabase/migrations/` y se aplica vía `supabase db push`.
Esta es exactamente la disciplina que faltó en el proyecto anterior y que
llevó a la situación que motivó este baseline.

Si en algún momento se detecta una diferencia entre el esquema real y lo
versionado (por ejemplo, alguien tocó Supabase Studio de emergencia), la
acción correcta es: (1) documentar el cambio real manualmente detectado, (2)
escribir una migración que lo formalice, (3) aplicarla, nunca al revés.

## Cómo verificar que el baseline reconstruye correctamente

Antes de considerar el baseline como definitivo:

1. Crear un proyecto Supabase de prueba completamente vacío (o una instancia
   local vía `supabase start`, si Docker está disponible).
2. Aplicar únicamente `20260712000000_baseline_v2.sql`.
3. Confirmar que no hay errores de ejecución.
4. Comparar la lista de tablas/columnas/políticas resultante contra el
   inventario documentado en el informe de la auditoría (tablas núcleo:
   `profiles`, `conversations`, `conversation_participants`, `messages`,
   `commitments`, `commitment_events`, `contacts`, `message_reactions`,
   `ai_messages`, `calls`, `user_calendar_accounts`).
5. Repetir este proceso cada vez que se agregue una migración nueva, para
   detectar cualquier drift lo antes posible.

## Política mínima de backups

- **Dump de esquema**: antes de cada cambio importante y al menos una vez por
  semana, `supabase db dump --schema-only` (o `pg_dump --schema-only`) desde
  un entorno con acceso de solo lectura, guardado fuera de Supabase (repo
  privado de infraestructura, o almacenamiento cifrado separado).
- **Backup de datos**: dump completo (`pg_dump` sin `--schema-only`) con la
  frecuencia que el volumen de datos justifique (diario para producción una
  vez que exista), cifrado en reposo, con retención definida (ej. 30 días
  rotando).
- **Inventario/respaldo de Storage**: listar y respaldar periódicamente los
  buckets de Supabase Storage usados (adjuntos multimedia de chat, grabaciones
  de llamadas) — un dump de esquema no incluye archivos binarios de Storage.
- **Verificación de restauración**: al menos trimestralmente, restaurar un
  backup en un proyecto de prueba y confirmar que la aplicación arranca
  correctamente contra esa restauración — un backup nunca probado no es un
  backup confiable.
- **Ubicación fuera de Supabase**: todos los backups (esquema, datos, Storage)
  deben vivir en un lugar distinto de la propia infraestructura de Supabase
  (ej. un bucket S3/GCS separado, o un repositorio de infraestructura
  privado), para sobrevivir a una posible pausa/eliminación del proyecto
  Supabase en sí — exactamente el escenario que afectó al proyecto anterior.

## Cómo separar staging y producción

- Dos proyectos Supabase físicamente distintos (`ping-staging-v2` y, más
  adelante, `ping-production`), cada uno con sus propias credenciales,
  nunca compartidas entre sí.
- El backend usa variables de entorno distintas por entorno
  (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` propios de cada proyecto),
  nunca la misma clave apuntando a dos proyectos.
- Las migraciones se aplican primero a staging, se verifican, y solo después
  se aplican a producción con el mismo archivo (nunca se edita una migración
  ya aplicada a producción; un cambio posterior es una migración nueva).
- Los datos de producción nunca se copian a staging sin anonimizar
  información personal.
