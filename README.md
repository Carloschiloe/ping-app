# PING - Chat that remembers

Este es el MVP de la aplicación PING. Un "Self-Chat" que detecta fechas automáticamente y crea compromisos (recordatorios) sincronizados de extremo a extremo con tu base de datos y autenticación de Supabase.

La arquitectura está completamente estructurada para escalar (B2B o SaaS B2C).

---

## 🚀 Quickstart

Sigue estos pasos para arrancar el proyecto de 0 a 100 sin instalar nada extra ni escribir código.

### Paso 1: Configurar Variables de Entorno

Obtén las credenciales de tu proyecto de [Supabase](https://supabase.com/):
- **Project URL**
- **anon key**
- **service_role key**

1. Navega a `backend/` y renombra `.env.example` a `.env`. Completa las variables:
   ```env
   PORT=3000
   SUPABASE_URL=tu_supabase_project_url
   SUPABASE_ANON_KEY=tu_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key
   ```
2. Navega a `mobile/` y renombra `.env.example` a `.env`. Completa las variables:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=tu_supabase_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_supabase_anon_key
   EXPO_PUBLIC_API_URL=http://localhost:3000/api
   ```
   *(Importante: Si pruebas en dispositivo físico, cambia localhost a la IP de tu PC).*

### Paso 2: Ejecutar Esquema de Base de Datos
En el dashboard de tu proyecto en Supabase, ve a **SQL Editor**, copia el contenido del archivo principal `supabase/schema.sql` y ejecútalo entero. Esto configura las tablas y reglas de seguridad base.

### Paso 3: Instalar Dependencias
Abre 2 terminales, una para el backend y otra para el mobile y corre:
```bash
npm install
```

### Paso 4: Levantar el Backend
En la terminal del `/backend`, corre:
```bash
npm run dev
```
*(Valida que diga "✅ PING Backend listening on port 3000").*

### Paso 5: Levantar Mobile App 
En la terminal de `/mobile`, corre:
```bash
npm start
```
Escanea el código QR con la app **Expo Go** en tu celular o ábrelo en un emulador (Presiona "i" para iOS / "a" para Android).

### Paso 6: Prueba el flujo completo
1. Regístrate en la app con un correo y contraseña.
2. Ingresarás al chat. Escribe: `"comprar madera el viernes"` y presiona Enviar.
3. El frontend de React Native llama de forma segura a nuestro backend (enviando el token de autenticación Supabase nativo).
4. El backend parseará "el viernes", guardará el chat original y paralelamente insertará el **commitment** usando la llave Service Role de administrador.
5. Regresa al "Hoy" o verifica en Supabase para validar que el compromiso fue insertado con éxito.

---

## 🛠 Troubleshooting (Errores Comunes)

Si te encuentras con problemas durane el set-up, revisa estos escenarios:

#### 1. "Backend no conectado" / Request timeout en app
Asegúrate de cambiar `localhost` por tu IP local en la variable `EXPO_PUBLIC_API_URL` si usas un dispositivo móvil real. Ej: `http://192.168.1.10:3000/api`.

#### 2. Auth error en el backend
Validar que `SUPABASE_SERVICE_ROLE_KEY` esté debidamente puesta en el .env del backend. El backend usa esto indirecto a RLS para verificar la validez del bearer token de los usuarios y automatizar. No la compartas nunca en el frontend.

#### 3. Los compromisos no aparecen en la Tab de "Hoy"
Asegúrate de que estás escribiendo fechas detectables (ej. "mañana", "el domingo", "12 de marzo"). Si las fechas no se detectan, el motor guarda el mensaje pero no crea recordatorios en la tabla commitments.

#### 4. Error 401: Unauthorized 
Checa si el script de Base de Datos base (schema.sql) copió con éxito y permitió a `handle_new_user()` auto-crear registros en la persistencia `profiles(id, email)`, porque los insert requieren un profile para el foregin constraint.

#### 5. Errores bloqueantes "Invalid token" al iniciar en Mobile
Por favor, asegúrate de reinstalar Supabase/Expo Secure Store. Borra la carpeta Node_modules y vuelve a correr `npm install`.

---

## Instrucciones de Producción
En `/backend`, usa `npm run build` seguido de `npm start` para producción en Node.
Para la aplicación móvil de producción, revisa comandos para EAS en las documentaciones de Expo (`eas build --platform all`).
