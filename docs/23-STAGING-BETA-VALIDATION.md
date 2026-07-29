# Ping Staging Beta Validation

Fecha: 2026-07-28
Proyecto: `oonijgmddgyymhrlnvuu` (`Ping Staging V2`)

## Respaldo previo

Antes de migrar se creó un respaldo nuevo en almacenamiento local cifrado:

`C:\Users\carlo\Ping Backups\Staging V2\ping-staging-pre-private-files-20260728T214236Z`

Validaciones:

- proyecto y PostgreSQL 17.6 confirmados;
- transacción explícita `READ ONLY`;
- 18 artefactos presentes y no vacíos;
- hashes del manifiesto y payloads válidos;
- `application.dump` y `storage-metadata.dump` inspeccionables con
  `pg_restore --list`;
- cero archivos `.incomplete`;
- cero objetos de Storage antes de migrar;
- credenciales ausentes de los artefactos de texto.

Hashes principales:

| Archivo | Bytes | SHA-256 |
|---|---:|---|
| `manifest.json` | 10226 | `D2860FDDF1005932BC76567DB5187C2DFBBB1A644DE0973BCF9A589D8D38C232` |
| `application.dump` | 87508 | `806CBE839AA265D3721A5F655965FD1F0D130F2F70C51D46A61FB2D08B248906` |
| `storage-metadata.dump` | 67318 | `7807A1B4E481A7FCBCCD0FA4946554072D867AF12920BB4A14489CDE644D0EC7` |

## Migraciones remotas

Se aplicaron y registraron transaccionalmente:

- `20260728180000_canonical_commitment_beta`;
- `20260728183000_atomic_commitment_evidence`;
- `20260728190000_message_idempotency_beta`.

La auditoría posterior encontró grants por defecto demasiado amplios sobre
las tablas nuevas. Se corrigieron con:

- `20260728200000_harden_commitment_beta_permissions`.

El endurecimiento:

- revoca escritura directa de `anon` y `authenticated`;
- conserva `SELECT` autenticado sujeto a RLS;
- reserva escritura para `service_role`;
- valida dentro de `SECURITY DEFINER` la identidad del actor, participación,
  procedencia del mensaje, responsable y propiedad del contacto;
- conserva un `search_path` explícito.

## Validación E2E real

El script `backend/scripts/e2e-staging-beta.mjs` levantó el backend local
contra Supabase staging. Creó dos usuarios, conversaciones, mensajes,
propuestas, un Commitment y un archivo PNG no sensible, todos temporales.

Pasaron 31 comprobaciones:

- health check y autenticación;
- self-chat;
- rechazo de acceso cruzado;
- revocación de escritura directa en Proposal;
- validación defensiva de `SECURITY DEFINER`;
- mensaje e idempotencia por `client_message_id`;
- Proposal rechazada sin Commitment;
- confirmación única;
- rechazo de confirmación repetida;
- avance separado de resolución;
- seguimiento sin cierre;
- resolución obligatoriamente acompañada de resultado;
- eventos y evidencia;
- rollback completo ante fallo de evento;
- RLS entre usuarios;
- lectura privada autorizada;
- rechazo cruzado de archivo;
- subidas privadas cerradas;
- revocación que impide nuevas firmas.

La limpieza final confirmó cero perfiles, mensajes, propuestas, Commitments y
objetos temporales. `chat-media` terminó privado y vacío.

Para repetir el mismo recorrido contra el backend remoto, el ejecutor acepta
`E2E_BASE_URL`. El valor debe ser la URL HTTPS de
`ping-backend-staging` terminada en `/api`; cualquier otro host o ruta se
rechaza antes de crear datos temporales:

```powershell
$env:E2E_BASE_URL = 'https://ping-backend-staging.onrender.com/api'
node backend/scripts/e2e-staging-beta.mjs
```

Las credenciales siguen obteniéndose únicamente del entorno local ignorado por
Git. No deben incorporarse al comando, al repositorio ni a los resultados.

## Backend Render

La configuración local `render.staging.yaml` mantiene despliegue manual,
health check y separación por project ref. Los gates finales declarados son:

```text
ENABLE_PRIVATE_FILE_READS=true
ENABLE_PRIVATE_FILE_UPLOADS=false
ENABLE_NON_MVP_CAPABILITIES=false
ENABLE_OPERATION_MODULE=false
ENABLE_CALENDAR_INTEGRATION=false
ENABLE_CALLS=false
ENABLE_AUTOMATIONS=false
RUN_CRON_JOBS=false
```

El build de staging instala explícitamente las dependencias de desarrollo
necesarias para TypeScript, compila y luego las elimina del artefacto de
ejecución. La versión de Node queda fijada en `22.14.0`, igual que la usada en
la validación local. El repositorio y la rama
`codex/staging-beta` están declarados en el YAML para impedir un fallback a
`main`.

El servicio `ping-backend-staging` se creó mediante el CLI oficial de Render,
separado de producción, con Auto-Deploy deshabilitado. Su primer build confirmó
el commit y la rama correctos, pero reveló que `npm ci` omitía las dependencias
de compilación bajo `NODE_ENV=production`. El comando reproducible anterior
corrige esa omisión antes de repetir el despliegue manual.

## Android y EAS

EAS está autenticado como propietario del proyecto `@carloschiloe/mobile`.
Se corrigió el slug resuelto para conservar el vínculo con
`extra.eas.projectId`.

No se inició un build porque el entorno `preview` todavía no contiene las
tres variables públicas requeridas y no existe backend HTTPS de staging.
El equipo local tampoco tiene Java, Android SDK ni ADB, por lo que no hay una
alternativa local reproducible.

Después de validar Render:

1. configurar en EAS `preview` la URL HTTPS de la API staging, la URL de
   Supabase staging y su anon key;
2. ejecutar `eas build --platform android --profile staging-apk`;
3. registrar build ID, commit, versión y SHA-256;
4. instalar en dispositivo físico;
5. repetir el recorrido E2E sin conservar mensajes, tokens ni URLs firmadas
   en los resultados.

## Riesgos residuales

- La infraestructura Render aún no fue validada remotamente.
- No existe todavía APK ni prueba en dispositivo físico.
- La cola offline usa AsyncStorage: ahora minimiza, limita y elimina datos,
  pero el texto pendiente permanece sin cifrado específico de aplicación.
- `npm audit --omit=dev` informa 32 avisos en mobile: 20 altos y 12
  moderados, sin críticos. Se concentran en Expo, React Native, Metro,
  Babel/Jest, glob y WebSocket usados principalmente durante desarrollo y
  build. La corrección completa requiere una actualización mayor de Expo y
  queda fuera de esta fase.
- `ws` conserva un aviso sin corrección segura demostrada para todo el árbol
  de Expo/React Native; no se impuso un override mayor.
