# PING

Ping is a personal assistant built around real messaging, commitments, people and memory. Its promise: **Ping remembers what matters and helps the user follow through.** The mobile app (Expo) is the current surface; the same backend is meant to serve other devices later.

## Repo guard

- Repository: `Carloschiloe/ping-app`, production branch `main`. Only `main` lives on GitHub; work happens on short-lived branches merged by PR.
- Render service: `ping-app` (`srv-d6ipqi75r7bs73fnbom0`, `https://ping-app-con3.onrender.com`). Auto-deploy is off; every deploy is explicit. See [`RENDER_DEPLOY.md`](RENDER_DEPLOY.md).
- Supabase project: `wbigqhtuzfmpnxservlf`. There is no staging environment.
- The app must keep working in Expo Go: no native libraries Expo Go lacks, no permanent `expo prebuild`.

## Critical invariants

- **The model suggests; Ping Core decides.** Model output is an untrusted hint; every write is validated and executed by Core.
- Writes the user did not explicitly ask for are proposed first and only run after the user confirms.
- Core owns actor identity, permissions, canonical IDs and lifecycle truth. Names are hints that Core resolves.
- A pending proposal is not a commitment and is never overdue.
- Messaging stays real messaging; the assistant does not replace chats.
- Production is never touched (deploys, migrations, env vars, credentials) without explicit, current authorization.

## How the assistant works

- One assistant turn: `backend/src/services/assistant/` — the model gets the user's text, recent dialogue and a set of tools (`list_commitments`, `search_messages`, `search_memory`, `propose_create_commitment`, `propose_reschedule`, `propose_remember`, ...). Tools that write return a proposal the user confirms. Design: [`docs/M9-ASISTENTE-CON-HERRAMIENTAS.md`](docs/M9-ASISTENTE-CON-HERRAMIENTAS.md).
- Ping taking the initiative (morning summary, overdue notices, per-user preferences): `assistantInitiative.service.ts`, run every 5 minutes by `cronCoordinator`. Design: [`docs/M10-INICIATIVA.md`](docs/M10-INICIATIVA.md).
- What Ping remembers about the user (known facts each turn, offering to remember, forgetting, the Perfil list): `backend/src/services/memoryFacts.service.ts`. Design: [`docs/M11-MEMORIA.md`](docs/M11-MEMORIA.md).
- Retrieval contracts: [`docs/M-1B-STRUCTURED-RETRIEVAL-CONTRACT.md`](docs/M-1B-STRUCTURED-RETRIEVAL-CONTRACT.md), [`docs/M-1C-FULL-TEXT-RETRIEVAL.md`](docs/M-1C-FULL-TEXT-RETRIEVAL.md).

## Repository shape

- `backend/src/` — Express API, Core services, assistant, authorization, workers.
- `backend/tests/` — Vitest suites; `backend/scripts/` — PostgreSQL integration runners (`npm run test:*:postgres`).
- `mobile/src/` — Expo / React Native screens, API modules, hooks. Tabs: Chats, Tablero, Insights, Perfil.
- `mobile/tests/` — mobile contract and state tests.
- `supabase/migrations/` — the database's source of truth.
- `docs/` — vision, current designs and production runbooks ([`docs/runbooks/PRUEBAS-EN-PRODUCCION.md`](docs/runbooks/PRUEBAS-EN-PRODUCCION.md)).

## Quickstart

Never print or commit `.env` contents.

```powershell
Set-Location backend; npm install; npm run dev
```

```powershell
Set-Location mobile; npm install; npm start
```

On a physical device the API URL must be reachable from the phone. Use the production API; never add a staging endpoint.

## Development rules

- Run the focused test first, then `npx vitest run` and `npx tsc --noEmit -p .` in `backend` and `mobile` before closing a change.
- New database changes go in a new migration; production SQL is applied by the owner in the Supabase SQL Editor.
- Production tests use the owner's account, records titled with "prueba", and are cleaned up by cancelling, never deleting.
- Do not deploy, push, migrate remotely, or change infrastructure without explicit authorization.
- Never expose service-role keys, signed URLs, tokens, credentials, or `.env` contents.

When documentation and code differ, the code plus `supabase/migrations/` is the truth.
