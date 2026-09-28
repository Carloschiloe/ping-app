# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: GITHUB_SUPABASE_READY_RENDER_HOOK_REQUIRED
ACTIVE_TASK: "Create the staging-only Render deploy hook, store it in the protected GitHub environment, then run the autonomous staging certification."
LAST_CERTIFIED_SHA: "6a564b293d51865f7c5fb300a4d1d30e9b3880bb (local M7 candidate; not staging-certified)"
STAGING_REMOTE_SHA: c94a1c2228f5f9ecbbfcd0b9ab2ac24d96c39f38
STAGING_DEPLOYED_SHA: "8304ea0 (last externally confirmed; edb0389 has not been deployed)"
KNOWN_FAILURES: "The permanent workflow passes quality and stops before deploy because the Render deploy-hook secret is absent. Staging health and E2E gates remain unverified."
TECHNICAL_DEBT: "The full repository test command contains pre-existing environment/external-suite failures and is not currently a reliable staging gate. Legacy remains."
SECURITY_DEBT: "The staging-only Render deploy hook is not configured. GitHub environment branch policy and Supabase staging secrets are configured; production secrets are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: create the staging-only Render deploy hook and save it as RENDER_STAGING_DEPLOY_HOOK_URL in ping-staging-certification."
NEXT_ACTION: "Owner performs the single Render action below; then rerun the workflow for codex/staging-beta and inspect evidence."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: NO
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "GitHub Actions has the staging Supabase secrets and branch restriction, but cannot call Render until the owner creates the deploy hook in the authenticated Render interface."
EVIDENCE: "Runs 36432675368 and 36435186799: quality PASS; deploy step stopped at an empty hook secret; no Render request, health check or E2E occurred."
OPTIONS: "Create the hook or leave M7 paused. Do not paste the hook URL or any secret into chat."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "After configuration, rerun the workflow for codex/staging-beta; it will deploy only ping-backend-staging and stop before E2E on any SHA/health mismatch."
```
