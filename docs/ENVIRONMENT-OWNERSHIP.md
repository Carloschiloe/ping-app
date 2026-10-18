# Ownership de entornos y retiro de staging

Estado de referencia: 2026-10-18.

## Producción activa

| Recurso | Valor verificado |
|---|---|
| Servicio Render | `ping-app` |
| Service ID | `srv-d6ipqi75r7bs73fnbom0` |
| URL | `https://ping-app-con3.onrender.com` |
| Estado | Live; `/api/health` respondió `ok=true`, `db_status=connected` |
| Rama desplegada | `codex/agent-voice-continuity-hardening` |
| SHA live verificado | `3853828e8e1e4ba11cee06fd68ece794e024bff9` |

## Staging antiguo

| Recurso | Valor verificado |
|---|---|
| Servicio Render | `ping-backend-staging` |
| Service ID | `srv-d9kllvqjobas73fqgrq0` |
| URL | `https://ping-backend-staging.onrender.com` |
| Rama | `codex/staging-beta` |
| Supabase | `Ping Staging V2`, ref `oonijgmddgyymhrlnvuu` |
| Estado | Suspendido; proyecto Supabase inactivo; último deploy nuevo cancelado |

Staging no es necesario para producción y no debe restaurarse ni conectarse a
ella. La rama `codex/staging-beta` queda sólo un commit por delante de
`codex/phase1-containment` y la comparación no contiene diferencias de archivos;
no es una línea de producto independiente. Sus datos y artefactos sólo se
pueden eliminar después de revisar dependencias y conservar la evidencia
necesaria.

## Reglas operativas

1. Producción es únicamente `ping-app`.
2. `codex/staging-beta` no es fuente de despliegue productivo.
3. `render.staging.yaml` y el workflow de certificación staging quedan
   retirados; no se deben reutilizar para nuevos despliegues.
4. Los perfiles EAS y comandos remotos de staging se eliminan para impedir
   builds o actualizaciones accidentales contra el proyecto antiguo.
5. La eliminación final de Render, Supabase y la rama requiere revisar los
   nombres exactos, respaldo autorizado y confirmación inmediata en el momento
   de la operación.

