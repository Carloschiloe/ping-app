# Banco de reuniones

Pruebas para medir cómo Vorian convierte una llamada autorizada en resumen,
acuerdos y compromisos propuestos. Todo lo que hay aquí es inventado: no hay
personas ni grabaciones reales detrás.

| Archivo | Qué es | Cuesta dinero |
|---|---|---|
| `fixtures/meetingBench.ts` | 50 reuniones en español chileno con 64 compromisos de referencia (59 obligatorios y 5 a medias). Más 2 reuniones largas que juntan 25 cada una y 1 que junta las 50 | no |
| `support/meetingScorer.ts` | Corrector con reglas fijas, sin modelo: compromisos encontrados, inventados, responsable, fecha, condición, dependencia, decisiones, datos del resumen; para audio: errores por palabra, quién dijo qué y nombres o cifras perdidos | no |
| `meetingScorer.test.ts` | Prueba del corrector (no de un modelo): una respuesta copiada de las referencias saca 100 %, una vacía saca 0 %, y detecta trampas | no |
| `meetingPipeline.test.ts` | Recorrido completo con proveedores falsos: consentimiento, sin duplicados, respaldo, borrado del audio, tope de minutos | no |
| `meetingBench.real.test.ts` | Manda las 50 reuniones a modelos reales | sí, centavos |
| `meetingAudio.real.test.ts` | Crea audio con voces sintéticas y lo transcribe con cada proveedor | sí, centavos |

## Cómo correrlo

Desde `backend/`, con las claves en `backend/.env`:

```bash
set -a; . ./.env; set +a
env PING_ALLOW_LIVE_PROVIDER_TESTS=true MEETING_BENCH=1 \
  MEETING_MODELS="openai:gpt-6-luna@low,google:gemini-3.1-flash-lite" \
  MEETING_OUT=/ruta/resultados npx vitest run tests/meetingBench.real.test.ts
```

- `MEETING_LONG=25`: usa las reuniones largas (25 o 50 juntas).
- `MEETING_ONLY=m06,m38`: solo esas reuniones.
- Modelos: `proveedor:modelo@esfuerzo`, con proveedor `openai`, `google`,
  `openrouter`, `groq`, `deepseek` o `mistral`.

Audio (necesita ffmpeg):

```bash
env PING_ALLOW_LIVE_PROVIDER_TESTS=true MEETING_AUDIO_MAKE=1 MEETING_AUDIO_DIR=/ruta/audio npx vitest run tests/meetingAudio.real.test.ts
env PING_ALLOW_LIVE_PROVIDER_TESTS=true MEETING_AUDIO_DIR=/ruta/audio \
  MEETING_AUDIO_STT="openai:gpt-transcribe,google:gemini-3.1-flash-lite,deepgram:nova-3" \
  MEETING_AUDIO_ANALYZE="openai:gpt-6-luna@low" npx vitest run tests/meetingAudio.real.test.ts
```

Transcriptores: `openai:<modelo>`, `google:<modelo>`, `groq:whisper-large-v3-turbo`,
`mistral:<modelo>`, `deepgram:nova-3`, `assemblyai:universal-3-5-pro`, `elevenlabs:scribe_v2`.
Claves de cada uno: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`MISTRAL_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`.

## Límites conocidos

- Las voces son sintéticas y limpias: sirven para comparar, pero no reemplazan
  grabaciones reales con acento chileno, ruido e interrupciones de verdad.
- Las reuniones cortas son fáciles para los modelos actuales; la diferencia
  aparece en las reuniones largas.
- Dos referencias se ajustaron después de la primera prueba de 3 reuniones, por
  ser discutibles: en m44 el compromiso de Felipe pasó a ser «a medias», y una
  dependencia ya no exige marcarse además como condición. Después de eso las
  referencias quedaron fijas.
