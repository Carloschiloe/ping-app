// M9 — the tools Ping's assistant can call. Reads run immediately and return
// only actor-visible data, keyed by opaque refs. Writes never execute: they
// freeze a validated plan step as a pending action that only a confirmation
// in a LATER user turn can authorize. That rule is enforced here, not asked
// of the model.
import { randomUUID } from 'node:crypto';
import { getToolArgumentSchema, getToolContract } from '../toolRegistry.service';
import { isOpenCommitmentStatus } from '../../utils/commitmentStatus';
import type { CanonicalCommitmentStatus } from '../../utils/commitmentStatus';
import type { AgentPlanStep } from '../../types/agentPlan';
import { describeLocal, formatLocal, localDateTimeToIso, localDayRangeToIso } from './assistantTime';
import type { AssistantRefTable } from './assistantRefs';
import type {
    AssistantActionRecord,
    AssistantCommitment,
    AssistantDataPort,
    AssistantToolDefinition,
    AssistantToolTrace,
    AssistantTurnOutput,
} from './assistantTypes';

export interface AssistantToolContext {
    actorUserId: string;
    timezone: string;
    now: Date;
    data: AssistantDataPort;
    refs: AssistantRefTable;
    /** Every action this conversation knows, mutated as the turn goes. */
    actions: AssistantActionRecord[];
    /** Action refs that existed before this turn started. */
    priorActionRefs: ReadonlySet<string>;
    /** False when the user's words were not captured verbatim (voice fallback). */
    userWordsHeard: boolean;
    trace: AssistantToolTrace[];
    citations: Map<string, AssistantTurnOutput['citations'][number]>;
}

type ToolResult = Record<string, unknown>;
type ToolHandler = (args: Record<string, any>, ctx: AssistantToolContext) => Promise<ToolResult>;

const nullable = (schema: Record<string, unknown>) => ({ ...schema, type: [schema.type as string, 'null'] });
const LOCAL_DATE = { type: 'string', description: 'Local date YYYY-MM-DD' };
const LOCAL_DATE_TIME = { type: 'string', description: 'Local date and time YYYY-MM-DDTHH:MM in the user\'s time zone' };
const REF = (what: string) => ({ type: 'string', description: `Ref of ${what}, exactly as a previous tool result showed it` });

function tool(name: string, description: string, properties: Record<string, unknown>): AssistantToolDefinition {
    return {
        type: 'function',
        function: {
            name,
            description,
            parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
            strict: true,
        },
    };
}

export const ASSISTANT_TOOL_DEFINITIONS: AssistantToolDefinition[] = [
    tool('list_commitments', 'List the user\'s commitments (their own, the ones they owe others and the ones they asked of others), ordered by due time, earliest first.', {
        from: nullable({ ...LOCAL_DATE, description: 'First local day to include (YYYY-MM-DD), or null for no lower bound' }),
        to: nullable({ ...LOCAL_DATE, description: 'Last local day to include (YYYY-MM-DD), or null for no upper bound' }),
        status: { type: 'string', enum: ['open', 'overdue', 'done', 'cancelled', 'all'], description: 'open = not finished yet (default meaning of "what do I have"); overdue = open and already past due' },
        person: nullable(REF('a person (from find_person) to filter by')),
        text: nullable({ type: 'string', description: 'Words that should appear in the title, or null' }),
    }),
    tool('get_commitment', 'Details of one commitment or proposal.', { ref: REF('a commitment') }),
    tool('list_proposals', 'Proposals from or to other people that are still waiting for an answer, mine or theirs.', {}),
    tool('find_person', 'Find the user\'s contacts by name.', { name: { type: 'string' } }),
    tool('search_messages', 'Search the user\'s chat messages.', {
        text: nullable({ type: 'string', description: 'Words to search for, or null' }),
        person: nullable(REF('a person whose direct conversation to search')),
    }),
    tool('search_memory', 'Search facts the user asked Ping to remember.', { query: { type: 'string' } }),
    tool('propose_create_commitment', 'Prepare a new commitment for the user to confirm. Nothing is created until the user confirms in a later message.', {
        title: { type: 'string', description: 'Short activity title in the user\'s words, without the date or time' },
        due: LOCAL_DATE_TIME,
        person: nullable(REF('the person who should do it, when it is not the user')),
    }),
    tool('propose_reschedule', 'Prepare moving an existing commitment to a new date/time, for the user to confirm.', { ref: REF('the commitment'), due: LOCAL_DATE_TIME }),
    tool('propose_complete', 'Prepare marking an existing commitment as done, for the user to confirm.', {
        ref: REF('the commitment'),
        note: nullable({ type: 'string', description: 'What the outcome was, if the user said it' }),
    }),
    tool('propose_cancel', 'Prepare cancelling an existing commitment, for the user to confirm.', { ref: REF('the commitment') }),
    tool('propose_edit', 'Prepare renaming an existing commitment, for the user to confirm.', { ref: REF('the commitment'), title: { type: 'string' } }),
    tool('propose_respond', 'Prepare the user\'s answer to a proposal that waits for them, for the user to confirm.', {
        ref: REF('the proposal'),
        decision: { type: 'string', enum: ['accept', 'reject', 'counter'] },
        due: nullable({ ...LOCAL_DATE_TIME, description: 'New local date/time when the decision is counter, else null' }),
    }),
    tool('propose_send_message', 'Prepare a chat message to a contact, for the user to confirm.', { person: REF('the recipient'), text: { type: 'string' } }),
    tool('propose_remember', 'Prepare saving a fact the user explicitly asked Ping to remember, for the user to confirm.', { fact: { type: 'string' } }),
    tool('confirm_action', 'Execute a pending action. Only when the user, in their latest message, clearly agreed to that exact pending action.', { action: REF('the pending action') }),
    tool('discard_action', 'Drop a pending action the user does not want.', { action: REF('the pending action') }),
];

// ── Projection of canonical data for the model ───────────────────────────

const OPEN: CanonicalCommitmentStatus[] = ['proposed', 'accepted', 'counter_proposal'];

function statusLabel(item: AssistantCommitment, now: Date): string {
    if (item.status === 'resolved') return 'completado';
    if (item.status === 'cancelled') return 'cancelado';
    if (item.status === 'rejected') return 'rechazado';
    if (item.entityType === 'commitment_proposal') return item.actorCanRespond ? 'propuesta que espera tu respuesta' : 'propuesta esperando a otros';
    if (item.dueAt && new Date(item.dueAt) < now) return 'vencido';
    return 'pendiente';
}

function relationLabel(item: AssistantCommitment, actorUserId: string, names: Record<string, string>): string {
    const owner = item.ownerUserId;
    const assignee = item.assignedToUserId ?? owner;
    if (owner === actorUserId && assignee === actorUserId) return 'tuyo';
    if (assignee === actorUserId) return `te lo pidió ${names[owner] ?? 'otra persona'}`;
    if (owner === actorUserId) return `se lo pediste a ${names[assignee] ?? 'otra persona'}`;
    return `entre ${names[owner] ?? 'otra persona'} y ${names[assignee] ?? 'otra persona'}`;
}

async function projectCommitments(items: AssistantCommitment[], ctx: AssistantToolContext) {
    const ids = [...new Set(items.flatMap((item) => [item.ownerUserId, item.assignedToUserId ?? item.ownerUserId]))]
        .filter((id) => id !== ctx.actorUserId);
    const names = ids.length ? await ctx.data.personNames(ids) : {};
    return items.map((item) => {
        ctx.citations.set(item.id, { sourceType: item.entityType, sourceId: item.id });
        return {
            ref: ctx.refs.refFor('commitment', item.id, item.title),
            title: item.title,
            when: item.dueAt ? formatLocal(item.dueAt, ctx.timezone) : 'sin fecha',
            status: statusLabel(item, ctx.now),
            relation: relationLabel(item, ctx.actorUserId, names),
        };
    });
}

function byDueAt(a: AssistantCommitment, b: AssistantCommitment): number {
    if (!a.dueAt) return b.dueAt ? 1 : 0;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
}

async function resolveCommitment(ref: unknown, ctx: AssistantToolContext): Promise<AssistantCommitment | ToolResult> {
    const entry = ctx.refs.resolve(ref, 'commitment');
    if (!entry) return { error: 'unknown_ref', detail: 'Use a ref from a previous tool result; list or search first.' };
    const item = await ctx.data.getCommitment(entry.id);
    if (!item) return { error: 'not_found', detail: 'That commitment is no longer visible to the user.' };
    return item;
}

function isError(value: unknown): value is ToolResult {
    return !!value && typeof value === 'object' && 'error' in (value as Record<string, unknown>);
}

// ── Pending actions ───────────────────────────────────────────────────────

function buildStep(toolId: string, operation: string, args: Record<string, unknown>, expectedEffect: string, sourceIds: Array<{ sourceType: string; sourceId: string }>): AgentPlanStep {
    const contract = getToolContract(toolId);
    if (!contract) throw new Error(`Unknown tool ${toolId}`);
    return {
        stepId: randomUUID(),
        toolId: contract.toolId,
        toolVersion: contract.version,
        operation,
        arguments: args,
        dependsOn: [],
        condition: { type: 'always', description: 'No preconditions — can be attempted immediately.' },
        expectedEffect,
        authorizationRequirement: contract.authorizationRequirement,
        confirmationRequirement: contract.confirmationPolicy,
        sideEffectClass: contract.sideEffectClass,
        riskLevel: 'medium',
        preconditions: [],
        postconditions: [],
        rollbackCapability: 'reversible_by_owner',
        provenance: { resolvedFrom: 'canonical_context', canonicalSourceRefs: sourceIds },
        status: 'pending',
    };
}

async function propose(
    ctx: AssistantToolContext,
    toolName: string,
    toolId: string,
    objectiveType: string,
    args: Record<string, unknown>,
    summary: string,
    sourceIds: Array<{ sourceType: string; sourceId: string }> = [],
): Promise<ToolResult> {
    const parsed = getToolArgumentSchema(toolId)?.safeParse(args);
    if (!parsed?.success) return { error: 'invalid_arguments', detail: parsed?.error.issues.map((issue) => issue.message).join('; ') ?? 'unknown tool' };
    // A new proposal replaces what was pending from earlier turns; proposals
    // made together in this turn stay pending together.
    for (const action of ctx.actions) {
        if (action.state !== 'pending' || !ctx.priorActionRefs.has(action.ref)) continue;
        const entry = ctx.refs.resolve(action.ref, 'action');
        if (entry) await ctx.data.discardPendingAction(entry.id);
        action.state = 'superseded';
    }
    const step = buildStep(toolId, toolName, parsed.data as Record<string, unknown>, summary, sourceIds);
    const pending = await ctx.data.createPendingAction({ steps: [step], objectiveType, summary });
    const ref = ctx.refs.refFor('action', pending.id, summary);
    ctx.actions.push({ ref, summary, state: 'pending' });
    const traced = ctx.trace[ctx.trace.length - 1];
    if (traced) traced.proposedAction = { ref, toolId, arguments: parsed.data as Record<string, unknown> };
    return {
        action: ref,
        summary,
        status: 'waiting_for_user_confirmation',
        instruction: 'Tell the user exactly this summary and ask whether to go ahead. It runs only if the user agrees in their next message.',
    };
}

function dueToIso(value: unknown, ctx: AssistantToolContext): string | ToolResult {
    if (typeof value !== 'string') return { error: 'invalid_due', detail: 'Use YYYY-MM-DDTHH:MM.' };
    const iso = localDateTimeToIso(value, ctx.timezone);
    if (!iso) return { error: 'invalid_due', detail: 'Not a real local date and time; use YYYY-MM-DDTHH:MM.' };
    return iso;
}

async function personFromRef(ref: unknown, ctx: AssistantToolContext) {
    const entry = ctx.refs.resolve(ref, 'person');
    if (!entry) return null;
    const people = await ctx.data.findPeople(entry.label);
    return people.find((person) => person.id === entry.id) ?? null;
}

// ── Handlers ──────────────────────────────────────────────────────────────

const handlers: Record<string, ToolHandler> = {
    async list_commitments(args, ctx) {
        const range = localDayRangeToIso(args.from ?? undefined, args.to ?? undefined, ctx.timezone);
        if (!range) return { error: 'invalid_range', detail: 'Use real local dates YYYY-MM-DD with from <= to.' };
        let personId: string | undefined;
        if (args.person) {
            const person = ctx.refs.resolve(args.person, 'person');
            if (!person) return { error: 'unknown_ref', detail: 'Find the person first.' };
            personId = person.id;
        }
        const status = args.status as string;
        const statuses: CanonicalCommitmentStatus[] | undefined = status === 'done' ? ['resolved']
            : status === 'cancelled' ? ['cancelled', 'rejected']
                : status === 'all' ? undefined : OPEN;
        const to = status === 'overdue' && (!range.to || range.to > ctx.now.toISOString()) ? ctx.now.toISOString() : range.to;
        const items = (await ctx.data.listCommitments({
            from: range.from, to, statuses, text: args.text?.trim() || undefined, personId, limit: 40,
        }))
            .filter((item) => item.entityType === 'commitment')
            .filter((item) => status !== 'overdue' || (item.dueAt !== null && new Date(item.dueAt) < ctx.now && isOpenCommitmentStatus(item.status)))
            .sort(byDueAt);
        return { total: items.length, items: await projectCommitments(items.slice(0, 25), ctx), truncated: items.length > 25 };
    },

    async get_commitment(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const [projected] = await projectCommitments([item as AssistantCommitment], ctx);
        return projected;
    },

    async list_proposals(_args, ctx) {
        const items = (await ctx.data.listProposals()).sort(byDueAt);
        return { total: items.length, items: await projectCommitments(items.slice(0, 25), ctx) };
    },

    async find_person(args, ctx) {
        const people = await ctx.data.findPeople(String(args.name ?? '').trim());
        return { people: people.slice(0, 5).map((person) => ({ ref: ctx.refs.refFor('person', person.id, person.name), name: person.name })) };
    },

    async search_messages(args, ctx) {
        let conversationId: string | undefined;
        if (args.person) {
            const person = await personFromRef(args.person, ctx);
            if (!person) return { error: 'unknown_ref', detail: 'Find the person first.' };
            if (!person.conversationId) return { messages: [], note: 'No direct conversation with that person.' };
            conversationId = person.conversationId;
        }
        const hits = await ctx.data.searchMessages({ text: args.text?.trim() || undefined, conversationId });
        return {
            messages: hits.slice(0, 10).map((hit) => {
                ctx.citations.set(hit.id, { sourceType: 'message', sourceId: hit.id });
                return { from: hit.senderName, when: formatLocal(hit.createdAt, ctx.timezone), text: hit.content.slice(0, 500) };
            }),
        };
    },

    async search_memory(args, ctx) {
        const hits = await ctx.data.searchMemory(String(args.query ?? '').trim());
        return {
            facts: hits.slice(0, 10).map((hit) => {
                ctx.citations.set(hit.id, { sourceType: 'memory', sourceId: hit.id });
                return hit.content.slice(0, 500);
            }),
        };
    },

    async propose_create_commitment(args, ctx) {
        const dueAt = dueToIso(args.due, ctx);
        if (isError(dueAt)) return dueAt;
        if (new Date(dueAt as string) <= ctx.now) return { error: 'due_in_past', detail: 'That date and time already passed; ask the user for a future one.' };
        let responsiblePersonId: string | null = null;
        let conversationId: string | null = null;
        let who = '';
        if (args.person) {
            const person = await personFromRef(args.person, ctx);
            if (!person) return { error: 'unknown_ref', detail: 'Find the person first.' };
            if (!person.conversationId) return { error: 'no_conversation', detail: `There is no chat with ${person.name} to send the request through.` };
            responsiblePersonId = person.id;
            conversationId = person.conversationId;
            who = ` para ${person.name}`;
        }
        const title = String(args.title ?? '').trim();
        return propose(ctx, 'propose_create_commitment', 'create_commitment', 'create_personal_commitment',
            { title, dueAt, responsiblePersonId, conversationId },
            `Crear «${title}»${who} ${describeLocal(dueAt as string, ctx.timezone)}`);
    },

    async propose_reschedule(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const commitment = item as AssistantCommitment;
        if (commitment.ownerUserId !== ctx.actorUserId && commitment.assignedToUserId !== ctx.actorUserId) return { error: 'not_allowed', detail: 'Only its owner or assignee can move it.' };
        const dueAt = dueToIso(args.due, ctx);
        if (isError(dueAt)) return dueAt;
        return propose(ctx, 'propose_reschedule', 'reschedule_commitment', 'reschedule_existing_commitment',
            { commitmentId: commitment.id, newDueAt: dueAt },
            `Mover «${commitment.title}» para ${describeLocal(dueAt as string, ctx.timezone)}`,
            [{ sourceType: commitment.entityType, sourceId: commitment.id }]);
    },

    async propose_complete(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const commitment = item as AssistantCommitment;
        if (commitment.ownerUserId !== ctx.actorUserId && commitment.assignedToUserId !== ctx.actorUserId) return { error: 'not_allowed', detail: 'Only its owner or assignee can complete it.' };
        if (!isOpenCommitmentStatus(commitment.status)) return { error: 'not_open', detail: 'It is already finished or cancelled.' };
        return propose(ctx, 'propose_complete', 'complete_commitment', 'complete_existing_commitment',
            { commitmentId: commitment.id, resolutionResult: String(args.note ?? '').trim() || 'Completado' },
            `Marcar «${commitment.title}» como completado`,
            [{ sourceType: commitment.entityType, sourceId: commitment.id }]);
    },

    async propose_cancel(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const commitment = item as AssistantCommitment;
        if (commitment.ownerUserId !== ctx.actorUserId) return { error: 'not_allowed', detail: 'Only the person who created it can cancel it.' };
        if (!isOpenCommitmentStatus(commitment.status)) return { error: 'not_open', detail: 'It is already finished or cancelled.' };
        return propose(ctx, 'propose_cancel', 'cancel_commitment', 'cancel_existing_commitment',
            { commitmentId: commitment.id },
            `Cancelar «${commitment.title}»`,
            [{ sourceType: commitment.entityType, sourceId: commitment.id }]);
    },

    async propose_edit(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const commitment = item as AssistantCommitment;
        if (commitment.ownerUserId !== ctx.actorUserId) return { error: 'not_allowed', detail: 'Only the person who created it can rename it.' };
        const title = String(args.title ?? '').trim();
        return propose(ctx, 'propose_edit', 'edit_commitment', 'edit_existing_commitment',
            { commitmentId: commitment.id, title },
            `Renombrar «${commitment.title}» como «${title}»`,
            [{ sourceType: commitment.entityType, sourceId: commitment.id }]);
    },

    async propose_respond(args, ctx) {
        const item = await resolveCommitment(args.ref, ctx);
        if (isError(item)) return item;
        const proposal = item as AssistantCommitment;
        if (proposal.entityType !== 'commitment_proposal' || !proposal.actorCanRespond) return { error: 'not_waiting_for_user', detail: 'That is not a proposal waiting for the user\'s answer.' };
        const decision = args.decision === 'accept' ? 'approve' : args.decision === 'reject' ? 'reject' : 'counter_propose';
        let proposedDueAt: string | null = null;
        if (decision === 'counter_propose') {
            const dueAt = dueToIso(args.due, ctx);
            if (isError(dueAt)) return dueAt;
            proposedDueAt = dueAt as string;
        }
        const verb = decision === 'approve' ? 'Aceptar' : decision === 'reject' ? 'Rechazar' : 'Proponer otra fecha para';
        return propose(ctx, 'propose_respond', 'respond_to_proposal', 'respond_to_existing_proposal',
            { proposalId: proposal.id, decision, proposedDueAt },
            `${verb} «${proposal.title}»${proposedDueAt ? `: ${describeLocal(proposedDueAt, ctx.timezone)}` : ''}`,
            [{ sourceType: proposal.entityType, sourceId: proposal.id }]);
    },

    async propose_send_message(args, ctx) {
        const person = await personFromRef(args.person, ctx);
        if (!person) return { error: 'unknown_ref', detail: 'Find the person first.' };
        if (!person.conversationId) return { error: 'no_conversation', detail: `There is no chat with ${person.name} yet.` };
        const content = String(args.text ?? '').trim();
        return propose(ctx, 'propose_send_message', 'send_message', 'communicate_message',
            { conversationId: person.conversationId, recipientPersonId: person.id, content },
            `Enviar a ${person.name}: «${content}»`);
    },

    async propose_remember(args, ctx) {
        const fact = String(args.fact ?? '').trim();
        return propose(ctx, 'propose_remember', 'remember_fact', 'remember_fact',
            { factContent: fact },
            `Recordar: «${fact}»`);
    },

    async confirm_action(args, ctx) {
        const entry = ctx.refs.resolve(args.action, 'action');
        const record = entry ? ctx.actions.find((action) => action.ref === entry.ref) : undefined;
        if (!entry || !record) return { error: 'unknown_action', detail: 'There is no such pending action.' };
        // The user must have seen the proposal before agreeing to it: an
        // action created in this same turn can never be confirmed here.
        if (!ctx.priorActionRefs.has(entry.ref)) return { error: 'needs_user_confirmation', detail: 'Ask the user first; it can be confirmed only in their next message.' };
        if (record.state !== 'pending') return { error: 'not_pending', detail: `That action is ${record.state}.` };
        // A "yes" reconstructed by the voice model instead of transcribed from
        // the user is not consent; the action stays pending.
        if (!ctx.userWordsHeard) return { error: 'not_heard', detail: 'The answer was not heard clearly; nothing changed. Ask the user to say it again.' };
        const outcome = await ctx.data.confirmPendingAction(entry.id);
        if (!outcome.ok) {
            record.state = outcome.reason === 'failed' ? 'failed' : record.state;
            return { error: outcome.reason, detail: outcome.reason === 'expired' ? 'It expired; propose it again.' : 'It could not be executed.' };
        }
        const done = outcome.result.status === 'done';
        record.state = done ? 'confirmed' : 'failed';
        const traced = ctx.trace[ctx.trace.length - 1];
        if (traced && done) traced.confirmed = true;
        return done
            ? { executed: true, summary: record.summary }
            : { executed: false, status: outcome.result.status, detail: 'It could not be completed; tell the user nothing changed.' };
    },

    async discard_action(args, ctx) {
        const entry = ctx.refs.resolve(args.action, 'action');
        const record = entry ? ctx.actions.find((action) => action.ref === entry.ref) : undefined;
        if (!entry || !record || record.state !== 'pending') return { error: 'unknown_action', detail: 'There is no such pending action.' };
        await ctx.data.discardPendingAction(entry.id);
        record.state = 'discarded';
        const traced = ctx.trace[ctx.trace.length - 1];
        if (traced) traced.discarded = true;
        return { discarded: true };
    },
};

export async function runAssistantTool(name: string, rawArguments: string, ctx: AssistantToolContext): Promise<ToolResult> {
    let args: Record<string, any>;
    try {
        args = JSON.parse(rawArguments || '{}');
    } catch {
        ctx.trace.push({ name, arguments: {}, ok: false });
        return { error: 'invalid_json' };
    }
    ctx.trace.push({ name, arguments: args, ok: true });
    const handler = handlers[name];
    if (!handler) {
        ctx.trace[ctx.trace.length - 1].ok = false;
        return { error: 'unknown_tool' };
    }
    try {
        const result = await handler(args, ctx);
        if (isError(result)) ctx.trace[ctx.trace.length - 1].ok = false;
        return result;
    } catch (error) {
        ctx.trace[ctx.trace.length - 1].ok = false;
        return { error: 'tool_failed', detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown' };
    }
}
