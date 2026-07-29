# Ping — Beta interna multiplataforma

Estado: preparación de validación física
Entorno: staging
Supabase: `oonijgmddgyymhrlnvuu`
Backend: `https://ping-backend-staging.onrender.com`

## Criterio de salida

La beta interna no se considera terminada hasta que el mismo flujo principal
haya sido instalado y comprobado en un dispositivo Android y en un iPhone.
Las pruebas remotas del backend son necesarias, pero no sustituyen la
validación de la aplicación en cada plataforma.

El recorrido mínimo en ambos dispositivos comprende:

1. apertura sin cierre inesperado;
2. autenticación contra staging;
3. self-chat;
4. envío de mensajes;
5. desconexión, reconexión e idempotencia;
6. propuesta sin creación automática de Commitment;
7. confirmación de la propuesta;
8. seguimiento sin resolución automática;
9. resolución con resultado comprensible;
10. lectura privada autorizada;
11. rechazo de acceso cruzado.

Los datos de prueba deben ser no sensibles, temporales y limpiarse al terminar.

## Aislamiento obligatorio

- La aplicación debe usar únicamente el backend staging y Supabase
  `oonijgmddgyymhrlnvuu`.
- Producción, `main`, Play Store y App Store quedan fuera de esta validación.
- `ENABLE_PRIVATE_FILE_READS=true` sólo en staging.
- `ENABLE_PRIVATE_FILE_UPLOADS=false`.
- Calendar, Calls, Operation, automatizaciones y cron permanecen cerrados.
- Una carga administrativa temporal puede utilizarse para comprobar lectura
  privada; no habilita la subida desde el producto.

## Android

El perfil `staging-apk` produce una aplicación interna con package
`com.carloschiloe.ping.staging`. El APK debe corresponder al commit aprobado
de `codex/staging-beta`.

Antes de instalar se comprueban estado del build, versión, tamaño y SHA-256.
Después de instalar se ejecuta el recorrido completo y se registra únicamente
el resultado de cada paso, sin credenciales, tokens, mensajes privados ni URLs
firmadas.

## iPhone

Expo Go no es la vía de aceptación de esta beta. Aunque el proyecto utiliza
Expo SDK 54, la aplicación depende de configuración nativa propia: identidad
separada de staging, permisos bloqueados y un artefacto reproducible. Expo Go
usa un binario nativo preconstruido y no representa esas propiedades.

El perfil `staging-ios` genera una distribución interna con bundle identifier
`com.carloschiloe.ping.staging`. Requiere una cuenta Apple Developer válida y
que el dispositivo de prueba quede incluido en el aprovisionamiento ad hoc.
Si la cuenta no permite distribución interna, TestFlight será la alternativa,
sin publicación pública en App Store.

Las credenciales Apple se administran mediante EAS y nunca se incorporan al
repositorio, archivos `.env`, comandos, logs ni documentación.

## Evidencia

Por plataforma se registra:

- modelo y versión del sistema operativo, sin identificadores del dispositivo;
- build ID, commit, versión y checksum del artefacto;
- resultado de cada paso del recorrido;
- errores observados y corrección aplicada;
- confirmación de limpieza de datos temporales.

Una comprobación se marca como pendiente si no fue ejecutada en el dispositivo.
No se infiere éxito a partir de una prueba de backend o de la otra plataforma.

## Reversión

Ante una regresión se retira o deja de distribuir el artefacto de staging y se
mantienen cerrados los feature gates. La reversión no requiere habilitar
producción, hacer público `chat-media`, activar subidas ni reutilizar URLs
firmadas.
