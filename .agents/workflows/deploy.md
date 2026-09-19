---
description: Protocolo seguro para cambios de Ping en staging; producción fuera de alcance
---

# Flujo seguro de cambios — Ping

Esta guía sustituye la instrucción antigua de enviar automáticamente cualquier cambio a `main`. NO usar `git add .`, `git push origin main`, despliegues de producción ni `// turbo-all` como pasos obligatorios.

1. Leer `AGENTS.md` y consultar `docs/AGENT_TASK_ROUTER.md` para localizar exclusivamente el área implicada.
2. Partir de `codex/staging-beta` actualizado y crear una rama corta `fix/...` o `feat/...`. Mantener cada tarea y su diff acotados.
3. Reproducir el defecto o definir un criterio de aceptación verificable; modificar solo archivos relacionados.
4. Ejecutar las pruebas del área y dejar que la CI ejecute build, tests y verificaciones de backend/móvil en la solicitud de cambios.
5. Abrir PR con base `codex/staging-beta`, pruebas y evidencia. No fusionar si hay fallos o comprobaciones pendientes.
6. Solo después de revisión y CI realmente PASS, decidir la integración en staging. No asumir que un PASS de CI prueba Render, TLS privado o un iPhone físico.

**Límites no negociables:** no modificar ni desplegar producción, `main`, credenciales, secretos, permisos, infraestructura o configuración de Render/Supabase sin autorización explícita y tarea específica. No efectuar despliegue de staging como efecto secundario de documentación, tests o automatización. Nunca afirmar éxito sin evidencia real para el entorno evaluado.
