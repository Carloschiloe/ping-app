# M7 — estado operativo autónomo

Fuente breve de verdad para continuar M7 sin usar el historial como diario.
Actualizar sólo con evidencia verificable.

```yaml
M7_CURRENT_STATE: GATE_IMPLEMENTED_NOT_PUBLISHED
M7_COMPLETE: NO
M7_ACTIVE_TASK: publicar el circuito CI de staging y configurar su único bloqueo externo
LAST_CERTIFIED_SHA: 6a564b293d51865f7c5fb300a4d1d30e9b3880bb
STAGING_REMOTE_SHA: 6a564b293d51865f7c5fb300a4d1d30e9b3880bb
STAGING_DEPLOYED_SHA: 8304ea0 # última versión staging confirmada; 6a aún no verificada desplegada
KNOWN_FAILURES: suite completa local no es gate fiable; contiene fallos heredados de entorno y suites externas
BLOCKERS: falta environment/secrets de GitHub Actions y Render deploy hook de staging
NEXT_ACTION: crear m7-staging-certification y sus secretos; después verificar el primer run del workflow
PRODUCTION_CHANGES: 0
MAIN_CHANGES: 0
LEGACY_REMOVED: 0
```

## Invariantes del ciclo

- Sólo `codex/staging-beta` activa este workflow.
- Sólo `ping-backend-staging` recibe el deploy hook.
- CI debe pasar antes del hook; health debe demostrar el SHA exacto antes de
  `/agent/turn`.
- El E2E usa una identidad de staging existente y una conversación temporal
  tombstoneada; no desactiva identidades ni escribe secretos en artefactos.
- `M7_COMPLETE` permanece `NO` hasta contar con evidencia real de health,
  autenticación, persistencia, reload y conversación en staging.
