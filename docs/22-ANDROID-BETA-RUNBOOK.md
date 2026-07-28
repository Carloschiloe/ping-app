# Ping Android Beta Runbook

Estado: preparación local. Ningún build ni despliegue remoto fue ejecutado al crear este documento.

## 1. Variantes

| Perfil | Aplicación | Package | Artefacto | Uso |
|---|---|---|---|---|
| `staging-apk` | Ping Staging | `com.carloschiloe.ping.staging` | APK | instalación directa en dispositivos beta |
| `staging-aab` | Ping Staging | `com.carloschiloe.ping.staging` | AAB | canal interno de Google Play, cuando se apruebe |
| `production` | Ping | `com.carloschiloe.ping` | AAB | producción futura; no habilitar durante la beta de staging |

Las variantes pueden coexistir en el mismo dispositivo y usan esquemas de enlace distintos.

## 2. Configuración obligatoria de staging

La variable `EXPO_PUBLIC_API_URL` debe existir en el entorno EAS `preview` y apuntar exclusivamente a `ping-backend-staging`, con sufijo `/api`. No debe apuntar al backend de producción.

El perfil fija `EXPO_PUBLIC_SUPABASE_PROJECT_REF=oonijgmddgyymhrlnvuu`. `app.config.ts` rechaza otro project ref declarado para staging.

En `ping-backend-staging` deben mantenerse:

```text
PING_ENVIRONMENT=staging
PING_EXPECTED_SUPABASE_PROJECT_REF=oonijgmddgyymhrlnvuu
ENABLE_PRIVATE_FILE_READS=true
ENABLE_PRIVATE_FILE_UPLOADS=false
ENABLE_NON_MVP_CAPABILITIES=false
ENABLE_OPERATION_MODULE=false
ENABLE_CALENDAR_INTEGRATION=false
ENABLE_CALLS=false
ENABLE_AUTOMATIONS=false
RUN_CRON_JOBS=false
```

Los secretos de Supabase, OpenAI y cualquier proveedor se configuran en Render/EAS; nunca en `eas.json`, el repositorio o el APK como secretos privados. Las variables `EXPO_PUBLIC_*` son visibles en la aplicación y no deben contener secretos.

## 3. Permisos Android de la beta

La configuración bloquea cámara, micrófono, modificación de audio, contactos, calendario, ubicación y biblioteca multimedia. Es coherente con Calls, Calendar, Operation y subidas privadas cerrados. Notificaciones puede solicitarse en contexto para avisos relevantes.

Antes de habilitar una capacidad futura se debe revisar su propósito y permiso en un cambio separado. Instalar una dependencia no autoriza su permiso.

## 4. Validación local previa

Desde `mobile/`:

```powershell
$env:APP_VARIANT = 'staging'
$env:EXPO_PUBLIC_SUPABASE_PROJECT_REF = 'oonijgmddgyymhrlnvuu'
$env:EXPO_PUBLIC_API_URL = 'https://STAGING-BACKEND.example/api'
npx expo config --type public
npx tsc --noEmit
npm test
npm run lint
```

Verificar en la configuración resuelta:

- nombre `Ping Staging`;
- package `com.carloschiloe.ping.staging`;
- project ref esperado;
- ausencia de permisos bloqueados;
- URL exclusiva del backend de staging.

## 5. Build interno

Requiere sesión de Expo/EAS autorizada y `EXPO_PUBLIC_API_URL` configurada en el entorno `preview`:

```powershell
npx eas-cli build --platform android --profile staging-apk
```

No usar el perfil `production` para probar staging. El APK interno se instala directamente; el AAB está reservado para una pista de tienda y no se instala directamente.

## 6. Prueba en dispositivo real

1. Registrar hash Git, perfil EAS, versión y URL del artefacto.
2. Instalar `Ping Staging` sin desinstalar Ping producción.
3. Confirmar que la pantalla inicial identifica staging.
4. Autenticar con una cuenta de prueba de `oonijgmddgyymhrlnvuu`.
5. Ejecutar self-chat online.
6. Enviar offline, reconectar y confirmar un único mensaje.
7. Simular respuesta perdida y confirmar idempotencia.
8. Crear una propuesta, rechazarla y confirmar que no existe Commitment.
9. Crear y confirmar otra propuesta, registrar avance y resolver con resultado.
10. Solicitar lectura privada autorizada y comprobar rechazo cruzado.
11. Confirmar que registros sin archivos funcionan.
12. Confirmar que subidas, Calendar, Calls y Operation permanecen bloqueados.
13. Revisar que no se soliciten permisos bloqueados.
14. Guardar resultados sin mensajes, datos personales, tokens ni URLs firmadas.

## 7. Criterios de salida

La beta interna es apta sólo si backend, mobile, TypeScript, lint e integración están en verde; las migraciones aditivas fueron respaldadas y validadas en staging; no existe acceso cruzado; el APK usa el backend y Supabase de staging; los gates prohibidos siguen cerrados.

Bloqueos actuales: falta desplegar y verificar `ping-backend-staging`, aplicar y validar las migraciones nuevas en staging y disponer de autenticación EAS para generar el artefacto.
