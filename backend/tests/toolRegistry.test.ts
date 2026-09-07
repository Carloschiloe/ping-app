import { describe, expect, it } from 'vitest';
import { TOOL_REGISTRY, getToolContract, getToolArgumentSchema, isKnownTool } from '../src/services/toolRegistry.service';

// M-3 — sección 10/31/32/33: el registry es la ÚNICA autoridad sobre
// identidad/side-effects/auth/confirmation/disponibilidad de un tool. Estos
// tests certifican el contrato estructural, no la lógica de negocio (eso lo
// certifican agentPlanner.test.ts/agentPlanValidator.test.ts).
describe('ToolRegistry: taxonomía mínima requerida (sección 32)', () => {
    const REQUIRED_READ = ['get_person', 'get_conversation', 'get_commitment', 'get_commitment_proposal', 'search_memory'];
    const REQUIRED_DRAFT = ['draft_message', 'draft_commitment', 'draft_reschedule'];
    const REQUIRED_WRITE = ['send_message', 'create_commitment', 'respond_to_proposal', 'reschedule_commitment', 'complete_commitment'];

    it('declara todos los READ tools requeridos', () => {
        for (const id of REQUIRED_READ) {
            expect(getToolContract(id)?.category).toBe('READ');
        }
    });
    it('declara todos los DRAFT tools requeridos', () => {
        for (const id of REQUIRED_DRAFT) {
            expect(getToolContract(id)?.category).toBe('DRAFT');
        }
    });
    it('declara todos los WRITE tools requeridos, todos planned_future (nunca available_now -- sección 4)', () => {
        for (const id of REQUIRED_WRITE) {
            const contract = getToolContract(id);
            expect(contract?.category).toBe('WRITE');
            expect(contract?.availability).toBe('planned_future');
        }
    });
});

describe('ToolRegistry: unknown tool nunca se acepta (sección 10)', () => {
    it('isKnownTool(false) para un id inventado', () => {
        expect(isKnownTool('delete_everything')).toBe(false);
        expect(isKnownTool('__proto__')).toBe(false);
    });
    it('getToolContract(null) para un id inventado', () => {
        expect(getToolContract('send_email')).toBeNull();
    });
    it('getToolArgumentSchema(null) para un id inventado', () => {
        expect(getToolArgumentSchema('send_email')).toBeNull();
    });
});

describe('ToolRegistry: confirmación explícita obligatoria para writes de commitments/proposals (sección 37)', () => {
    it('create_commitment.confirmationPolicy === "explicit" (nunca auto-creado)', () => {
        expect(getToolContract('create_commitment')?.confirmationPolicy).toBe('explicit');
    });
    it('respond_to_proposal.confirmationPolicy === "explicit"', () => {
        expect(getToolContract('respond_to_proposal')?.confirmationPolicy).toBe('explicit');
    });
    it('reads y drafts nunca requieren confirmación', () => {
        for (const id of ['get_person', 'get_commitment', 'draft_message', 'draft_commitment']) {
            expect(getToolContract(id)?.confirmationPolicy).toBe('none');
        }
    });
});

describe('ToolRegistry: side-effect classification (sección 5) — reads/drafts none, writes state_change', () => {
    it('todo READ/DRAFT tiene sideEffectClass "none"', () => {
        for (const [id, contract] of Object.entries(TOOL_REGISTRY)) {
            if (contract.category === 'READ' || contract.category === 'DRAFT') {
                expect(contract.sideEffectClass, id).toBe('none');
            }
        }
    });
    it('todo WRITE tiene sideEffectClass "state_change"', () => {
        for (const [id, contract] of Object.entries(TOOL_REGISTRY)) {
            if (contract.category === 'WRITE') {
                expect(contract.sideEffectClass, id).toBe('state_change');
            }
        }
    });
});

describe('ToolRegistry: authorizationRequirement nunca "none" para un WRITE (sección 6)', () => {
    it('ningún tool WRITE tiene authorizationRequirement "none"', () => {
        for (const [id, contract] of Object.entries(TOOL_REGISTRY)) {
            if (contract.category === 'WRITE') {
                expect(contract.authorizationRequirement, id).not.toBe('none');
            }
        }
    });
});

describe('ToolRegistry: respond_to_proposal nunca acepta un target-participant (sección 41 D/section 32)', () => {
    it('el argument schema no declara ningún campo de "actor objetivo" distinto del actor real', () => {
        expect(getToolContract('respond_to_proposal')?.argumentNames).toEqual(['proposalId', 'decision', 'proposedDueAt']);
        expect(getToolContract('respond_to_proposal')?.argumentNames).not.toContain('targetUserId');
        expect(getToolContract('respond_to_proposal')?.argumentNames).not.toContain('onBehalfOf');
    });
});

describe('ToolRegistry: strict argument schemas rechazan claves desconocidas (sección 11/48)', () => {
    it('get_person rechaza cualquier clave no declarada (forma real de un payload "prototype pollution-shaped", sección 48)', () => {
        const schema = getToolArgumentSchema('get_person')!;
        const withExtraKey = schema.safeParse({ personId: '11111111-1111-4111-8111-111111111111', extraField: 'x' });
        expect(withExtraKey.success).toBe(false);
        const clean = schema.safeParse({ personId: '11111111-1111-4111-8111-111111111111' });
        expect(clean.success).toBe(true);
    });
    it('send_message rechaza content vacío y conversationId no-uuid', () => {
        const schema = getToolArgumentSchema('send_message')!;
        expect(schema.safeParse({ conversationId: 'not-a-uuid', recipientPersonId: '11111111-1111-4111-8111-111111111111', content: 'hola' }).success).toBe(false);
        expect(schema.safeParse({ conversationId: '11111111-1111-4111-8111-111111111111', recipientPersonId: '11111111-1111-4111-8111-111111111111', content: '' }).success).toBe(false);
    });
});

describe('ToolRegistry: versioning (sección 33)', () => {
    it('todo tool declara version >= 1', () => {
        for (const [id, contract] of Object.entries(TOOL_REGISTRY)) {
            expect(contract.version, id).toBeGreaterThanOrEqual(1);
        }
    });
});
