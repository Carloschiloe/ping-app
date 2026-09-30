# Ping iPhone development runtime

Estado de la auditoria: 2026-09-29.

## Diagnostico comprobado

- El proyecto movil efectivo usa Expo SDK 57 (`expo` `^57.0.0`, lockfile
  `57.0.20`) y React Native `0.86.3`.
- El commit historico `d3539a1` elevo el proyecto desde Expo SDK 54 / React
  Native `0.81.5` a SDK 57 / React Native `0.86.3`.
- El Expo Go instalado desde App Store en iPhone utiliza el runtime de SDK
  54. Expo documenta que SDK 55+ no esta disponible en ese Expo Go. SDK 57
  y Expo Go App Store son incompatibles.
- `/_expo/open?platform=ios&runtime=expo` solo confirma que Expo CLI publico
  una URL para el runtime Expo; no prueba compatibilidad del runtime nativo.
- Metro y tunnel pueden servir manifiesto y bundle JavaScript aunque Expo Go
  no pueda ejecutar el proyecto con su runtime nativo.

## Runtime correcto

El runtime correcto es un development build iOS de SDK 57, no Expo Go. La
build debe contener el runtime y dependencias nativas del proyecto, usar el
perfil staging y conectarse al mismo Ping Core.

EAS esta asociado a `@carloschiloe/mobile`, project ID
`0baf032d-de1a-49e7-9181-a5897927fb11`. El proyecto contiene
`expo-dev-client ~57.0.19` y el perfil `staging-ios-dev` con
`developmentClient: true`, distribucion interna y variables explicitas de
staging. La firma/distribucion iOS de EAS y la instalacion en iPhone son los
unicos pasos que pueden requerir interaccion del propietario.

No degradar a SDK 54 ni eliminar dependencias nativas para entrar en Expo Go.
`react-native-agora` permanece declarado; la ruta M8 usa WebView/Web SDK,
pero el runtime nativo debe seguir siendo controlado por el development build.

## Generar y ejecutar

Desde `mobile/`:

```powershell
npx eas-cli@latest build --platform ios --profile staging-ios-dev
```

Cuando la build este instalada en el iPhone, iniciar Metro para el
development client:

```powershell
.\scripts\start-iphone-development.ps1
```

El script usa `APP_VARIANT=staging`, el backend
`https://ping-backend-staging.onrender.com/api`, M8 habilitado, `--dev-client`
y tunnel. No inicia Expo Go y no usa produccion.

## Verificaciones

1. El perfil EAS es `staging-ios-dev` y la build pertenece a
   `@carloschiloe/mobile`.
2. El manifiesto anunciado por Metro tiene `appVariant=staging`,
   `m8LiveVoiceEnabled=true` y host `*.exp.direct`, nunca `192.168.x.x`.
3. La URL de `App.tsx.bundle` responde HTTP 200.
4. La app apunta al backend staging anterior y `/api/health` confirma el
   servicio staging antes de probar voz.
5. El iPhone abre el development build instalado, no Expo Go.

## Recuperacion

- Si el script indica que falta `expo-dev-client`, no volver a Expo Go ni a
  LAN: corregir la build SDK57.
- Si no hay tunnel, cerrar solo la sesion Metro de esta copia y repetir el
  script. No matar procesos Node no identificados.
- Si el bundle responde pero la build no abre, comparar SDK/runtime de la
  build instalada con `npx expo config --json`; no cambiar Ping Core.
- Si la app abre y falla contra backend, comprobar health y SHA de staging;
  no cambiar la URL a produccion.

Fuentes oficiales: [Expo version mismatch](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/),
[Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).
