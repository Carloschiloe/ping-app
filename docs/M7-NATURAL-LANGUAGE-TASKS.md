# Ping — M-7: Comprensión natural estructural

Estado: en curso; no se declara cerrado mientras existan pruebas pendientes.
Rama: `codex/staging-beta`  
Fecha de corte: 2026-09-22  
Alcance: comprensión semántica general, continuidad conversacional y entrada pública única de Ping. No se modifica producción.

## Criterio de cierre

M-7 sólo puede marcarse completo cuando exista una frontera semántica centralizada, contexto multivuelta verificable, confirmación/autorización para acciones sensibles, generalización real con al menos 100 casos, integración privada disponible y prueba física de voz en tablet. Un JSON válido o una coincidencia de frases no constituye éxito.

## Reglas de evidencia

- `[x]` significa evidencia reproducible en código, pruebas o entorno documentado.
- Las pruebas con mocks se distinguen de las pruebas con proveedor real.
- No se agregan listas crecientes de frases, sinónimos ni excepciones como solución principal.
- La IA propone; Core valida identidad, permisos, entidades, fechas, confirmación y ejecución.

## 1. Preparación y baseline

- [x] Trabajar sobre `codex/staging-beta` preservando cambios locales. Evidencia: rama activa comprobada; el árbol estaba sucio y no se ejecutó reset, checkout destructivo ni limpieza.
- [x] Leer la documentación canónica 00, 01, 03, 04, 05, 07, 08, 19, 20 y 21. Evidencia: lectura registrada durante la sesión.
- [x] Distinguir código canónico, adaptadores temporales y legacy. Evidencia: `agentTurnCore`/planner/Core y `AgentPreviewScreen` son la ruta actual; `PingAIScreen` y `PingAIClassic` se conservaron como legacy.
- [x] Mantener este archivo con diagnóstico, archivos, pruebas y resultados. Evidencia: registro actualizado en este corte.

## 2. Diagnóstico reproducible

- [x] Revisar `agentTurnCore`, `agentPlanOrchestrator`, `agentInputInterpreter`, `agentObjectiveInterpreter`, `agentContextBuilder` y `agentDialogueContinuation`.
- [x] Reproducir el gate determinista previo al modelo. Evidencia: `backend/tests/m7RoutingReproduction.test.ts`.
- [x] Reproducir escrituras nuevas que no llegaban al planificador. Evidencia: casos de anotación/registro producían señal determinista falsa, objetivo `unsupported` y `routedToPlanner=false`.
- [x] Reproducir el catálogo desalineado entre tipos, esquema, prompt y herramientas. Evidencia: `remember_fact` y `cancel_existing_commitment` diferían antes de la alineación.
- [x] Reproducir sobrescrituras semánticas. Evidencia: W08, W52 y D14 fallaron en la batería real inicial; se corrigieron en la frontera semántica y se repitieron.
- [x] Reproducir pérdida de referencias, correcciones, negaciones y cambios de intención. Evidencia: suites de continuidad HTTP, aclaración de entidad y corrección de fecha pasan.
- [x] Separar defectos confirmados de hipótesis. Evidencia: los defectos confirmados están descritos como diagnóstico previo y su estado actual queda en la sección 7.

## 3. Arquitectura de comprensión natural

- [x] Centralizar ruta, interpretación, objetivo, entidades, temporalidad e incertidumbre en `interpretAgentSemanticTurn`.
- [x] Mantener el principio LLM propone/Core valida. Evidencia: planner verifica hints verbatim, resuelve entidades autorizadas y conserva confirmación.
- [x] Evitar que frases conocidas sean dueñas del recorrido. Evidencia: el modelo interpreta primero; deterministas sólo actúan como fallback o veto estructural de seguridad.
- [x] Permitir expresiones inéditas en la interpretación general. Evidencia: batería real de 110 casos y batería ciega independiente.
- [x] Alinear capacidades, esquema LLM, herramientas y planner. Evidencia: `AGENT_OBJECTIVE_TYPE_VALUES` es compartido e incluye `remember_fact` y `cancel_existing_commitment`.
- [x] Unificar READ, WRITE y diálogo. Evidencia: Core pasa la misma interpretación a `buildAgentContext`; planner reutiliza compromisos precargados.
- [x] Conservar contexto, referencias implícitas, correcciones, negaciones y cambios de intención. Evidencia: suites de diálogo pasan.
- [x] Mantener idempotencia, procedencia, autorización y veracidad. Evidencia: regresión backend y suites de autorización/ejecución pasan; no se tocaron writers canónicos ni producción.

## 4. Generalización y regresión

- [x] Definir antes de ejecutar al menos 100 expresiones y casos multivuelta. Evidencia: fixture de 110 casos con expectativas de ruta/objetivo.
- [x] Cubrir espontaneidad, coloquialismos chilenos, transcripción imperfecta, paráfrasis, correcciones, referencias, negaciones y ambigüedad. Evidencia: categorías del fixture y suites de diálogo.
- [x] Incluir expresiones inéditas. Evidencia: más de 50 casos `novel`; batería real 110/110 PASS.
- [x] Verificar comprensión, enrutamiento, planificación y ejecución por separado. Evidencia: arquitectura 4/4 PASS; planner/autorización/ejecución 143/143 PASS.
- [x] Ejecutar regresión backend y mobile. Evidencia: backend 126 archivos, 2187 PASS, 2 skips opt-in documentados; build TypeScript PASS; mobile 108/108 PASS.
- [x] Ejecutar proveedor real y separar mocks. Evidencia: `M7_REAL_LLM=1`, 110/110 PASS en 78.2 s; dobles quedan en suites unitarias separadas.
- [x] Corregir fallos por causa raíz y repetir. Evidencia: lifecycle, temporalidad, negación, contexto de escritura y catálogo fueron corregidos y reprobados.
- [x] No declarar PASS para pruebas fallidas/omitidas. Evidencia: la suite privada queda separada y pendiente por falta de variable autorizada.

## 5. Acceso único a Ping

- [x] Auditar las cuatro opciones del menú ✨ y sus rutas. Evidencia: la entrada pública expone sólo Ping; Preview, tablet y legacy quedan en menú de desarrollo.
- [x] Confirmar que Core y Preview comparten implementación/backend. Evidencia: `AgentPreviewScreen`, `useAgentTurn` y `/agent/turn` compartidos.
- [x] Verificar que tablet usa el mismo Core con contexto/capacidades de superficie. Evidencia: adapter pasa `surface: tablet` al mismo Core.
- [x] Diseñar una entrada pública única llamada Ping, sin selección de cerebros/modalidades. Evidencia: label y tap públicos son Ping; selección interna sólo bajo `__DEV__`.
- [x] Mover Preview, tablet y legacy al acceso interno de desarrollo sin borrar legacy.
- [x] No duplicar agente, modelo, memoria ni lógica por dispositivo. Evidencia: adapter mobile centraliza superficie y endpoint.
- [x] No eliminar legacy antes de comprobar dependencias. Evidencia: `PingAIClassic`/`PingAIScreen` se conservaron y sus rutas fueron revisadas.
- [ ] Verificar navegación, texto, voz y ausencia de regresiones en mobile y tablet. Evidencia parcial: el recorrido público ahora calcula la superficie del dispositivo; mobile 108/108 y regresiones del adaptador 108/108 PASS; falta prueba física de voz en tablet.
- [x] No modificar producción. Evidencia: no hubo deploy, push, migración remota, cambio de credenciales ni cambio de infraestructura.

## 6. Integración privada de staging

- [ ] Completar la validación de integración privada en staging. `PING_M7_DATABASE_URL` debe existir en Render y validarse mediante el diagnóstico de arranque `PING_M7_PRIVATE_DB_CHECK=PASS`; `agentTurnRoutingSelection.integration.test.ts` es una prueba separada que usa las credenciales Supabase de staging y no demuestra por sí sola la conexión privada. Estado: BLOQUEADA; no está en el proceso local ni en `backend/.env`, y el navegador autenticado de Render no está disponible en esta sesión. No se inventó una URL ni se modificaron credenciales o producción.

## 7. Evidencia ejecutada en el corte

### Precisión del procedimiento de integración privada

`agentTurnRoutingSelection.integration.test.ts` usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` mediante `supabaseAdmin`; no valida por sí sola `PING_M7_DATABASE_URL`. La conexión privada de admisión se comprueba en staging mediante `PING_M7_PRIVATE_DB_CHECK=true`, el arranque del backend y el diagnóstico no sensible `PING_M7_PRIVATE_DB_CHECK=PASS` en los logs de Render. El script PostgreSQL `test-agent-turn-admission-postgres.mjs` está restringido deliberadamente a `localhost` y no debe apuntarse a Render. Por tanto, ninguna de estas verificaciones permite copiar secretos ni confundir la base privada con la API Supabase.

Procedimiento mínimo: comprobar en Render la existencia de `PING_M7_DATABASE_URL` sin revelar su valor; verificar `/api/health`; reiniciar sólo `ping-backend-staging` siguiendo el flujo autorizado; confirmar en logs el resultado `PING_M7_PRIVATE_DB_CHECK=PASS`; y, únicamente si se requiere la prueba de routing, ejecutar el test de routing con credenciales de staging inyectadas de forma efímera y sin escribirlas en archivos. Si la variable o el permiso no están disponibles, la integración permanece pendiente.

| Fecha | Prueba | Resultado verificable |
|---|---|---|
| 2026-09-22 | Arquitectura semántica | 4/4 PASS |
| 2026-09-22 | Continuidad HTTP/pending clarification | 30/30 PASS |
| 2026-09-22 | Aclaración de entidad | 6/6 PASS |
| 2026-09-22 | Batería real general | 110/110 PASS, 78.2 s, `M7_REAL_LLM=1` |
| 2026-09-22 | Batería ciega inicial | 20/22 PASS; B02 mostró ambigüedad de subtipo y B13 reveló falta de `dijimos` en la familia de recall |
| 2026-09-22 | Corrección y batería ciega repetida | 22/22 PASS, proveedor real, 23.5 s |
| 2026-09-22 | B02 hasta planificador | 1/1 PASS con proveedor real: WRITE → `ready_for_authorization`, objetivo `create_commitment_or_proposal`, 1 paso `create_commitment`, `responsiblePersonId: null`, confirmación `explicit`; no se autorizó ni ejecutó |
| 2026-09-22 | Entrada pública/tablet | Se corrigió el defecto confirmado: `PingAI` omitía la superficie y caía en `mobile_text`; `publicPingSurface()` usa el tipo de dispositivo y conserva `tablet` en el adaptador. Regresión móvil 108/108 PASS; sin evidencia física todavía |
| 2026-09-22 | Regresión backend | 126 archivos, 2187 PASS, 2 skips opt-in; integración privada excluida por variable ausente; build `tsc` PASS |
| 2026-09-22 | Regresión backend sin red | 11 pruebas con Supabase fallaron por `fetch failed`/`AuthRetryableFetchError`; se repitió con acceso autorizado de staging y no reprodujo fallos |
| 2026-09-22 | Regresión mobile | 108/108 PASS |
| 2026-09-22 | Integración privada | No ejecutada: `PING_M7_DATABASE_URL` ausente |

La batería ciega quedó definida después del congelamiento de implementación y no reutiliza el fixture general. Incluye equivalencias y contrastes consulta/creación, rechazo/cancelación y negación/confirmación, además de expresiones inéditas y coloquialismos. Está en `backend/tests/m7NaturalLanguageBlind.test.ts`.

## 8. Diagnóstico y correcciones verificadas

El diagnóstico inicial confirmó tres causas: gate determinista previo al LLM, catálogo semántico desalineado y contexto/rutas duplicadas. La solución actual centraliza la interpretación, comparte el catálogo, construye contexto una vez, reutiliza evidencia canónica y conserva controles de autorización/confirmación.

Corrección posterior a la batería ciega: la familia estructural de consultas históricas reconocía `dijiste`, `dijo` y `dijeron`, pero no `dijimos`. Se incorporó esa forma morfológica general en `RECALL_KEYWORDS`; no se añadió una frase completa ni un caso especial. La repetición real pasó 22/22.

El caso B02 (“Déjame agendado…”) llegó correctamente a WRITE, pero su subtipo puede ser personal o compartido sin contexto adicional. La prueba ciega exige sólo el recorrido WRITE para no inventar una identidad de participante ni convertir una ambigüedad legítima en una falsa certeza.

La prueba `m7B02PlannerOutcome.test.ts` no se contabiliza como una segunda batería: es la verificación operativa del mismo B02 hasta el planificador. Confirmó `ready_for_authorization`, una sola operación de creación propuesta, participante nulo y confirmación explícita; el plan no fue autorizado ni ejecutado.

## 9. Protocolo pendiente: voz física en tablet

### Control de versión obligatorio

La prueba física sólo es válida si se identifica el artefacto exacto antes de iniciar:

- Mobile local: `mobile/app.json` y `mobile/package.json` declaran `1.0.0`.
- Backend local: `backend/package.json` declara `1.0.0`.
- Checkout M-7 aislado de este corte: `codex/m7-staging-prep-20260922`, base `1b309b0`; no se hizo push ni deploy durante esta corrección.
- Backend remoto: debe responder `/api/health` con `ok`, `db_status` conectado, marcador de staging y el commit exacto que se probará. En este corte la consulta remota agotó tiempo de espera; la versión desplegada no está verificada.
- Expo Go debe iniciarse desde este checkout exacto, o desde un checkout cuyo SHA y cambios coincidan con el backend verificado. No se acepta una sesión Expo caducada ni una URL de Metro de versión desconocida.

### Intervención humana requerida

1. En Render, abrir exclusivamente el servicio `ping-backend-staging` y verificar la existencia de `PING_M7_DATABASE_URL` sin copiar, revelar ni registrar su valor.
2. Si falta, configurarla únicamente con la conexión autorizada de la base staging (Session Pooler Supabase con TLS verificado); nunca usar producción.
3. Reiniciar/verificar staging según el flujo normal de Render y consultar `/api/health`. Registrar sólo estado, marcador y commit, nunca la URL ni otros secretos.
4. Iniciar la app desde la misma versión verificada y ejecutar los pasos siguientes. Hasta completar estos controles, la integración privada y la prueba física permanecen bloqueadas.

Esta prueba no se simula ni se marca como PASS hasta contar con evidencia física real.

1. Iniciar la app Ping en la tablet piloto y comprobar que entra por la única superficie pública `Ping`.
2. Pulsar el micrófono y dictar: “Recuérdame verificar el audio mañana a las doce”.
3. Verificar en pantalla la transcripción exacta antes de enviarla; registrar captura/video de la transcripción y del trace de dispositivo.
4. Hacer una corrección oral: “No, corrige: a las once”. Verificar que el plan conserve la tarea y cambie la hora, sin mantener la hora anterior.
5. Hacer una referencia al turno anterior: “Como en el turno anterior, mantén verificar el audio, pero déjalo para las once”. Verificar continuidad del mismo objetivo, sin crear un segundo objetivo por confusión.
6. Obtener el plan: debe mostrar el compromiso correcto, fecha/hora corregida y confirmación explícita requerida.
7. Confirmar oralmente (“sí, créalo”) y verificar en Compromisos una sola creación, con título y hora correctos.
8. Registrar resultado PASS/FAIL, transcriptos, plan, confirmación y evidencia visual. Si falla, reproducir desde el origen y no añadir una frase hardcodeada.

## 10. Estado final verificable

- Casillas del corte anterior: 35/37 completadas = **94.6%**. La incidencia de continuidad añadida en la sección 12 deja el corte actual en 41/44 = **93.2%**, porque incorpora una nueva validación física pendiente.
- M-7: **no cerrado**.
- Pendientes reales: integración privada con variable autorizada, prueba física de voz en tablet y validación física de continuidad en iPhone sobre el backend corregido.
- Producción: intacta; no hubo push, deploy, migración remota ni cambio de credenciales.
- Commit base de trabajo: `1b309b0` (`fix(m7): preserve conversational commitment referents`). La corrección de esta sección se prepara en un checkout aislado y no se ha publicado.
- Cambios locales previos: preservados y no mezclados con producción.

## 11. Archivos M-7 agregados o afectados

Implementación principal: `backend/src/services/agentSemanticInterpreter.service.ts`, `backend/src/services/agentInputInterpreter.service.ts`, `backend/src/services/agentTurnCore.service.ts`, `backend/src/services/agentContextBuilder.service.ts`, `backend/src/services/agentPlanOrchestrator.service.ts`, `backend/src/services/agentPlanner.service.ts`, tipos/esquemas de objetivo y continuidad.

Pruebas M-7: `backend/tests/m7RoutingReproduction.test.ts`, `backend/tests/m7SemanticArchitecture.test.ts`, `backend/tests/m7NaturalLanguageGeneralization.real.test.ts`, `backend/tests/m7NaturalLanguageBlind.test.ts`, `backend/tests/m7B02PlannerOutcome.test.ts`, fixture `backend/tests/fixtures/m7NaturalLanguageCases.ts` y suites de diálogo/UX modificadas.

Acceso unificado: `mobile/src/api/agentSurfaceAdapter.ts`, `mobile/src/api/query-modules/agent.ts`, `mobile/src/navigation/index.tsx`, `mobile/src/navigation/types.ts`, `mobile/src/screens/ConversationsScreen.tsx`, `mobile/src/screens/AgentPreviewScreen.tsx` y pruebas mobile relacionadas.

Este inventario no atribuye a M-7 todos los cambios del árbol: el repositorio ya contenía modificaciones locales anteriores, que fueron conservadas.

## 12. Incidencia: continuidad de preguntas breves en texto y voz (2026-09-22)

- [x] Reproducir la secuencia real con el mismo `conversationId`: una lectura de mañana seguida por la transcripción de voz «¿Y a qué hora?». Evidencia: `backend/tests/agentReadFollowup.regression.test.ts`, 3/3 PASS.
- [x] Trazar interpretación, estado, ruta, entidad y recuperación. Causa confirmada: `agentTurnCore` conservaba `lastReadContext` para `buildAgentContext`, pero no lo entregaba a `interpretAgentSemanticTurn`; el segundo turno llegaba al intérprete sin contexto y caía en aclaración.
- [x] Comparar texto y voz. Evidencia: ambos usan el mismo límite semántico y el mismo `conversationId`; la regresión verifica dos invocaciones con el mismo resumen estructural y sin exponer IDs/títulos al intérprete.
- [x] Corregir la causa raíz sin frases especiales: Core deriva un resumen estructural acotado del resultado previo; el intérprete LLM resuelve continuaciones elípticas y Core vuelve a autorizar el ID canónico antes de recuperar.
- [x] Generalizar atributos y controles: hora, fecha, responsable, estado y detalle reutilizan un único referente; múltiples referentes producen aclaración y un tema explícito abandona el contexto anterior. Evidencia: `backend/tests/m7CommitmentReadRegression.test.ts`, 24/24 PASS.
- [x] Ejecutar regresiones afectadas. Resultado: `m7CommitmentReadRegression.test.ts` 24/24 PASS, `agentReadFollowup.regression.test.ts` 3/3 PASS y TypeScript `tsc --noEmit` PASS. Los modelos fueron dobles controlados; no se simuló proveedor real ni dispositivo físico.
- [ ] Repetir la pregunta en el iPhone contra el backend corregido y comprobar la respuesta visible «Mañana a las 11:00». Pendiente: requiere publicar/desplegar el commit en staging y ejecutar la prueba física; no se marca PASS por una simulación.
