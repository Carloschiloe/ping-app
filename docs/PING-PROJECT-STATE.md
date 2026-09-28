# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: QUALITY_GATE_PASS_EXTERNAL_CONFIG_REQUIRED
ACTIVE_TASK: "Complete the one-time GitHub/Render staging gate configuration, then run the autonomous staging certification."
LAST_CERTIFIED_SHA: "6a564b293d51865f7c5fb300a4d1d30e9b3880bb (local M7 candidate; not staging-certified)"
STAGING_REMOTE_SHA: edb03895e7abbda5b4e5e5bb7d5b704abed74f0c
STAGING_DEPLOYED_SHA: "8304ea0 (last externally confirmed; edb0389 has not been deployed)"
KNOWN_FAILURES: "The first permanent workflow run passed quality and stopped before deploy because the Render deploy-hook secret was absent. Last staging E2E evidence still has unclosed M7 conversational gates."
TECHNICAL_DEBT: "The full repository test command contains pre-existing environment/external-suite failures and is not currently a reliable staging gate. Legacy remains."
SECURITY_DEBT: "The permanent GitHub environment and staging-only E2E credentials are not configured. Production secrets are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: create ping-staging-certification and configure the staging-only Render deploy hook plus Supabase E2E secrets."
NEXT_ACTION: "Owner performs the single configuration described in PING-STAGING-CERTIFICATION.md; then rerun the staging workflow and inspect evidence."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: NO
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "GitHub Actions cannot call the staging-only Render deploy hook or authenticate the remote E2E until the owner creates the protected environment and secrets."
EVIDENCE: "Run 36432675368: quality PASS; deploy step stopped at an empty RENDER_STAGING_DEPLOY_HOOK_URL; no Render request, health check or E2E occurred."
OPTIONS: "Configure the protected environment, or leave M7 paused. Do not paste secret values into chat."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "After configuration, rerun the workflow for codex/staging-beta; it will deploy only ping-backend-staging and stop before E2E on any SHA/health mismatch."
```

