# Despliegue de Ping en producción

## Fuente operativa de verdad

- Servicio Render: `ping-app` (`srv-d6ipqi75r7bs73fnbom0`).
- URL: `https://ping-app-con3.onrender.com`.
- Repositorio: `https://github.com/Carloschiloe/ping-app.git`.
- Health check: `/api/health`.
- Root directory: `backend`.
- Build: `npm ci --include=dev && npm run build && npm prune --omit=dev`.
- Start: `npm start`.

El archivo [render.yaml](./render.yaml) es la configuración versionada de producción. Las credenciales y variables privadas deben permanecer en Render y Supabase; nunca se deben copiar al repositorio.

## Variables obligatorias en Render

Configurar en el servicio `ping-app`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `ALLOWED_ORIGINS`
- `PING_ENVIRONMENT=production`
- `PING_EXPECTED_SUPABASE_PROJECT_REF=wbigqhtuzfmpnxservlf`

Las variables de funcionalidades deben mantenerse con valores de producción explícitos. El backend valida el proyecto Supabase esperado antes de iniciar.

## Secuencia de publicación

1. Ejecutar los chequeos locales del backend y mobile.
2. Confirmar que las migraciones nuevas fueron revisadas y aplicadas al proyecto Supabase productivo por un operador con permisos.
3. Subir el commit validado a `main`.
4. Confirmar en Render que `ping-app` apunta a `main` y al repositorio correcto.
5. Disparar el despliegue sólo después de confirmar la rama.
6. Verificar `/api/health`, autenticación, conversaciones, mensajes, búsqueda y voz.
7. Revisar logs de arranque y errores 5xx durante los primeros minutos.

## Mobile producción

La aplicación Expo usa:

```env
EXPO_PUBLIC_API_URL=https://ping-app-con3.onrender.com/api
```

Para generar el APK instalable:

```powershell
cd mobile
npx eas build --platform android --profile production-apk
```

Para Google Play se debe usar el perfil `production` y una credencial de firma EAS/Play permanente. No se debe publicar un APK firmado con el keystore debug local.

## Operación y rollback

El rollback se realiza desde Render seleccionando el último deploy sano. No se deben modificar datos productivos manualmente para revertir código. Las migraciones de Supabase son aditivas e idempotentes cuando así se indica en su archivo; cualquier reversión de esquema requiere una migración explícita y respaldos verificados.
