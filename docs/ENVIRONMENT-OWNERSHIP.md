# Ownership de entornos y retiro de staging

Estado de referencia: 2026-10-18. Este documento evita inferir el entorno a partir
del nombre de una rama, un archivo histórico o un Blueprint que no esté conectado
al servicio real.

## Producción activa

| Recurso | Valor verificado |
|---|---|
| Servicio Render | `ping-app` |
| Service ID | `srv-d6ipqi75r7bs73fnbom0` |
| URL | `https://ping-app-con3.onrender.com` |
| Estado | Live; `/api/health` respondió `ok=true`, `db_status=connected` |
| Rama desplegada | `codex/agent-voice-continuity-hardening` |
| SHA live verificado | `3853828e8e1e4ba11cee06fd68ece794e024bff9` |

El servicio anterior es la producción real observada en Render. No se debe
deducir que `render.yaml` o el nombre histórico `ping-backend` representen
por sí solos el servicio productivo. Cualquier cambio de rama o despliegue en
`ping-app` requiere verificar SHA, salud HTTP, variables de entorno y
compatibilidad de migraciones.

## Staging antiguo

| Recurso | Valor verificado |
|---|---|
| Servicio Render | `ping-backend-staging` |
| Service ID | `srv-d9kllvqjobas73fqgrq0` |
| URL | `https://ping-backend-staging.onrender.com` |
| Rama | `codex/staging-beta` |
| Supabase | `Ping Staging V2`, ref `oonijgmddgyymhrlnvuu` |
| Estado | Suspendido; proyecto Supabase inactivo y último deploy nuevo cancelado |

Este entorno no debe restaurarse ni conectarse a producción. El proyecto
Supabase de staging contiene datos y artefactos de pruebas; antes de eliminarlo
se debe hacer un respaldo autorizado y comprobar que no haya usuarios,
dispositivos, builds o pruebas que todavía dependan de él.

## Dependencias de repositorio detectadas

El repositorio todavía contiene referencias intencionales a staging:

- `render.staging.yaml`;
- workflow `.github/workflows/ping-staging-certification.yml`;
- perfiles EAS `staging-*`;
- validadores y E2E que exigen el host de staging;
- documentación y scripts de certificación que exigen la rama y el project ref
  anteriores.

Por este motivo, el retiro seguro es un bloque de trabajo, no un borrado
aislado. Primero se debe decidir si se retiran también los perfiles EAS,
scripts, workflow y documentación de staging. Si se conservan, el servicio y
la base no pueden eliminarse sin dejar automatizaciones rotas.

## Regla operativa desde ahora

1. Producción es únicamente `ping-app`; nunca usar
   `ping-backend-staging` para validar producción.
2. `codex/staging-beta` no es una fuente de despliegue productivo.
3. No restaurar ni migrar el Supabase de staging para continuar la auditoría.
4. Antes de retirar recursos, eliminar o archivar sus referencias de código y
   CI, preservar la evidencia necesaria y verificar que el cliente production
   no apunte a ellas.
5. La eliminación final de Render, Supabase y la rama requiere una revisión
   inmediata de los nombres exactos y una confirmación en el momento de la
   operación.

## Próximo bloque

- preparar una PR de decommission que retire referencias staging que ya no
  tengan uso;
- ejecutar build, TypeScript y pruebas sin staging;
- comprobar que producción conserva su rama, URL, base y salud;
- sólo después, retirar los recursos cloud exactos que resulten huérfanos.

