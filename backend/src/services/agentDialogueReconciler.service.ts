import OpenAI from 'openai';
import { isAiConfigured } from './synthesis.service';

export type DialogueReconciliationAction =
    | 'approve'
    | 'reject'
    | 'defer'
    | 'correct'
    | 'follow_up'
    | 'suspend'
    | 'resume'
    | 'new_objective'
    | 'clarify'
    | 'none';

export type DialogueReconciliationAttribute = 'time' | 'date' | 'responsible' | 'status' | 'details' | null;

export interface DialogueReconciliationContext {
    lifecycle: string;
    objectiveType: string;
    desiredOutcome?: string | null;
    timeHint?: string | null;
}

export interface DialogueReconciliationResult {
    action: DialogueReconciliationAction;
    attribute: DialogueReconciliationAttribute;
    replacementComplete: boolean;
}

export interface AgentDialogueReconciler {
    reconcile(input: string, context: DialogueReconciliationContext): Promise<DialogueReconciliationResult | null>;
}

const ACTIONS = new Set<DialogueReconciliationAction>([
    'approve', 'reject', 'defer', 'correct', 'follow_up', 'suspend', 'resume',
    'new_objective', 'clarify', 'none',
]);
const ATTRIBUTES = new Set<NonNullable<DialogueReconciliationAttribute>>([
    'time', 'date', 'responsible', 'status', 'details',
]);

export function normalizeDialogueReconciliationResult(value: unknown): DialogueReconciliationResult | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const action = typeof candidate.action === 'string' && ACTIONS.has(candidate.action as DialogueReconciliationAction)
        ? candidate.action as DialogueReconciliationAction
        : null;
    if (!action) return null;
    const attribute = candidate.attribute === null || candidate.attribute === undefined
        ? null
        : typeof candidate.attribute === 'string' && ATTRIBUTES.has(candidate.attribute as NonNullable<DialogueReconciliationAttribute>)
            ? candidate.attribute as NonNullable<DialogueReconciliationAttribute>
            : null;
    return {
        action,
        attribute,
        replacementComplete: candidate.replacementComplete === true,
    };
}

function buildPrompt(input: string, context: DialogueReconciliationContext): string {
    return [
        'You are Ping Core dialogue reconciliation. Classify one user turn against an already-owned objective.',
        'You do not answer, plan, authorize, execute, resolve identities, or invent slots.',
        'The current objective belongs to Core. Classify the meaning of the current turn, not its wording.',
        'approve means the user authorizes the currently presented plan.',
        'reject means the user declines or cancels the currently presented plan.',
        'defer means the user leaves the plan pending without approving or abandoning it.',
        'correct means the user changes a slot of the current plan/objective.',
        'follow_up means the user asks about an attribute of the current objective; set its attribute.',
        'suspend means the user changes topic without supplying a complete replacement objective.',
        'resume means the user returns to a uniquely suspended objective.',
        'new_objective means a genuinely new objective is expressed; replacementComplete is true only when its required content is present in the current turn.',
        'clarify means the relation is not safe to infer. none means the turn is unrelated and has no safe reconciliation signal.',
        'Never copy a title, person, date, or time from the stored objective into the current turn.',
        'Return only JSON with exactly: action, attribute, replacementComplete.',
        JSON.stringify({ storedObjective: context, currentTurn: input }),
    ].join('\n');
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() });
    return client;
}

export class LlmDialogueReconciler implements AgentDialogueReconciler {
    readonly modelName = 'gpt-4o-mini';

    async reconcile(input: string, context: DialogueReconciliationContext): Promise<DialogueReconciliationResult | null> {
        if (!isAiConfigured()) return null;
        try {
            const response = await getClient().chat.completions.create({
                model: this.modelName,
                messages: [{ role: 'user', content: buildPrompt(input, context) }],
                temperature: 0.1,
                max_tokens: 80,
                response_format: { type: 'json_object' },
            });
            const raw = response.choices[0]?.message?.content;
            return raw ? normalizeDialogueReconciliationResult(JSON.parse(raw)) : null;
        } catch {
            return null;
        }
    }
}
