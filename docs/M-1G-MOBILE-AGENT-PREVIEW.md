# Mobile Agent Preview (M-1G)

Conecta el nuevo Ping Agent read-only (`POST /api/agent/respond`, M-1F/M-1F.1/M-1D.4) a una pantalla de prueba dentro de la app móvil, sin reemplazar `PingAIScreen` (legacy, `/ai/ask`) ni tocar backend. Preview interna — no es una migración de producto.

## Auditoría mobile

Revisado antes de implementar: `PingAIScreen.tsx` (patrón base de bubbles/header/keyboard/loading), `navigation/index.tsx` + `types.ts` (registro de rutas en `ConversationsStackNav`), `api/client.ts` (`apiClient.post` ya maneja auth vía Supabase session + `ApiError{message,status,resultUnknown}`), `api/query-modules/legacy-ai.ts` (convención de hooks `useMutation`/`useQuery`), `theme/ThemeContext.tsx` + `theme/theme.ts` (dark mode ya soportado con tokens completos, incluyendo `bubbleMe`/`bubbleThem`), `utils/chatKeyboard.ts` (helper compartido de keyboard avoidance, reutilizado tal cual), `utils/timeZone.ts` (`getDeviceTimeZone()` ya existente, reutilizado), `expo-localization` (ya es dependencia, no se agregó ninguna nueva). `vitest.config.ts` confirma explícitamente que este repo sólo testea lógica pura de `src/utils`/`src/api`, nunca renderiza componentes React Native — el plan de tests se diseñó en consecuencia.

## Navigation

Nueva ruta `AgentPreview: { conversationId?: string } | undefined` agregada a `ConversationsStackParamList` (mismo stack que `PingAI`, `Chat`, etc). Registrada en `navigation/index.tsx` con `headerShown: false` (la pantalla dibuja su propio header, igual que `PingAIScreen`). `AgentPreviewScreenProps` exportado desde `types.ts` para tipado fuerte de `navigation`/`route`.

## Screen

`mobile/src/screens/AgentPreviewScreen.tsx` — pantalla nueva, independiente de `PingAIScreen`. Título visible: **"Nuevo Agent"** (subtítulo: "Preview interna · read-only") — nunca menciona el proveedor. Reutiliza el patrón visual de `PingAIScreen` (header oscuro, bubbles, `KeyboardAvoidingView` + `FlatList`) pero consume el theme real (`useAppTheme()`) para soporte de dark mode completo, a diferencia del legacy que usa colores fijos.

## API hook

`mobile/src/api/query-modules/agent.ts` — `useAgentRespond()` (`useMutation`), completamente separado de `legacy-ai.ts` (nunca lo importa, nunca toca `ai_messages`). Incluye: `buildAgentRequestBody`, `parseAgentResponse` (validación defensiva del shape), `mapAgentErrorMessage` (copy seguro por status HTTP), `getDeviceLocale`. Registrado en `query-modules/index.ts`.

## Request contract

```ts
{ input, channel: "mobile", timezone: "<real del dispositivo>", locale: "<real del dispositivo>", conversationId?: "<sólo si se pasó>" }
```

`actorUserId` nunca se envía — no existe ese campo en el body en ningún punto del código; el backend lo obtiene de `requireAuth`. Verificado con test explícito (`buildAgentRequestBody` nunca produce `userId`/`actorUserId`, sea cual sea el input).

## Timezone/locale

`getDeviceTimeZone()` (ya existente, `utils/timeZone.ts`, vía `Intl.DateTimeFormat().resolvedOptions().timeZone`) y `getDeviceLocale()` (nuevo, vía `expo-localization`'s `getLocales()[0].languageTag`, con fallback a `'en-US'` si el módulo no está disponible — nunca español fijo). Ninguno hardcodea Chile.

## Chat history local

`AgentChatMessage[]` vive únicamente en `useState` de la pantalla (`mobile/src/utils/agentChat.ts`) — nunca persiste en DB, nunca usa `ai_messages`. Se pierde al cerrar la pantalla, documentado como comportamiento esperado de este slice (sección 6/23 del ticket).

## Status rendering

Los 4 estados (`answered`/`needs_clarification`/`no_evidence`/`capability_gap`) siempre muestran `answer` en lenguaje natural — nunca el string técnico del status. `no_evidence`/`capability_gap` se renderizan igual que `answered` (una bubble normal del Agent) porque su `answer` ya es la explicación natural; no hay UI condicional por status más allá de las opciones de `followUp`.

## Clarification

Si `followUp.options` existe, se renderizan como chips pequeños. Al tocar uno: **no se envía ningún ID oculto** — el chip sólo pre-llena el campo de texto con el `label` de esa opción, y el usuario decide si lo envía o lo edita (sección 13 del ticket: "no inventar protocolo nuevo... dejar que el usuario responda con texto"). Esto es deliberadamente simple porque el contrato público de `/agent/respond` no soporta hoy un "siguiente turno" con selección de candidato por ID.

## Citations

Nunca se muestra un `sourceId` crudo en ningún punto de la UI (verificado con test explícito sobre IDs tipo UUID). Debajo de la respuesta: texto discreto "N fuente(s)" (nunca "0 fuentes" — si no hay citations, no se muestra nada). Tap abre un `Modal` simple listando sólo las ETIQUETAS de tipo (Compromiso/Mensaje/Audio/Documento/Persona), nunca IDs ni navegación a contenido real — el endpoint público sólo da refs básicas, así que no se implementó navegación.

## Loading

"Pensando…" mientras `isPending`. Nunca menciona OpenAI/retrieval/LLM.

## Cold start

Si la request supera 10s, el copy cambia a "Sigo buscando…" sin cancelar nada (`setTimeout` limpiado en éxito/error/desmontaje). El timeout real lo determina el backend/red — la pantalla no impone un timeout corto propio.

## Errors

Mapeo determinístico por status HTTP (`mapAgentErrorMessage`, certificado con tests): 401 → sesión expirada, 403 → sin acceso a ese contexto, 429 → demasiadas consultas, 500/otros → genérico. Un `TypeError` (falla real de `fetch`) → "No hay conexión con Ping." Nunca se expone stack, "OpenAI", "Render", "Supabase" ni JSON crudo — verificado con un test que fuerza un mensaje de error conteniendo "OpenAI"/"gpt-4o-mini" y confirma que el copy final no lo repite.

## Retry

Cada mensaje de error guarda su `retryInput` exacto. El botón "Reintentar" reenvía ESE input una sola vez por tap — sin loop automático, sin reintento silencioso.

## Read-only guarantee

La pantalla nunca llama a ninguna ruta de escritura: `agent.ts` sólo hace `POST /agent/respond` (auditado con un test que falla si aparece `apiClient.delete`/`apiClient.patch` o una ruta de `/commitments`/`/messages`/`/conversations` en el archivo). No hay botones de acción, no hay confirmación de compromisos, no hay envío de mensajes reales — sólo lectura/consulta.

## Legacy coexistence

`PingAIScreen`, `/ai/ask`, `ai_messages`, `legacy-ai.ts` — sin tocar. Acceso a la nueva pantalla es discreto: el botón ✨ existente en `ConversationsScreen` sigue abriendo Ping AI legacy con un tap normal (sin cambios); un **long-press** en el mismo botón abre un `ActionSheetIOS`/`Alert` (mismo patrón ya usado para "Nuevo chat/Nuevo grupo") ofreciendo "Ping AI (actual)" o "Nuevo Agent (preview)" — sin agregar un ícono permanente nuevo al header, sin sobrecargar la UI principal.

## Tests

31 tests nuevos en `mobile/tests/agentPreview.test.ts` (pura lógica, sin renderer — consistente con `vitest.config.ts`): contrato de request (channel/timezone/locale/conversationId opcional, nunca userId/actorUserId), validación de response (shape mínimo exacto, nunca depende de claims/diagnostics, followUp con opciones, rechazo de shape inválido sin crash, filtrado de citations mal formadas), mapeo de errores (401/403/429/500/red/genérico, nunca fuga de proveedor), lógica de chat local (append user/agent/error, retry input conservado, `canSendInput` cubre vacío/espacios/double-send), citations (resumen singular/plural, nunca "0 fuentes", tipos sin exponer IDs), starters sugeridos, integración con `apiClient` mockeado (body exacto, propagación de los 3 status no-error), auditoría estática (nunca importa legacy-ai/sus hooks, nunca llama rutas de escritura, nunca menciona el proveedor en código).

`tsc --noEmit`: limpio. `expo lint`: 0 errores, 16 warnings preexistentes en archivos no relacionados (verificado que ninguno de los archivos nuevos aparece). `git diff --check`: limpio. Suite completa (`npx vitest run`): 161 tests pasan incluyendo los 31 nuevos; 6 archivos preexistentes (`ux4b`/`ux5b`/otros) fallan con `describe is not defined` — **confirmado pre-existente y no relacionado**, reproducido idéntico con `git stash` (mis cambios completamente removidos). `conversationCompat.test.ts`: 6/6, sin regresión de tipos de navegación.

## Manual iPhone test plan

No ejecutado (requiere un iPhone físico/Expo Go que este entorno no puede operar). Plan preparado para ejecución manual del usuario:

| # | Caso | Qué verificar |
|---|------|----------------|
| A | Pregunta general | Respuesta natural, sin jerga técnica |
| B | "¿Qué pendientes tengo esta semana?" | `answered` con compromisos reales, citations discretas |
| C | Tema sin evidencia | `no_evidence`, mensaje honesto, sin inventar |
| D | Persona ambigua/no resuelta | `needs_clarification`, chips de opciones si existen, nunca elige sola |
| E | Modo avión / sin red | "No hay conexión con Ping.", botón Reintentar funcional |
| F | Cold start (backend inactivo) | ">10s" cambia copy a "Sigo buscando…", no se cuelga ni cancela |
| G | Teclado | Multilinea, no tapa el input, scroll se ajusta, safe-area inferior respetada |
| H | Scroll | Auto-scroll al último mensaje tras cada respuesta |
| I | Dark mode | Bubbles/fondo/texto siguen el theme del sistema, mismo criterio que el resto de la app |

## Files

- `mobile/src/screens/AgentPreviewScreen.tsx` (nuevo)
- `mobile/src/api/query-modules/agent.ts` (nuevo)
- `mobile/src/utils/agentChat.ts` (nuevo)
- `mobile/src/api/query-modules/index.ts` (modificado — registra `agent.ts`)
- `mobile/src/navigation/types.ts` (modificado — ruta `AgentPreview` + props type)
- `mobile/src/navigation/index.tsx` (modificado — registro de pantalla)
- `mobile/src/screens/ConversationsScreen.tsx` (modificado — long-press en ✨ para el menú Ping AI / Nuevo Agent)
- `mobile/tests/agentPreview.test.ts` (nuevo, 31 tests)
- `docs/M-1G-MOBILE-AGENT-PREVIEW.md` (este archivo)

Sin cambios en backend, sin tools, sin escrituras, sin `PingAIScreen`/`legacy-ai.ts`/`ai_messages`, sin producción.

## Risks

- El seguimiento de `needs_clarification` (elegir "la segunda Laura") no se resuelve automáticamente — M-1F no tiene working memory/session state; el chip sólo pre-llena texto, el usuario debe reformular. Documentado como limitación explícita del preview (sección 24 del ticket), no un bug.
- `AbortController` real no se implementó — extender `apiClient` para soportar cancelación tocaría un archivo compartido por TODA la app (riesgo de regresión fuera de alcance de un preview). En su lugar, un `isMountedRef` evita `setState` sobre una pantalla desmontada — cubre el riesgo práctico (crash/warning) sin request cancellation real. Documentado como decisión deliberada, no un descuido.
- El copy de error 500 es genérico por diseño (nunca detalle) — si el backend cambia sus códigos de error en el futuro, este mapeo debe revisarse.

## Staging

Mobile apunta a `EXPO_PUBLIC_API_URL` ya configurado hacia staging (sin cambios de configuración en este ticket). Backend no se tocó — endpoint ya certificado (`docs/M-1F-S`, `docs/M-1F.1-AGENT-FIDELITY-HARDENING.md`, `docs/M-1D1-LLM-INPUT-INTERPRETER.md`).

## Producción

No tocada.

## Recommendation

Aprobado local. Antes de considerar esto para más que una preview interna: decidir el protocolo real de "siguiente turno" para `needs_clarification` (si vale la pena) y evaluar si el guard de dominancia canónica (M-1F.1) más el hardening de status-hints (M-1D.4) ya dan suficiente confianza para exponerlo a un grupo piloto más amplio. Pendiente: prueba manual real en iPhone (plan arriba) antes de cualquier decisión de producto.

M-1G MOBILE AGENT PREVIEW APROBADO LOCAL — LISTO PARA IPHONE
