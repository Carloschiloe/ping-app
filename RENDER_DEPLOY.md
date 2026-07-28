# Deploy Backend to Render.com

Ping's backend is fully configured to be deployed on Render with just a few clicks.

## Pasos para Desplegar

1. **Subir tu código a GitHub**
   Sube todo el proyecto (o solo la carpeta `/backend` si prefieres) a un repositorio en tu perfil de GitHub.

2. **Conectar Render**
   - Entra a [Render.com](https://render.com) y crea tu cuenta (o inicia sesión).
   - Haz clic en el botón de **"New +"** y selecciona **"Web Service"**.
   - Conecta tu cuenta de GitHub y elige el repositorio donde subiste el código.

3. **Configurar el Servicio Web**
   Llena los campos como se indica a continuación:
   - **Name:** `ping-backend` (o el nombre que gustes)
   - **Root Directory:** `backend` *(OBLIGATORIO: Si subiste el monorepo entero, aquí le dices a Render que el backend vive en esta subcarpeta).*
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

4. **Variables de Entorno**
   Baja hasta la sección de "Environment Variables" y haz clic en **"Add Environment Variable"** para poner tus llaves secretas:
   - `SUPABASE_URL`: (Tú URL ej. https://wbigqhtuzfmpnxservlf.supabase.co)
   - `SUPABASE_ANON_KEY`: (Tú Public Anon Key)
   - `SUPABASE_SERVICE_ROLE_KEY`: (Tú Service Role Secret Key)
   - `PORT`: `10000` *(Render prefiere el puerto 10000)*

5. **¡Deploy!**
   Haz clic en **"Create Web Service"**.
   Render clonará tu repo, instalará las dependencias, compilará el TypeScript a JavaScript y encenderá tu servidor apuntando a Supabase.

Cuando termine de cargar y veas un log que dice `✅ PING Backend listening on port 10000`, Render te dará un enlace. Por ejemplo:
`https://ping-backend-xyz.onrender.com`

## Conectar Mobile con la API de Producción

Una vez que el backend esté en vivo, ve a tu computadora, abre `/mobile/.env` y actualiza la URL para que no apunte más a tu localhost, sino al backend de Render:

```env
EXPO_PUBLIC_API_URL=https://ping-backend-xyz.onrender.com/api
```
*(Asegúrate de incluir `/api` al final al igual que en local).*

¡Listo! Ya puedes encender `npm start` en `/mobile` y usar temporal o indefinidamente la App conectada de verdad desde la nube.

## Estado actual de los entornos

El repositorio sólo versiona un servicio Render llamado `ping-backend` en
`render.yaml`. Ese servicio tiene despliegue automático por commit y no está
identificado como staging. No existe un segundo servicio, blueprint o archivo
versionado que vincule un backend remoto con `Ping Staging V2`
(`oonijgmddgyymhrlnvuu`).

Los archivos `backend/.env` y `mobile/.env` son locales e ignorados por Git.
Permiten desarrollo contra staging, pero no prueban ni configuran un
despliegue remoto. Tampoco se ha verificado desde el repositorio qué proyecto
Supabase utiliza el servicio Render existente. Por seguridad debe tratarse
como producción hasta demostrar lo contrario.

## Preparación mínima de un backend exclusivo de staging

Crear el servicio requiere acceso autenticado a Render y debe hacerse como un
recurso separado, sin modificar `ping-backend`:

El blueprint reproducible está en `render.staging.yaml`. Al crear el Blueprint
en Render se debe seleccionar expresamente ese archivo; no sustituye ni
modifica `render.yaml`.

1. Crear un Web Service con nombre inequívoco, por ejemplo
   `ping-backend-staging`.
2. Usar `backend` como Root Directory, `npm ci && npm run build` como Build
   Command y `npm start` como Start Command.
3. Desactivar inicialmente el auto-deploy. El primer despliegue debe apuntar a
   un commit explícitamente aprobado y verificable.
4. Configurar credenciales exclusivas de `oonijgmddgyymhrlnvuu`:
   - `SUPABASE_URL`;
   - `SUPABASE_ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY`.
5. Configurar un `ENCRYPTION_KEY` exclusivo de staging y un
   `ALLOWED_ORIGINS` limitado al cliente de staging.
6. Mantener exactamente:

   ```env
   ENABLE_PRIVATE_FILE_READS=true
   ENABLE_PRIVATE_FILE_UPLOADS=false
   ENABLE_NON_MVP_CAPABILITIES=false
   ENABLE_OPERATION_MODULE=false
   ENABLE_CALENDAR_INTEGRATION=false
   ENABLE_CALLS=false
   ENABLE_AUTOMATIONS=false
   RUN_CRON_JOBS=false
   ```

7. No compartir variables, URL ni credenciales con el servicio de producción.
8. Conectar una compilación de la aplicación destinada a staging mediante
   `EXPO_PUBLIC_API_URL`; no cambiar la configuración de producción.

La variable `PING_EXPECTED_SUPABASE_PROJECT_REF` queda fijada en
`oonijgmddgyymhrlnvuu`. El backend rechaza el arranque si `SUPABASE_URL` no
pertenece exactamente a ese proyecto.

## Validación obligatoria antes de usar staging

Con el servicio desplegado:

- comprobar `/health` y confirmar que consulta `oonijgmddgyymhrlnvuu`;
- verificar lectura privada autorizada mediante `/api/files/read-url`;
- comprobar `403` para acceso cruzado o revocado;
- comprobar `404` para recursos sin referencia de archivo, sin afectar el
  resto del recurso;
- comprobar `503` en `/api/files/upload-url`;
- comprobar que Calendar, Calls y Operation permanecen en `503`;
- confirmar que automatizaciones y cron no iniciaron procesos;
- repetir la validación de TTL y ausencia de URLs firmadas persistidas.

La reversión consiste en establecer `ENABLE_PRIVATE_FILE_READS=false` en el
servicio staging y volver a desplegar el mismo commit. No se hace público el
bucket, no se habilitan subidas y no se modifica producción.

## Bloqueos actuales

Antes de crear el servicio faltan:

- una sesión autenticada o credencial administrativa de Render;
- confirmar la cuenta/equipo y región donde vivirá staging;
- seleccionar el commit aprobado para el primer despliegue;
- definir el origen permitido y la URL pública del cliente de staging;
- verificar después del alta que ninguna variable apunta a producción.

## Checklist de creación

- [ ] Render autenticado en la cuenta y equipo correctos.
- [ ] Nuevo Blueprint creado desde `render.staging.yaml`.
- [ ] Nombre final `ping-backend-staging`.
- [ ] Auto-deploy desactivado.
- [ ] `SUPABASE_URL` corresponde a `oonijgmddgyymhrlnvuu`.
- [ ] Anon key y service-role key pertenecen al mismo proyecto.
- [ ] `ENCRYPTION_KEY` es exclusivo de staging.
- [ ] `ALLOWED_ORIGINS` contiene sólo el cliente de staging.
- [ ] Ningún secreto fue copiado desde producción.
- [ ] Commit del primer despliegue anotado.
- [ ] `/api/health` responde correctamente.
- [ ] Lectura privada autorizada validada.
- [ ] Acceso cruzado y revocado rechazados.
- [ ] Subidas, Calendar, Calls y Operation responden `503`.
- [ ] Automatizaciones y cron permanecen inactivos.
- [ ] Mobile staging apunta al nuevo host; mobile producción no cambió.
