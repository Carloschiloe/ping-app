# ADR-024 — Archivos privados y adjuntos

- Estado: Propuesto
- Fecha: 2026-07-28
- Decisores: arquitectura y producto de Ping
- Documentos de origen: 09, 13, 17, 19, 20 y 21

## Contexto

Ping necesita preparar archivos privados sin repetir el modelo histórico de
persistir URLs públicas dentro de mensajes, perfiles o conversaciones.

En staging no existe el bucket `chat-media`, no hay objetos y tampoco existen
referencias históricas. Las subidas están deshabilitadas.

El documento 13 distingue:

- **File**: contenido identificable, con procedencia y ubicación;
- **Attachment**: relación que asocia ese File con un recurso propietario.

Una URL firmada es una credencial temporal de acceso. No representa al File ni
al Attachment y nunca debe persistirse.

## Decisión

1. `chat-media` se crea con `public = false` y nunca se vuelve público como
   mecanismo de compatibilidad o reversión.
2. La referencia persistente de un File se compone de:
   - `bucket`;
   - `object_path`.
3. No se guardan URLs públicas, URLs firmadas, tokens de subida ni parámetros
   de firma.
4. El backend valida autorización sobre el recurso propietario antes de
   generar una URL firmada de lectura o subida.
5. El cliente nunca selecciona una ruta arbitraria para lectura. Solicita
   acceso mediante tipo e identificador de recurso, y el backend obtiene
   `bucket + object_path` desde el recurso autorizado.
6. Para subida, el backend genera una ruta opaca después de autorizar:
   - adjunto de mensaje: participante de la conversación;
   - avatar de conversación: administrador de la conversación;
   - avatar de perfil: el propio usuario.
7. Las columnas de ubicación representan el File. Su presencia en Message,
   Profile o Conversation representa el Attachment con ese recurso.
8. Una subida pendiente aún no es un Attachment confirmado. No puede leerse a
   través de Ping hasta que un recurso autorizado persista la referencia.
9. Las lecturas y subidas usan gates independientes y no dependen del gate
   maestro de capacidades no-MVP. Esta excepción está limitada expresamente a
   `ENABLE_PRIVATE_FILE_READS` y `ENABLE_PRIVATE_FILE_UPLOADS`.
10. Los campos URL existentes se conservan temporalmente. La lectura futura
    priorizará `bucket + object_path` y sólo usará el campo legado mientras
    exista una compatibilidad aprobada.

## Contrato inicial

Referencias aditivas:

- `messages.media_bucket + messages.media_object_path`;
- `profiles.avatar_bucket + profiles.avatar_object_path`;
- `conversations.avatar_bucket + conversations.avatar_object_path`.

Restricciones:

- ambos componentes existen o ambos son nulos;
- el bucket inicial permitido es `chat-media`;
- `object_path` es relativo, no contiene esquema, query, fragmento ni
  segmentos `..`;
- la ruta no contiene nombres personales necesarios para la interfaz;
- una URL firmada sólo vive en memoria durante la operación.

Rutas iniciales:

- `conversations/<id>/attachments/<uuid>.<ext>`;
- `conversations/<id>/avatar/<uuid>.<ext>`;
- `profiles/<id>/avatar/<uuid>.<ext>`.

## Autorización y revocación

Cada solicitud de firma vuelve a comprobar autorización. Una revocación
impide emitir URLs nuevas.

Una URL ya emitida no puede revocarse individualmente con el mecanismo
seleccionado. El riesgo se limita con:

- TTL de 60 segundos para lectura;
- ausencia de persistencia;
- prohibición de almacenar o reutilizar la URL firmada;
- no inclusión en logs;
- rotación de la ruta o eliminación autorizada cuando sea imprescindible.

La revocación impide generar firmas posteriores, pero una URL emitida antes
de la revocación puede continuar funcionando hasta completar su TTL. El
cliente debe solicitar una firma nueva para cada operación de lectura y no
puede tratar una URL firmada como referencia estable del File.

El TTL de 60 segundos es la decisión para staging. Debe revisarse
explícitamente antes de habilitar la capacidad en producción, considerando la
experiencia de lectura, la exposición residual tras una revocación y la
imposibilidad de invalidar individualmente una URL ya emitida.

## Feature gates

- `ENABLE_PRIVATE_FILE_READS=false`;
- `ENABLE_PRIVATE_FILE_UPLOADS=false`;
- `ENABLE_NON_MVP_CAPABILITIES=false`.

Cada capacidad de archivos funciona únicamente con su gate específico. El
gate maestro continúa siendo obligatorio, junto con el indicador individual,
para Calendar, Calls y Operation. Mobile mantiene además la subida cerrada
aunque el backend se configure incorrectamente.

## Compatibilidad

No se eliminan ni renombran:

- `messages.media_url`;
- `profiles.avatar_url`;
- `conversations.avatar_url`.

La migración es exclusivamente aditiva. Staging no requiere backfill porque
las tablas están vacías.

## Reversión

La reversión funcional consiste en:

1. mantener ambos gates en `false`;
2. volver al código anterior;
3. conservar columnas y objetos para evitar pérdida;
4. no emitir firmas nuevas.

No se revierte haciendo público `chat-media`. Las columnas aditivas pueden
permanecer sin uso hasta una migración posterior expresamente aprobada.

## Consecuencias

Positivas:

- mínimo privilegio y autorización centralizada;
- referencias estables e independientes de proveedor;
- revocación aplicable a firmas futuras;
- transición sin eliminar campos existentes;
- no existe backfill histórico en staging.

Costos y riesgos:

- una URL emitida conserva vigencia hasta expirar;
- las subidas pendientes requieren futura limpieza controlada;
- la relación con Commitment queda fuera de esta primera preparación;
- la copia binaria de Storage requiere respaldo separado de PostgreSQL;
- habilitar la capacidad exige pruebas reales contra staging.

## Criterios para aceptar el ADR

- backup verificable previo;
- migración aditiva revisada;
- bucket privado y políticas reproducibles;
- pruebas de acceso permitido, cruzado, revocación, expiración e IDOR;
- ninguna URL firmada persistida;
- gates cerrados en código y despliegue;
- reversión probada sin publicar el bucket.
