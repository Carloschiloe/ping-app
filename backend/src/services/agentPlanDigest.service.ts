// M-4 — Plan digest (sección 5 del ticket). Deterministic fingerprint over
// exactly the material fields the ticket names: actor, objective type, step
// IDs, tool IDs/versions, canonical arguments, dependencies, confirmation
// requirements, side-effect classes, conditions. Any material mutation to
// the plan invalidates the digest — there is no "same planId but edited
// args" (sección 5), because there is no persisted planId at all: identity
// is the digest itself, recomputed fresh both at /plan time and at
// /authorize time (Option C, sección 10/58 — re-plan + deterministic digest
// comparison, documented in full in the migration file's header comment).
import { createHash } from 'crypto';
import type { AgentPlan, AgentPlanStep } from '../types/agentPlan';

// Ordena las claves recursivamente antes de serializar -- JSON.stringify por
// sí solo NO garantiza el mismo orden de propiedades entre dos objetos
// construidos de forma independiente (aquí, el plan de /plan y el
// re-derivado en /authorize), aunque su CONTENIDO sea idéntico. Sin esto,
// dos planes semánticamente iguales podrían producir digests distintos por
// puro orden de inserción -- un falso "plan_changed".
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
        const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
        const result: Record<string, unknown> = {};
        for (const key of sortedKeys) result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
    }
    return value;
}

// Sólo los campos MATERIALES de un step -- nunca stepId de por sí (dos
// planes re-derivados en instantes distintos generan stepIds aleatorios
// distintos vía randomUUID(), sección "plan minimality" de M-3 -- incluir
// el stepId real haría que el digest NUNCA coincidiera entre /plan y
// /authorize, aunque el contenido sea idéntico). En su lugar se usa la
// POSICIÓN + dependsOn relativos (por índice), que sí son estables para el
// mismo plan real.
function canonicalStep(step: AgentPlanStep, allSteps: AgentPlanStep[]): unknown {
    const indexOf = (id: string) => allSteps.findIndex((s) => s.stepId === id);
    return canonicalize({
        toolId: step.toolId,
        toolVersion: step.toolVersion,
        operation: step.operation,
        arguments: step.arguments,
        dependsOnIndexes: step.dependsOn.map(indexOf).sort(),
        conditionType: step.condition.type,
        conditionDependsOnIndex: step.condition.dependsOnStepId ? indexOf(step.condition.dependsOnStepId) : null,
        authorizationRequirement: step.authorizationRequirement,
        confirmationRequirement: step.confirmationRequirement,
        sideEffectClass: step.sideEffectClass,
    });
}

export function computePlanDigest(plan: AgentPlan): string {
    const material = canonicalize({
        actor: plan.objective.actor,
        objectiveType: plan.objective.objectiveType,
        steps: plan.steps.map((step) => canonicalStep(step, plan.steps)),
    });
    const serialized = JSON.stringify(material);
    return createHash('sha256').update(serialized).digest('hex');
}
