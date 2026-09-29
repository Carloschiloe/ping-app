# Ping en iPhone: runtime y procedimiento reproducible

Estado de la auditoría: 2026-09-29.

## Diagnóstico

- El proyecto móvil efectivo usa Expo SDK 57 (`expo` `^57.0.0`, lockfile
  `57.0.20`) y React Native `0.86.3`.
- El commit histórico `d3539a1` es el cambio que elevó el proyecto desde
  Expo SDK 54 / React Native `0.81.5` a SDK 57 / React Native `0.86.3`.
- El Expo Go instalado desde App Store en iPhone utiliza el runtime de SDK
  54. Expo documenta que SDK 55+ no está disponible en ese Expo Go. Por lo
  tanto, SDK 57 + Expo Go App Store es incompatible.
- `/_expo/open?platform=ios&runtime=expo` sí responde, pero sólo confirma que
  Expo CLI publicó una URL para el runtime `expo`; no prueba que el runtime
  nativo del teléfono sea compatible. En la sesión auditada devolvió:
  `runtime=expo`, `availableRuntimes=["expo"]`, `appId=com.carloschiloe.ping.staging`.
- La sesión LAN y el túnel pueden servir el manifiesto y el bundle JavaScript,
  pero eso ocurre antes de que Expo Go pueda ejecutar correctamente el bundle
  con su runtime nativo. No es evidencia de una app iniciada.

## Runtime correcto

Para este proyecto el camino correcto es un development build iOS de SDK 57,
no Expo Go App Store. El build debe incluir el runtime y las dependencias
nativas del proyecto, usar el perfil staging y conectarse al mismo Ping Core.

EAS está asociado a `@carloschiloe/mobile`, project ID
`0baf032d-de1a-49e7-9181-a5897927fb11`. Existe `staging-ios` con distribución
interna y variables de staging, pero todavía faltan:

1. `expo-dev-client` como dependencia del móvil.
2. Un perfil EAS iOS explícito con `developmentClient: true`.
3. Firma/distribución iOS autorizada para instalar el build en el iPhone.

No se debe degradar el proyecto a SDK 54 ni eliminar dependencias nativas para
hacerlo entrar en Expo Go. `react-native-agora` permanece declarado como
dependencia nativa; aunque la ruta M8 usa WebView/Web SDK y no se encontró un
import directo en esa ruta, su presencia refuerza la necesidad de controlar el
runtime con un development build.

## Procedimiento después de crear el development build

Desde `mobile/`:

```powershell
.\scripts\start-iphone-development.ps1
```

El script sólo inicia Metro con túnel, staging y `--dev-client`; no inicia
Expo Go, no usa producción y no modifica credenciales. El iPhone debe abrir el
development build instalado, no la aplicación Expo Go de App Store.

Verificaciones mínimas del servidor antes de abrir el build:

1. El manifiesto público debe tener `appVariant=staging`,
   `m8LiveVoiceEnabled=true` y host `*.exp.direct`, nunca `192.168.x.x`.
2. La URL `App.tsx.bundle` anunciada por el manifiesto debe responder HTTP 200.
3. El build debe mostrar el launcher de development client y conectar al
   servidor por túnel.
4. La app debe apuntar a
   `https://ping-backend-staging.onrender.com/api`.

## Recuperación

- Si el script indica que falta `expo-dev-client`, no volver a Expo Go ni a
  LAN: instalar/configurar el development build como tarea de infraestructura.
- Si no hay túnel, cerrar únicamente la sesión de Metro de esta copia y
  repetir el script. No matar procesos Node no identificados.
- Si el bundle responde pero el build no abre, comparar SDK/runtime del build
  instalado con `npx expo config --json`; no modificar Ping Core por ese error.
- Si el build abre y falla contra backend, comprobar health y SHA de staging;
  no cambiar la URL a producción.

Fuentes oficiales: [Expo: version mismatch](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/),
[Expo: development builds](https://docs.expo.dev/develop/development-builds/introduction/).
