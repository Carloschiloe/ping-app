# CORS y `ALLOWED_ORIGINS`

Estado de esta auditoría: revisión local completada, sin deploy, sin push y sin
lectura de valores de secretos de Render.

## Fuentes revisadas

- `backend/src/config/env.ts`
- `backend/src/security/corsPolicy.ts`
- `backend/src/app.ts`
- `backend/tests/corsPolicy.test.ts`
- `render.yaml`
- `render.staging.yaml`
- documentación de readiness y auditoría técnica relacionada con CORS.

## Comportamiento vigente

- Una solicitud sin header `Origin` se permite. Esto conserva la compatibilidad
  con React Native/Expo y otros clientes nativos, donde CORS no es el mecanismo
  de seguridad del cliente.
- El origen exacto del propio backend se permite cuando coincide en esquema y
  host con la solicitud. Esto permite el WebView de voz que carga contenido del
  mismo backend sin abrir el acceso a hosts arbitrarios.
- Los orígenes explícitos de `ALLOWED_ORIGINS` sólo aceptan `http` o `https`,
  sin credenciales, rutas, query strings, fragmentos ni comodines. Se
  normalizan de forma determinista y se deduplican.
- `production` y `staging` permanecen estrictos aunque `NODE_ENV` estuviera
  configurado accidentalmente como `development`.
- En un entorno local no estricto, una lista vacía conserva la comodidad de
  desarrollo existente. Esa excepción no se aplica a production ni staging.
- Una configuración inválida de `ALLOWED_ORIGINS` impide el arranque mediante
  una validación que informa sólo el número de entradas inválidas; nunca
  imprime sus valores.

## Blueprints

`render.yaml` y `render.staging.yaml` declaran `ALLOWED_ORIGINS` con
`sync: false`. Es correcto que no exista un valor en el repositorio: Render
debe conservar el valor administrado fuera del código y no se debe copiar a
logs, commits ni respuestas.

Los Blueprints fijan `NODE_ENV=production` y distinguen los entornos mediante
`PING_ENVIRONMENT=production` y `PING_ENVIRONMENT=staging`, respectivamente.
No se añadió ningún dominio a ninguno de los dos archivos.

El Blueprint de producción declara el recurso `ping-backend`, mientras que el
inventario histórico de esta aplicación identifica el servicio live como
`ping-app`. Esa diferencia de nombres debe confirmarse antes de sincronizar un
Blueprint, para no aplicar configuración al servicio equivocado. Esta auditoría
no sincroniza ni modifica Render.

## Pendiente por falta de origen web confirmado

No existe en el repositorio un dominio confirmado de una interfaz web de Ping.
Las URLs `onrender.com` documentadas corresponden a backends/API y no deben
convertirse automáticamente en un origen web permitido. La aplicación móvil
usa la URL de API y no necesita una entrada CORS para funcionar.

Antes de habilitar una interfaz web se debe confirmar, para cada entorno:

1. el origen HTTPS exacto que carga la interfaz, incluyendo host y puerto si
   aplica;
2. si existe uno distinto para staging y production; y
3. que ese origen no requiere comodines ni rutas.

Después de esa confirmación, se podrá registrar la lista exacta en el valor
administrado de `ALLOWED_ORIGINS` del servicio correspondiente y desplegar el
cambio. Hasta entonces, una lista vacía bloquea navegadores cross-origin pero
mantiene mobile y el WebView same-origin operativos.
