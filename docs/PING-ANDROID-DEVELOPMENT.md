# Ping Android development runtime

Estado: runtime local preparado para M8; M8 todavía no está certificado.

## Runtime verificado

- Proyecto: Expo SDK 57 / React Native 0.86.3.
- Runtime: development build Android; Expo Go no es el runtime del proyecto.
- Emulador: `Ping_M8_API35`, Google APIs, Android API 35, x86_64.
- Aceleración: Windows Hypervisor Platform disponible y utilizable.
- JDK: Temurin/OpenJDK 17.
- Android SDK local: `C:\tmp\ping-android-sdk`.
- AVD home: `C:\tmp\ping-android-avd`.
- Paquete staging: `com.carloschiloe.ping.staging`.
- Backend: `https://ping-backend-staging.onrender.com/api`.
- Supabase staging: proyecto `oonijgmddgyymhrlnvuu`.

No se usa producción. La clave anónima de Supabase se lee únicamente desde
`backend/.env` local, en memoria del proceso de desarrollo. Nunca se imprime,
versiona ni se incluye una service role key en el cliente.

## Inicio reproducible

Después de tener instalada la development APK, desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\mobile\scripts\start-android-development.ps1
```

El script inicia el AVD si es necesario, comprueba el arranque, instala la APK
si falta, carga la configuración staging desde `backend/.env`, levanta Metro
como development client en modo offline en el puerto 8081, configura `adb
reverse` y abre el enlace real de `Ping Staging`. `--offline` es intencional:
Expo CLI rechaza combinarlo con `--lan`, y evita que el manifiesto dependa de
la consulta remota de la cuenta Expo.

El script exige que `SUPABASE_URL` corresponda a
`oonijgmddgyymhrlnvuu.supabase.co`; se detiene ante cualquier otra configuración.

## Primera compilación / reinstalación

La development APK se genera una vez por versión nativa. El build verificado se
realizó con `expo prebuild --platform android` y Gradle en un worktree corto de
Windows para evitar errores de `manifest build.ninja still dirty` por la ruta
larga del checkout. La APK resultante se instaló con:

```powershell
$env:ANDROID_SDK_ROOT = 'C:\tmp\ping-android-sdk'
$env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
adb -s emulator-5554 install -r -d .\android\app\build\outputs\apk\debug\app-debug.apk
```

Para cambios JavaScript basta reiniciar el script de desarrollo. Para cambios
nativos hay que volver a compilar e instalar la APK; no usar Expo Go.

## Evidencia de preparación

- AVD booted: PASS (`adb get-state=device`, `sys.boot_completed=1`).
- Development build instalada: PASS (`com.carloschiloe.ping.staging`).
- Bundle JavaScript: PASS (`ReactHost.loadJSBundleFromMetro`, `Running "main"`).
- Development client: PASS (manifiesto HTTP 200, `runtimeVersion=exposdk:57.0.0`,
  `MainActivity` reanudada mediante `exp+mobile` y `adb reverse`).
- Supabase client: PASS después de cargar la configuración staging en memoria.
- Health staging: PASS (`ok=true`, `db_status=connected`,
  `deployment_marker=ping-backend-staging`).
- Micrófono: PASS (permisos nativos `RECORD_AUDIO` y
  `MODIFY_AUDIO_SETTINGS`, permiso de runtime concedido en el AVD).
- Salida de audio: PASS (hardware de altavoz disponible en el AVD).
- M8 voz bidireccional, continuidad y barge-in: todavía no probados; no se
  declara M8 completo por esta evidencia.

## Recuperación

1. Cerrar sólo el proceso Metro de Ping que escuche 8081.
2. Confirmar que el AVD `Ping_M8_API35` está disponible.
3. Ejecutar nuevamente el script único.
4. Si aparece `Invalid supabaseUrl`, no iniciar una prueba: verificar que
   `backend/.env` tenga la configuración staging y no imprimir sus valores.

La sesión final no usa Expo Go ni tunnel: para el emulador local usa el
development client SDK57, el manifiesto offline de Metro y `adb reverse`.

El gate iPhone SDK57 queda documentado por separado en
`docs/PING-IPHONE-DEVELOPMENT.md` y requiere Apple/EAS; no es el runtime
principal local de M8 en Windows.
