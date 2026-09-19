# Ping — instrucciones permanentes para agentes de desarrollo

## Objetivo de producto (North Star)
Ping debe evolucionar hacia un asistente horizontal y conversacional tipo Jarvis: lenguaje y voz naturales, contexto entre turnos, referencias implícitas y correcciones, memoria útil, interrupciones de voz, iniciativa controlada y ejecución de herramientas segura. La promesa incluye recordar compromisos y actuar solo con consentimiento y trazabilidad. **No confundir Core/CI verde con la visión de producto terminada.** Prioridad actual: M-7 Natural Conversational Intelligence, no tareas cosméticas de release.

## Reglas de arquitectura
- El LLM interpreta y propone; el Core valida, autoriza, decide y ejecuta. Nunca convertir texto del modelo en permiso de ejecución.
- Preservar identidad del actor, autorización, aislamiento de datos, consentimiento, idempotencia, transiciones válidas, procedencia y veracidad del resultado. No narrar una acción como realizada sin resultado verificado.
- Mantener separación entre Ping y otros proyectos. No reescribir áreas sanas ni expandir el alcance para hacer auditorías generales.

## Proceso por tarea (minimizar contexto, tiempo y costo)
1. Leer esta guía y el objetivo concreto. Consultar `docs/AGENT_TASK_ROUTER.md`; leer solo la sección relevante de `docs/AGENT_INDEX.md`, archivos y pruebas asociados. `docs/00-VISION-PING.md` y los documentos de dominio contienen contexto, pero el estado real se comprueba en código y pruebas; pueden estar desactualizados.
2. Clasificar: ¿afecta un invariante del Core o la visión conversacional M-7? Si no, justificar por qué es imprescindible antes de trabajar. Confirmar defecto con evidencia o acordar comportamiento verificable, evitando hallazgos especulativos.
3. Una tarea pequeña = una rama desde `codex/staging-beta` y un PR con base `codex/staging-beta`. Cambios mínimos; no tocar archivos ajenos. Reproducir con test que falle cuando sea posible, corregir, ejecutar test focalizado y CI completa.
4. PR: describir problema, causa, archivos modificados, comandos/resultados reales, riesgos, pruebas pendientes y siguiente paso. Máximo dos intentos de corrección automáticos por fallo; después dejar evidencia y detenerse, sin bucles de consumo.
5. CI PASS solo demuestra build/lint/tests configurados en GitHub. Render, TLS privado, Supabase, despliegue y pruebas físicas de iPhone requieren evidencia propia. Nunca inventar PASS, datos ni estados. No pedir al usuario pruebas físicas hasta agotar verificaciones disponibles por código o entorno accesible.
6. Antes de proponer release, contrastar explícitamente avances frente a la visión completa: continuidad multi-turno, referencias/correcciones, memoria, voz/interrupciones, iniciativa y uso seguro de herramientas. Documentar brechas, no declarar Ping terminado por pasar tests.

## Límites operacionales obligatorios
- No modificar, fusionar ni enviar cambios a `main` o producción, ni desplegar producción. No cambiar credenciales, secretos, permisos, políticas, variables de entorno ni configuración de Render/Supabase sin autorización explícita para esa tarea.
- No desplegar staging por defecto. Trabajar en PR; integrar solo con pruebas verificadas y revisión. Mantener cualquier despliegue de staging como acción independiente y justificada.
- No hacer `git add .`, `git push origin main`, force-push, cambios destructivos, migraciones de datos reales ni activar automatizaciones de negocio por conveniencia.
- No mostrar claves, URL con credenciales o información privada en logs, PR, ejemplos o instrucciones. Este repositorio figura público; tratar todos los commits y comentarios como públicos hasta que se verifique otra visibilidad.

## Comprobaciones habituales sin servicios externos ni secretos
- Backend: `cd backend && npm ci && npm run build && npm test`.
- Móvil: `cd mobile && npm ci && npx tsc --noEmit && npm run lint && npm test`.
- GitHub Actions `.github/workflows/ci.yml` ejecuta esas comprobaciones; pruebas Postgres/Render/iPhone son gates separados, nunca sustituibles con mocks.

## Referencias para continuar sin redescubrir
`docs/AGENT_TASK_ROUTER.md`, `docs/AGENT_INDEX.md`, `docs/PING-M7-READ-EXECUTION-CAPABILITY-MATRIX.md`, `docs/00-VISION-PING.md`, `docs/23-STAGING-BETA-VALIDATION.md` y `.agents/workflows/deploy.md` (flujo seguro: no despliegue automático).
