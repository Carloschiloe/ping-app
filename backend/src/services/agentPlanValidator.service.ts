// M-3 — Agent Plan Validator. Deterministic, structural, and NEVER trusts a
// step's self-declared risk/confirmation/authorization — the registry
// always wins (sección 5/6/41 E/F). This is the one place that decides
// whether a plan is structurally sound; agentPlanner.service.ts already did
// the semantic/domain resolution (entities, identity, time, live
// authority/lifecycle checks against real data) — this module re-verifies
// everything that can be checked WITHOUT further I/O: known tool, schema-
// valid arguments, no dependency cycles, scale limits, non-contradictory
// steps, and registry-authoritative side-effect/authorization/confirmation
// fields.
import { getToolContract, getToolArgumentSchema } from './toolRegistry.service';
import { AGENT_PLAN_LIMITS } from '../types/agentPlan';
import type { AgentPlanStep, AgentPlanValidationResult, AgentPlanValidationIssue } from '../types/agentPlan';

function detectCycle(steps: AgentPlanStep[]): boolean {
    const byId = new Map(steps.map((s) => [s.stepId, s]));
    const state = new Map<string, 'visiting' | 'done'>();

    function visit(id: string): boolean {
        const current = state.get(id);
        if (current === 'visiting') return true; // cycle found
        if (current === 'done') return false;
        state.set(id, 'visiting');
        const step = byId.get(id);
        for (const dep of step?.dependsOn ?? []) {
            if (byId.has(dep) && visit(dep)) return true;
        }
        state.set(id, 'done');
        return false;
    }

    return steps.some((s) => visit(s.stepId));
}

function maxDependencyDepth(steps: AgentPlanStep[]): number {
    const byId = new Map(steps.map((s) => [s.stepId, s]));
    const memo = new Map<string, number>();

    function depth(id: string): number {
        if (memo.has(id)) return memo.get(id)!;
        const step = byId.get(id);
        if (!step || step.dependsOn.length === 0) { memo.set(id, 0); return 0; }
        const d = 1 + Math.max(...step.dependsOn.filter((dep) => byId.has(dep)).map(depth), 0);
        memo.set(id, d);
        return d;
    }

    return steps.reduce((max, s) => Math.max(max, depth(s.stepId)), 0);
}

// Extrae un id de entidad "objetivo" real de los argumentos ya validados por
// schema (sección 23: "non-contradictory") — sólo mira las claves conocidas
// que el registry ya declara para tools que mutan una entidad existente.
function targetEntityId(step: AgentPlanStep): string | null {
    const args = step.arguments as Record<string, unknown>;
    if (typeof args.commitmentId === 'string') return args.commitmentId;
    if (typeof args.proposalId === 'string') return args.proposalId;
    return null;
}

export function validateAgentPlan(steps: AgentPlanStep[]): { validation: AgentPlanValidationResult; correctedSteps: AgentPlanStep[] } {
    const issues: AgentPlanValidationIssue[] = [];

    if (steps.length > AGENT_PLAN_LIMITS.maxSteps) {
        issues.push({ code: 'policy_blocked', message: `Plan has ${steps.length} steps, exceeding the safety limit of ${AGENT_PLAN_LIMITS.maxSteps}.` });
        return { validation: { valid: false, issues }, correctedSteps: steps };
    }

    const rootSteps = steps.filter((s) => s.dependsOn.length === 0);
    if (rootSteps.length > AGENT_PLAN_LIMITS.maxParallelSteps) {
        issues.push({ code: 'policy_blocked', message: `Plan has ${rootSteps.length} independent parallel steps, exceeding the safety limit of ${AGENT_PLAN_LIMITS.maxParallelSteps}.` });
    }

    // Known-step-id integrity: a dependsOn referencing a stepId that doesn't
    // exist in this plan is rejected outright (never silently ignored).
    const knownIds = new Set(steps.map((s) => s.stepId));
    for (const step of steps) {
        for (const dep of step.dependsOn) {
            if (!knownIds.has(dep)) {
                issues.push({ code: 'policy_blocked', message: `Step "${step.stepId}" depends on unknown step "${dep}".`, stepId: step.stepId });
            }
        }
    }

    if (detectCycle(steps)) {
        issues.push({ code: 'policy_blocked', message: 'Plan contains a dependency cycle.' });
    } else if (maxDependencyDepth(steps) > AGENT_PLAN_LIMITS.maxDependencyDepth) {
        issues.push({ code: 'policy_blocked', message: `Plan's dependency chain is deeper than the safety limit of ${AGENT_PLAN_LIMITS.maxDependencyDepth}.` });
    }

    const correctedSteps: AgentPlanStep[] = [];
    for (const step of steps) {
        // Sección 10: "No dynamic arbitrary tool IDs from model. Unknown
        // tool: rejected."
        const contract = getToolContract(step.toolId);
        if (!contract) {
            issues.push({ code: 'unsupported_capability', message: `Unknown tool "${step.toolId}".`, stepId: step.stepId });
            continue;
        }
        if (contract.availability === 'disabled' || contract.availability === 'unsupported') {
            issues.push({ code: 'unsupported_capability', message: `Tool "${step.toolId}" is not available.`, stepId: step.stepId });
            continue;
        }

        // Sección 11/48: strict schema, reject unknown keys / malformed args.
        const schema = getToolArgumentSchema(step.toolId);
        if (schema) {
            const result = schema.safeParse(step.arguments);
            if (!result.success) {
                const isPollutionShaped = result.error.issues.some((i) => i.code === 'unrecognized_keys');
                issues.push({
                    code: isPollutionShaped ? 'policy_blocked' : 'missing_context',
                    message: `Invalid arguments for tool "${step.toolId}": ${result.error.issues.map((i) => i.message).join('; ')}`,
                    stepId: step.stepId,
                });
                continue;
            }
        }

        // Sección 5/6/41 E/F: "registry wins" — never trust a step's
        // self-declared side-effect/authorization/confirmation; always
        // recompute from the ToolContract.
        correctedSteps.push({
            ...step,
            sideEffectClass: contract.sideEffectClass,
            authorizationRequirement: contract.authorizationRequirement,
            confirmationRequirement: contract.confirmationPolicy,
        });

        // Defensive invariant: a WRITE-category tool must never carry
        // authorizationRequirement 'none' — if the registry itself were
        // ever misconfigured this way, that is a policy violation, not a
        // silently-accepted plan (sección 48: treat model output — and any
        // malformed contract — as untrusted).
        if (contract.category === 'WRITE' && contract.authorizationRequirement === 'none') {
            issues.push({ code: 'policy_blocked', message: `Tool "${step.toolId}" is WRITE-category but declares no authorization requirement.`, stepId: step.stepId });
        }
    }

    // Sección 23: "non-contradictory" — no two steps may target the same
    // canonical entity with different mutating operations in one plan.
    const seenTargets = new Map<string, string>();
    for (const step of steps) {
        const target = targetEntityId(step);
        if (!target) continue;
        const previousToolId = seenTargets.get(target);
        if (previousToolId && previousToolId !== step.toolId) {
            issues.push({ code: 'policy_blocked', message: `Plan applies contradictory operations ("${previousToolId}" and "${step.toolId}") to the same entity.`, stepId: step.stepId });
        }
        seenTargets.set(target, step.toolId);
    }

    return { validation: { valid: issues.length === 0, issues }, correctedSteps };
}
