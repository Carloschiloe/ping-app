# Eliminar el proyecto Supabase "Ping Staging V2"

Decisión del owner (2026-10-30): Ping opera sólo en producción. Este runbook
elimina el proyecto staging retirado. La eliminación es **irreversible** y la
ejecuta el owner desde el panel de Supabase.

| Campo | Valor que debe coincidir |
|---|---|
| Nombre | `Ping Staging V2` |
| Project ref | `oonijgmddgyymhrlnvuu` |
| Organización | `ittyqubvpwfnsfjqmkkx` |
| Estado | `INACTIVE` (pausado) |

**No tocar** ningún otro proyecto. En especial producción `Ping`
(`wbigqhtuzfmpnxservlf`, organización `dokyecrnqdrhsuugqxjq`).

## Evidencia de que producción no depende de staging (2026-10-30)

- `GET https://ping-app-con3.onrender.com/api/health` responde `db_status:
  connected`, `agent_runtime: durable` y `agent_private_database_diagnostic.passed:
  true` mientras staging está `INACTIVE`. Un proyecto pausado rechaza
  conexiones, así que ni `SUPABASE_URL` ni `PING_M7_DATABASE_URL` de Render
  pueden apuntar a staging.
- El backend no arranca si `SUPABASE_URL` no coincide con
  `PING_EXPECTED_SUPABASE_PROJECT_REF=wbigqhtuzfmpnxservlf` (`render.yaml`,
  `backend/src/config/env.ts`).
- La tabla `agent_turn_admissions` de producción, que sólo se escribe por la
  conexión privada `PING_M7_DATABASE_URL`, tiene filas recientes.
- `mobile/eas.json`, `.github/workflows/` y `render.yaml` sólo referencian
  producción. El repositorio conserva `oonijgmddgyymhrlnvuu` únicamente en
  documentos históricos y en guards que **rechazan** ese ref
  (`scripts/production-readiness/guards.mjs`, `production-env-manifest.json`).
- La CLI de Supabase de ambos checkouts está enlazada a
  `wbigqhtuzfmpnxservlf` (`supabase/.temp/project-ref`).
- El `backend/.env` local ya no contiene claves ni contraseña de staging.

## Antes de eliminar

1. En Render → `ping-app-con3` → Environment, confirma que `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` y `PING_M7_DATABASE_URL`
   contienen `wbigqhtuzfmpnxservlf` (o son claves `sb_` del proyecto
   producción) y ninguno contiene `oonijgmddgyymhrlnvuu`. No copies los
   valores a ningún lado.
2. En Expo (expo.dev → proyecto Ping → Environment variables), confirma lo
   mismo para `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_API_URL`.
3. En GitHub → Settings → Environments y Secrets, elimina cualquier
   environment o secret con nombre de staging (por ejemplo
   `ping-staging-certification`) si todavía existe.
4. En Render, si todavía existe un servicio `ping-backend-staging`, elimínalo
   (Settings → Delete Web Service).
5. Opcional: si quieres conservar algo de staging, descarga antes un backup;
   al estar pausado puede requerir restaurarlo temporalmente. Sus datos eran
   de prueba, así que normalmente no hace falta.

## Eliminar

1. Abre <https://supabase.com/dashboard/project/oonijgmddgyymhrlnvuu/settings/general>.
2. Verifica en la cabecera que el proyecto es **Ping Staging V2** y que la URL
   contiene `oonijgmddgyymhrlnvuu`.
3. Al final de la página, **Delete project** → escribe el nombre exacto que
   pide el diálogo → confirma.

## Después

```bash
supabase projects list
curl -s https://ping-app-con3.onrender.com/api/health
```

- `oonijgmddgyymhrlnvuu` ya no aparece en la lista.
- El health sigue con `ok: true`, `db_status: connected` y
  `agent_private_database_diagnostic.passed: true`.

Si el health falla después de eliminar staging, alguna variable de Render sí
apuntaba a staging: revisa el paso 1 de "Antes de eliminar". El proyecto ya no
se puede recuperar, así que esa variable debe pasar a producción.
