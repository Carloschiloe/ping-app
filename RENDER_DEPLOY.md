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
