# Mobile dependency security

## Alcance

Auditoría de `mobile/package.json` y `mobile/package-lock.json` ejecutada con:

```text
npm audit --omit=dev
```

La aplicación permanece en Expo SDK 57, React Native 0.86.3 y NativeWind 4.x.
No se usó `npm audit fix --force`, no se cambiaron majors de Expo/React Native y
este bloque no incluye deploy ni push.

Resultado después de los overrides: `npm audit --omit=dev` reporta 42 alertas
restantes (17 moderate, 25 high, 0 critical). Las correcciones seguras del
mismo árbol eliminaron las alertas de seis familias transitivas; las restantes
no tienen una actualización compatible con Expo SDK 57/RN 0.86 comprobada.

## Correcciones aplicadas

Se añadieron overrides mínimos para dependencias transitivas que mantienen el
contrato semver de sus consumidores actuales:

- `@expo/metro-file-map` 57.0.2 -> 57.0.4.
- `compression` -> 1.8.2.
- `source-map-js` -> 1.2.2.
- `brace-expansion` -> 5.0.12 sólo bajo `glob` y `@expo/fingerprint`.
- `shell-quote` -> 1.11.0 sólo bajo `react-devtools-core`.
- `ws` -> 7.5.13 sólo bajo Metro, React Native dev middleware y React
  DevTools. Las ramas `ws` 8 usadas por Expo/Supabase no se fuerzan a 7.x.

Estas dependencias forman parte principalmente de CLI, Metro, desarrollo o
prebuild; no se introducen cambios de runtime nativo ni de la API de la app.

## Hallazgos que no se corrigen con un override seguro

El informe de npm también marca rutas cuya solución sugerida baja a versiones
antiguas incompatibles o requiere un major de la plataforma:

- `expo`, `@expo/cli`, Metro y `node-forge`: npm ofrece Expo 44, incompatible
  con SDK 57. Se mantiene la línea SDK 57 y se debe actualizar Expo en un ciclo
  coordinado, no mediante override.
- `react-native`, `@react-native/virtualized-lists`,
  `@react-native/metro-config` y `react-native-worklets`: npm ofrece RN 0.72 o
  worklets antiguos. No se fuerzan porque romperían RN 0.86/Reanimated 4.
- `@react-native-community/datetimepicker`: npm ofrece 8.1.1, pero la app usa
  la línea compatible con Expo 57. Requiere validación de SDK antes de cambiar.
- `expo-router`, `expo-sharing`, `expo-splash-screen` y `query-string`:
  requieren actualizar Expo Router/paquetes Expo coordinadamente; no se fuerza
  una versión de otra línea SDK.
- `nativewind`, `react-native-css-interop`, `tailwindcss`, `braces` y
  `micromatch`: la corrección sugerida implica NativeWind/Tailwind major o
  romper el rango de `chokidar`. Se mantiene NativeWind 4/Tailwind 3 hasta una
  migración probada.
- `js-yaml` y `postcss-selector-parser`: las versiones más nuevas compatibles
  con los rangos actuales siguen incluidas en los rangos advisory; no se
  fuerza una versión mayor sin validar Expo CLI y NativeWind/Tailwind.
- `@xmldom/xmldom`: el árbol actual usa 0.8.13 y la corrección disponible está
  en la línea 0.9.x. Debe probarse específicamente `plist`, `xcode` y los
  plugins Expo antes de imponerla.
- `decode-uri-component`/`query-string`: el arreglo requiere una línea más
  nueva de Expo Router, no un override aislado.

## Plan por fases

1. Mantener estos overrides y ejecutar la matriz móvil completa en cada cambio
   de Expo SDK 57.x. Verificar que `npm audit --omit=dev` no reporte nuevas
   vulnerabilidades corregibles dentro de la misma línea.
2. En una rama separada, evaluar actualización coordinada de Expo SDK 58,
   Expo Router, módulos Expo, Reanimated/Worklets y React Native. La fase debe
   incluir `expo-doctor`, TypeScript, lint, suite Vitest, build nativo de
   Android/iOS y pruebas manuales de autenticación, chat, multimedia,
   notificaciones y sincronización offline.
3. Después de estabilizar SDK 58, evaluar `@xmldom/xmldom` 0.9.x y la migración
   NativeWind/Tailwind por separado, con pruebas de navegación, estilos y
   prebuild.
4. Revisar periódicamente las alertas de tooling. Las vulnerabilidades de CLI,
   Metro y prebuild deben tratarse como superficie de desarrollo/build, sin
   asumir que forman parte del bundle móvil final.

## Criterio de seguridad

No se considera aceptable eliminar alertas bajando Expo/React Native, forzando
majors incompatibles, regenerando el lockfile sin revisión, o ejecutando
`npm audit fix --force`.

## Verificación de este bloque

- `npx tsc --noEmit`: correcto.
- `npm test -- --run`: 52 archivos y 848 tests correctos.
- `npm run lint`: correcto, 0 errores y 174 warnings preexistentes.
- `npm ls --omit=dev`: árbol consistente; las ramas `ws` 7.x quedan limitadas
  a Metro/dev middleware/DevTools y Expo/Supabase mantienen `ws` 8.x.

## Auditoría complementaria: Expo Go y SDK 57 (2026-10-19)

La configuración instalada queda alineada con Expo SDK 57:

- `expo` resuelve `57.0.20` y `react-native` `0.86.3`.
- `expo config --type public` resuelve `sdkVersion: 57.0.0`, producción con
  `scheme: ping`, paquete Android `com.carloschiloe.ping` y el runtime versionado
  por `appVersion`.
- `npx expo install --check` no encontró desalineaciones usando el mapa local de
  módulos nativos de Expo SDK 57. La validación se ejecutó sin red; el resultado
  debe repetirse online cuando el entorno tenga acceso al registro.
- La suite móvil quedó en 52 archivos y 848 tests correctos; TypeScript no
  reportó errores y ESLint terminó con 0 errores y 174 warnings preexistentes.

### Qué sí funciona en Expo Go

Los módulos Expo usados por la app (`expo-audio`, `expo-camera`, contactos,
filesystem, notificaciones, router, sharing, video y los demás módulos SDK 57),
además de las librerías comunitarias incluidas por Expo Go (datetimepicker,
NetInfo, gesture-handler, reanimated, safe-area-context, screens y webview),
están en la línea compatible con SDK 57. El código actual tampoco importa
`react-native-agora`.

### Qué no debe probarse con Expo Go

- `react-native-agora@4.6.2` incluye Android/iOS nativos y requiere un
  development build o una build de distribución si se vuelve a importar.
  Está instalado, pero hoy no tiene imports en `mobile/src`, `App.tsx`,
  `components`, `hooks` ni `app`.
- Las notificaciones push remotas no son una prueba válida en Expo Go desde
  SDK 53; deben verificarse en una development build o en la build de
  producción. Las notificaciones locales sí son compatibles.
- Expo Go no representa el nombre, icono, esquema, permisos finales ni otros
  cambios nativos de `app.config.ts`. Es válido para validar JavaScript y APIs
  incluidas, no para certificar el binario final.

### Recomendación

No se recomienda ningún upgrade mayor ni override adicional en este bloque. La
línea SDK 57/RN 0.86 está coherente y las alertas restantes documentadas por
`npm audit` requieren una actualización coordinada de Expo, Router, React
Native/Reanimated/Worklets y, posteriormente, NativeWind/Tailwind. No debe
ejecutarse `npm audit fix --force`.

La mejora incremental segura pendiente es de higiene: confirmar en una tarea
separada si `react-native-agora` debe eliminarse del `package.json` y lockfile,
porque hoy no tiene consumidor en la app. No se elimina durante esta auditoría
para no alterar el alcance funcional de llamadas sin una decisión explícita.

La ejecución online de `npm audit` y `npx expo-doctor` no fue posible en este
entorno porque el DNS no pudo resolver `registry.npmjs.org`; no se interpreta
esa limitación como una ausencia de vulnerabilidades nuevas.
