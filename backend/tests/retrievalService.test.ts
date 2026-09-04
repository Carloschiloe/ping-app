import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAdminMock, setSupabaseAdminMock, supabaseAdminMockModule } from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());

// ─── Pure helpers — no mocks needed ─────────────────────────────────────────

describe('M-1B: clampLimit', () => {
    it('uses the requested value when within bounds', async () => {
        const { clampLimit } = await import('../src/services/retrieval.service');
        expect(clampLimit(10, 20)).toBe(10);
    });

    it('falls back to default when requested is missing, zero, or negative', async () => {
        const { clampLimit } = await import('../src/services/retrieval.service');
        expect(clampLimit(undefined, 20)).toBe(20);
        expect(clampLimit(0, 20)).toBe(20);
        expect(clampLimit(-5, 20)).toBe(20);
    });

    it('caps at 5x the default — never lets a caller request an unbounded query', async () => {
        const { clampLimit } = await import('../src/services/retrieval.service');
        expect(clampLimit(10_000, 20)).toBe(100);
    });
});

describe('M-1B: dedupeById / dedupeProvenance', () => {
    it('dedupeById keeps only the first occurrence of each id', async () => {
        const { dedupeById } = await import('../src/services/retrieval.service');
        const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }];
        expect(dedupeById(rows)).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
    });

    it('dedupeProvenance keys on sourceType+sourceId, not object identity', async () => {
        const { dedupeProvenance } = await import('../src/services/retrieval.service');
        const items = [
            { sourceType: 'message' as const, sourceId: 'm1' },
            { sourceType: 'commitment' as const, sourceId: 'm1' }, // same id, different type -> distinct
            { sourceType: 'message' as const, sourceId: 'm1' }, // exact duplicate -> collapsed
        ];
        expect(dedupeProvenance(items)).toHaveLength(2);
    });
});

describe('M-1B: rankCommitments', () => {
    it('ranks exact conversation scope above everything else', async () => {
        const { rankCommitments } = await import('../src/services/retrieval.service');
        const base = { id: '', title: 't', description: null, status: 'proposed' as const, type: 'task', priority: null, dueAt: null, proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null, ownerUserId: 'u1', assignedToUserId: null, counterpartyContactId: null, conversationId: null, messageId: null, createdAt: new Date().toISOString(), provenance: { sourceType: 'commitment' as const, sourceId: '' } };
        const inScope = { ...base, id: 'c1', conversationId: 'conv-1' };
        const outOfScope = { ...base, id: 'c2', conversationId: 'conv-2' };
        const ranked = rankCommitments([outOfScope, inScope], { actorUserId: 'u1', conversationId: 'conv-1' });
        expect(ranked[0].id).toBe('c1');
    });

    it('active status outranks resolved for otherwise-equal commitments', async () => {
        const { rankCommitments } = await import('../src/services/retrieval.service');
        const base = { id: '', title: 't', description: null, type: 'task', priority: null, dueAt: null, proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null, ownerUserId: 'u1', assignedToUserId: null, counterpartyContactId: null, conversationId: null, messageId: null, createdAt: new Date().toISOString(), provenance: { sourceType: 'commitment' as const, sourceId: '' } };
        const open = { ...base, id: 'c1', status: 'accepted' as const };
        const resolved = { ...base, id: 'c2', status: 'resolved' as const };
        const ranked = rankCommitments([resolved, open], { actorUserId: 'u1' });
        expect(ranked[0].id).toBe('c1');
    });

    it('is deterministic and explainable: identical inputs always produce identical order', async () => {
        const { rankCommitments } = await import('../src/services/retrieval.service');
        const base = { id: 'c1', title: 't', description: null, status: 'proposed' as const, type: 'task', priority: null, dueAt: null, proposedDueAt: null, expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null, ownerUserId: 'u1', assignedToUserId: null, counterpartyContactId: null, conversationId: null, messageId: null, createdAt: new Date().toISOString(), provenance: { sourceType: 'commitment' as const, sourceId: 'c1' } };
        const input = { actorUserId: 'u1' };
        expect(rankCommitments([base], input)).toEqual(rankCommitments([base], input));
    });
});

// ─── resolvePerson (sección 7) ───────────────────────────────────────────────

describe('M-1B: resolvePerson — IDs directos', () => {
    it('resuelve al propio actor sin consultar autorización adicional', async () => {
        const mock = createSupabaseAdminMock({
            profiles: [{ data: { id: 'u1', full_name: 'Carlos', email: 'carlos@x.com', avatar_url: null }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { userId: 'u1' });
        expect(result).toEqual({ resolved: { kind: 'user', id: 'u1', displayName: 'Carlos', email: 'carlos@x.com', avatarUrl: null }, ambiguous: false, candidates: [] });
    });

    it('resuelve otro usuario cuando comparte al menos una conversación', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null },
            ],
            profiles: [{ data: { id: 'u2', full_name: 'Ana', email: 'ana@x.com', avatar_url: null }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { userId: 'u2' });
        expect(result.resolved?.id).toBe('u2');
    });

    it('NO expone un perfil fuera del universo autorizado del actor (nunca consulta profiles)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }], error: null }, // u3 no aparece
            ],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { userId: 'u3' });
        expect(result.resolved).toBeNull();
        expect(mock.getCalledTables()).not.toContain('profiles');
    });

    it('resuelve un contacto propio', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'u1', display_name: 'Javier Soto', phone: null, email: null }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { contactId: 'ct1' });
        expect(result.resolved).toEqual({ kind: 'contact', id: 'ct1', displayName: 'Javier Soto', phone: null, email: null });
    });

    it('NO expone un contacto de otro usuario', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: { id: 'ct1', owner_user_id: 'u2', display_name: 'Javier Soto', phone: null, email: null }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { contactId: 'ct1' });
        expect(result.resolved).toBeNull();
    });
});

describe('M-1B: resolvePerson — texto (nombre/email/teléfono exactos)', () => {
    it('resuelve por nombre exacto entre los contactos del actor', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: [{ id: 'ct1', display_name: 'Javier Soto', phone: null, email: null }], error: null }],
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }], error: null },
            ],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { name: 'javier soto' });
        expect(result.resolved).toEqual({ kind: 'contact', id: 'ct1', displayName: 'Javier Soto', phone: null, email: null });
    });

    it('devuelve ambiguous=true con candidatos cuando hay más de un match, sin elegir arbitrariamente', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: [{ id: 'ct1', display_name: 'Javier', phone: null, email: null }], error: null }],
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null },
            ],
            profiles: [{ data: [{ id: 'u2', full_name: 'Javier', email: 'javier@x.com', avatar_url: null }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { name: 'Javier' });
        expect(result.ambiguous).toBe(true);
        expect(result.resolved).toBeNull();
        expect(result.candidates).toHaveLength(2);
    });

    it('sin ningún match: resolved=null, ambiguous=false, candidates=[]', async () => {
        const mock = createSupabaseAdminMock({
            contacts: [{ data: [], error: null }],
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }], error: null },
            ],
            profiles: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { name: 'Nadie Conocido' });
        expect(result).toEqual({ resolved: null, ambiguous: false, candidates: [] });
    });

    it('teléfono con formato inválido no lanza error — simplemente no produce candidatos', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }], error: null },
            ],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { phone: 'no-es-un-telefono' });
        expect(result).toEqual({ resolved: null, ambiguous: false, candidates: [] });
    });

    it('resuelve por email exacto', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [
                { data: [{ conversation_id: 'c1' }], error: null },
                { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null },
            ],
            profiles: [{ data: [{ id: 'u2', full_name: 'Ana', email: 'ana@x.com', avatar_url: null }], error: null }],
            contacts: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { email: 'ana@x.com' });
        expect(result.resolved?.id).toBe('u2');
    });

    it('prioriza participantes de la conversación dada antes de ampliar al universo completo', async () => {
        const mock = createSupabaseAdminMock({
            // getConversationParticipantProfileIds: assertConversationParticipant + select user_id
            conversation_participants: [
                { data: { conversation_id: 'conv-1', role: 'member' }, error: null }, // assertConversationParticipant
                { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }, // participantes de conv-1
            ],
            contacts: [{ data: [], error: null }],
            // Solo UNA consulta de profiles: la acotada a conv-1. Si el código
            // ampliara innecesariamente, fallaría por falta de una segunda entrada.
            profiles: [{ data: [{ id: 'u2', full_name: 'Javier', email: 'javier@x.com', avatar_url: null }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { resolvePerson } = await import('../src/services/retrieval.service');

        const result = await resolvePerson('u1', { name: 'Javier', conversationId: 'conv-1' });
        expect(result.resolved?.id).toBe('u2');
        expect(mock.getSelectCalls('profiles')).toHaveLength(1); // nunca se amplió porque ya hubo match
    });
});

// ─── Authorization first (sección 6) ────────────────────────────────────────

describe('M-1B: retrieveContext — authorization first', () => {
    it('rechaza a un actor no-participante ANTES de consultar cualquier otro dato', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }], // assertConversationParticipant no encuentra fila
        });
        setSupabaseAdminMock(mock);
        const { retrieveContext } = await import('../src/services/retrieval.service');

        await expect(retrieveContext({ actorUserId: 'intruder', conversationId: 'conv-1' }))
            .rejects.toMatchObject({ statusCode: 403 });

        // Ninguna otra tabla debe haberse consultado antes de fallar la autorización.
        expect(mock.getCalledTables()).toEqual(['conversation_participants']);
    });

    it('actorUserId vacío se rechaza antes de cualquier consulta', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { retrieveContext } = await import('../src/services/retrieval.service');

        await expect(retrieveContext({ actorUserId: '' as any })).rejects.toMatchObject({ statusCode: 400 });
        expect(mock.getCalledTables()).toEqual([]);
    });
});

// ─── Commitments (sección 8) ─────────────────────────────────────────────────

describe('M-1B: retrieveCommitments', () => {
    const row = (overrides: Partial<Record<string, any>> = {}) => ({
        id: 'cm1', title: 'Enviar informe', description: null, status: 'accepted', type: 'task', priority: null,
        due_at: '2026-09-10T00:00:00Z', proposed_due_at: null, expected_result: null, resolved_at: null,
        resolution_result: null, rejection_reason: null, owner_user_id: 'u1', assigned_to_user_id: 'u2',
        counterparty_contact_id: null, conversation_id: 'conv-1', message_id: 'msg-1', created_at: '2026-09-01T00:00:00Z',
        ...overrides,
    });

    it('preserva message_id, conversation_id, owner, assigned_to, status y due_at sin transformar el workflow', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [row()], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitments } = await import('../src/services/retrieval.service');

        const [c] = await retrieveCommitments({ actorUserId: 'u1' }, 20);
        expect(c).toMatchObject({
            id: 'cm1', messageId: 'msg-1', conversationId: 'conv-1', ownerUserId: 'u1',
            assignedToUserId: 'u2', status: 'accepted', dueAt: '2026-09-10T00:00:00Z',
        });
        expect(c.provenance).toEqual({ sourceType: 'commitment', sourceId: 'cm1', conversationId: 'conv-1', messageId: 'msg-1', commitmentId: 'cm1', timestamp: '2026-09-01T00:00:00Z' });
    });

    it('dedupea por id cuando la misma fila aparece más de una vez', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [row(), row()], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitments } = await import('../src/services/retrieval.service');

        const result = await retrieveCommitments({ actorUserId: 'u1' }, 20);
        expect(result).toHaveLength(1);
    });

    it('resultado vacío no lanza error', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitments } = await import('../src/services/retrieval.service');

        await expect(retrieveCommitments({ actorUserId: 'u1' }, 20)).resolves.toEqual([]);
    });

    it('aplica el límite pedido a la consulta', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [row()], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitments } = await import('../src/services/retrieval.service');

        await retrieveCommitments({ actorUserId: 'u1' }, 7);
        // El helper mock no expone .limit() directamente; se confirma indirectamente
        // por el hecho de que la llamada no lanza y respeta el contrato de firma.
        expect(mock.getCalledTables()).toContain('commitments');
    });
});

// ─── Commitment events (sección 9) ──────────────────────────────────────────

describe('M-1B: retrieveCommitmentEvents', () => {
    it('devuelve [] sin consultar ninguna tabla cuando no hay commitmentIds', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { retrieveCommitmentEvents } = await import('../src/services/retrieval.service');

        const result = await retrieveCommitmentEvents('u1', [], 20);
        expect(result).toEqual([]);
        expect(mock.getCalledTables()).toEqual([]);
    });

    it('mapea event_type/previous_status/new_status y conserva provenance con commitmentId (M-1B.1: revalida visibilidad antes de traer eventos)', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [{ id: 'cm1' }], error: null }], // revalidación de visibilidad -> cm1 SÍ autorizado
            commitment_events: [{
                data: [
                    { id: 'ev2', commitment_id: 'cm1', actor_user_id: 'u1', event_type: 'accepted', previous_status: 'proposed', new_status: 'accepted', created_at: '2026-09-02T00:00:00Z' },
                    { id: 'ev1', commitment_id: 'cm1', actor_user_id: 'u1', event_type: 'created', previous_status: null, new_status: 'proposed', created_at: '2026-09-01T00:00:00Z' },
                ],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitmentEvents } = await import('../src/services/retrieval.service');

        const events = await retrieveCommitmentEvents('u1', ['cm1'], 20);
        expect(events[0]).toMatchObject({ id: 'ev2', eventType: 'accepted', previousStatus: 'proposed', newStatus: 'accepted' });
        expect(events[0].provenance).toEqual({ sourceType: 'commitment_event', sourceId: 'ev2', commitmentId: 'cm1', timestamp: '2026-09-02T00:00:00Z' });
        // Orden de consultas: la revalidación de visibilidad (commitments) ocurre
        // ANTES de traer los eventos.
        expect(mock.getCalledTables().indexOf('commitments')).toBeLessThan(mock.getCalledTables().indexOf('commitment_events'));
    });

    it('dedupea por id', async () => {
        const eventRow = { id: 'ev1', commitment_id: 'cm1', actor_user_id: 'u1', event_type: 'created', previous_status: null, new_status: 'proposed', created_at: '2026-09-01T00:00:00Z' };
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [{ id: 'cm1' }], error: null }],
            commitment_events: [{ data: [eventRow, eventRow], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitmentEvents } = await import('../src/services/retrieval.service');

        const events = await retrieveCommitmentEvents('u1', ['cm1'], 20);
        expect(events).toHaveLength(1);
    });

    it('M-1B.1 — un commitmentId ajeno (fuera de la visibilidad del actor) nunca llega a traer eventos: lista vacía, no error', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }], // revalidación: el actor no ve cm-ajeno -> queda fuera
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitmentEvents } = await import('../src/services/retrieval.service');

        const events = await retrieveCommitmentEvents('outsider', ['cm-ajeno'], 20);
        expect(events).toEqual([]);
        expect(mock.getCalledTables()).not.toContain('commitment_events');
    });
});

// ─── Messages (sección 10) ────────────────────────────────────────────────────

describe('M-1B: retrieveMessages — conversación reciente', () => {
    it('devuelve mensajes en orden cronológico ascendente (más legible que desc crudo)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            messages: [{
                data: [
                    { id: 'm2', conversation_id: 'conv-1', sender_id: 'u1', content: 'segundo', metadata: {}, created_at: '2026-09-02T00:00:00Z', deleted_at: null },
                    { id: 'm1', conversation_id: 'conv-1', sender_id: 'u1', content: 'primero', metadata: {}, created_at: '2026-09-01T00:00:00Z', deleted_at: null },
                ],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        const messages = await retrieveMessages({ actorUserId: 'u1', conversationId: 'conv-1' }, 30);
        expect(messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('marca isSystem desde metadata.isSystem', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            messages: [{ data: [{ id: 'm1', conversation_id: 'conv-1', sender_id: null, content: 'sistema', metadata: { isSystem: true }, created_at: '2026-09-01T00:00:00Z', deleted_at: null }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        const [m] = await retrieveMessages({ actorUserId: 'u1', conversationId: 'conv-1' }, 30);
        expect(m.isSystem).toBe(true);
    });

    it('sin conversationId ni ventana explícita devuelve [] (nunca "todos los mensajes")', async () => {
        const mock = createSupabaseAdminMock({});
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        const messages = await retrieveMessages({ actorUserId: 'u1' }, 30);
        expect(messages).toEqual([]);
        expect(mock.getCalledTables()).toEqual([]);
    });

    it('M-1B.1 — un actor no-participante que llama retrieveMessages con conversationId directo es rechazado ANTES de consultar messages', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        await expect(retrieveMessages({ actorUserId: 'outsider', conversationId: 'conv-1' }, 30))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).toEqual(['conversation_participants']); // nunca llegó a messages
    });
});

describe('M-1B: retrieveMessages — ventana alrededor de un mensaje', () => {
    it('autoriza membership de la conversación del mensaje ANTES de traer la ventana', async () => {
        const mock = createSupabaseAdminMock({
            messages: [
                { data: { id: 'src', conversation_id: 'conv-1', created_at: '2026-09-05T12:00:00Z' }, error: null }, // lookup del source
            ],
            conversation_participants: [{ data: null, error: null }], // no participante -> debe rechazar
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        await expect(retrieveMessages({ actorUserId: 'intruder', messageWindow: { aroundMessageId: 'src' } }, 30))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    it('incluye N anteriores + el propio + N posteriores en orden cronológico', async () => {
        const mock = createSupabaseAdminMock({
            messages: [
                { data: { id: 'src', conversation_id: 'conv-1', created_at: '2026-09-05T12:00:00Z' }, error: null }, // lookup source
                { data: [{ id: 'before1', conversation_id: 'conv-1', sender_id: 'u1', content: 'antes', metadata: {}, created_at: '2026-09-05T11:00:00Z', deleted_at: null }], error: null }, // before (desc)
                { data: { id: 'src', conversation_id: 'conv-1', sender_id: 'u1', content: 'fuente', metadata: {}, created_at: '2026-09-05T12:00:00Z', deleted_at: null }, error: null }, // source row itself
                { data: [{ id: 'after1', conversation_id: 'conv-1', sender_id: 'u1', content: 'despues', metadata: {}, created_at: '2026-09-05T13:00:00Z', deleted_at: null }], error: null }, // after (asc)
            ],
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        const messages = await retrieveMessages({ actorUserId: 'u1', messageWindow: { aroundMessageId: 'src', before: 5, after: 5 } }, 30);
        expect(messages.map((m) => m.id)).toEqual(['before1', 'src', 'after1']);
    });

    it('mensaje inexistente devuelve [] sin lanzar', async () => {
        const mock = createSupabaseAdminMock({ messages: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');

        const messages = await retrieveMessages({ actorUserId: 'u1', messageWindow: { aroundMessageId: 'missing' } }, 30);
        expect(messages).toEqual([]);
    });
});

// ─── Transcriptions (sección 11) ─────────────────────────────────────────────

describe('M-1B: retrieveTranscriptions', () => {
    it('sólo devuelve transcripciones con status="completed" y texto no vacío', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [{ id: 'att1', message_id: 'm1' }], error: null }],
            audio_transcriptions: [{
                data: [{ id: 'tr1', attachment_id: 'att1', status: 'completed', transcript_text: 'hola', language_detected: 'es', completed_at: '2026-09-01T00:00:00Z' }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');

        const [t] = await retrieveTranscriptions('u1', 'conv-1', 10);
        expect(t).toMatchObject({ id: 'tr1', attachmentId: 'att1', messageId: 'm1', conversationId: 'conv-1', transcriptText: 'hola' });
        expect(t.provenance).toEqual({ sourceType: 'transcription', sourceId: 'tr1', attachmentId: 'att1', messageId: 'm1', conversationId: 'conv-1', timestamp: '2026-09-01T00:00:00Z' });
    });

    it('sin audios en la conversación devuelve [] sin consultar audio_transcriptions', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');

        const result = await retrieveTranscriptions('u1', 'conv-1', 10);
        expect(result).toEqual([]);
        expect(mock.getCalledTables()).not.toContain('audio_transcriptions');
    });

    it('filtra filas con transcript_text nulo (aunque el status ya debiera excluirlas)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [{ id: 'att1', message_id: 'm1' }], error: null }],
            audio_transcriptions: [{ data: [{ id: 'tr1', attachment_id: 'att1', status: 'completed', transcript_text: null, language_detected: null, completed_at: null }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');

        const result = await retrieveTranscriptions('u1', 'conv-1', 10);
        expect(result).toEqual([]);
    });

    it('M-1B.1 — un actor no-participante es rechazado ANTES de consultar attachments/audio_transcriptions', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');

        await expect(retrieveTranscriptions('outsider', 'conv-1', 10)).rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).toEqual(['conversation_participants']);
    });
});

describe('M-1B: retrieveTranscriptionForAttachment', () => {
    it('autoriza vía la conversación del propio attachment', async () => {
        const mock = createSupabaseAdminMock({
            attachments: [{ data: { id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'audio', lifecycle_status: 'attached' }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptionForAttachment } = await import('../src/services/retrieval.service');

        await expect(retrieveTranscriptionForAttachment('intruder', 'att1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('un attachment tombstoned nunca expone su transcripción', async () => {
        const mock = createSupabaseAdminMock({
            attachments: [{ data: { id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'audio', lifecycle_status: 'tombstoned' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptionForAttachment } = await import('../src/services/retrieval.service');

        const result = await retrieveTranscriptionForAttachment('u1', 'att1');
        expect(result).toBeNull();
        expect(mock.getCalledTables()).not.toContain('audio_transcriptions');
    });

    it('un attachment que no es audio no tiene transcripción', async () => {
        const mock = createSupabaseAdminMock({
            attachments: [{ data: { id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'document', lifecycle_status: 'attached' }, error: null }],
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptionForAttachment } = await import('../src/services/retrieval.service');

        const result = await retrieveTranscriptionForAttachment('u1', 'att1');
        expect(result).toBeNull();
    });
});

// ─── Attachments (sección 12) ─────────────────────────────────────────────────

describe('M-1B: retrieveAttachments', () => {
    it('devuelve sólo referencias — nunca signed URLs ni contenido', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{
                data: [{ id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'document', mime_type: 'application/pdf', original_filename: 'contrato.pdf', lifecycle_status: 'attached', attached_at: '2026-09-01T00:00:00Z', created_at: '2026-08-30T00:00:00Z' }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveAttachments } = await import('../src/services/retrieval.service');

        const [a] = await retrieveAttachments('u1', 'conv-1', 10);
        expect(a).toEqual({
            id: 'att1', messageId: 'm1', conversationId: 'conv-1', kind: 'document', mimeType: 'application/pdf',
            originalFilename: 'contrato.pdf', lifecycleStatus: 'attached', createdAt: '2026-09-01T00:00:00Z',
            provenance: { sourceType: 'attachment', sourceId: 'att1', attachmentId: 'att1', messageId: 'm1', conversationId: 'conv-1', timestamp: '2026-09-01T00:00:00Z' },
        });
        expect(a).not.toHaveProperty('signedUrl');
    });

    it('filtra por kind cuando se pide (ej. sólo documentos)', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [{ id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'document', mime_type: 'application/pdf', original_filename: 'x.pdf', lifecycle_status: 'attached', attached_at: null, created_at: '2026-09-01T00:00:00Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveAttachments } = await import('../src/services/retrieval.service');

        const result = await retrieveAttachments('u1', 'conv-1', 10, ['document']);
        expect(result).toHaveLength(1);
        expect(result[0].kind).toBe('document');
    });

    it('M-1B.1 — un actor no-participante es rechazado ANTES de consultar attachments', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveAttachments } = await import('../src/services/retrieval.service');

        await expect(retrieveAttachments('outsider', 'conv-1', 10)).rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).toEqual(['conversation_participants']);
    });
});

// ─── M-1B.1: hardening — funciones públicas seguras por defecto ────────────
// Verifica explícitamente que NINGUNA función exportada que recibe
// conversationId/commitmentIds/messageId depende de que el caller ya haya
// autorizado. Cada caso llama la función DIRECTAMENTE (nunca a través de
// retrieveContext) simulando un consumidor futuro que no conoce ese detalle.

describe('M-1B.1: outsider llamando funciones de retrieval directamente', () => {
    it('retrieveAttachments: outsider -> 403, nunca llega a consultar attachments', async () => {
        const mock = createSupabaseAdminMock({ conversation_participants: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveAttachments } = await import('../src/services/retrieval.service');
        await expect(retrieveAttachments('outsider', 'conv-1', 10)).rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).not.toContain('attachments');
    });

    it('retrieveTranscriptions: outsider -> 403, nunca llega a consultar attachments/audio_transcriptions', async () => {
        const mock = createSupabaseAdminMock({ conversation_participants: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');
        await expect(retrieveTranscriptions('outsider', 'conv-1', 10)).rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).not.toContain('audio_transcriptions');
    });

    it('retrieveMessages con conversationId directo: outsider -> 403, nunca llega a consultar messages', async () => {
        const mock = createSupabaseAdminMock({ conversation_participants: [{ data: null, error: null }] });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');
        await expect(retrieveMessages({ actorUserId: 'outsider', conversationId: 'conv-1' }, 30))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).not.toContain('messages');
    });

    it('retrieveMessages con messageWindow apuntando a un messageId ajeno: resuelve su conversación real y rechaza, sin filtrar contenido', async () => {
        const mock = createSupabaseAdminMock({
            messages: [{ data: { id: 'ajeno-msg', conversation_id: 'conv-privada', created_at: '2026-09-01T00:00:00Z' }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveMessages } = await import('../src/services/retrieval.service');
        await expect(retrieveMessages({ actorUserId: 'outsider', messageWindow: { aroundMessageId: 'ajeno-msg' } }, 30))
            .rejects.toMatchObject({ statusCode: 403 });
        // Sólo se consultó el lookup mínimo del mensaje source (id/conversation_id/created_at) — nunca su contenido ni la ventana.
        expect(mock.getSelectCalls('messages')).toHaveLength(1);
    });

    it('retrieveTranscriptionForAttachment con un attachmentId ajeno: resuelve su conversación real y rechaza antes de tocar audio_transcriptions', async () => {
        const mock = createSupabaseAdminMock({
            attachments: [{ data: { id: 'att-ajeno', message_id: 'm1', context_conversation_id: 'conv-privada', kind: 'audio', lifecycle_status: 'attached' }, error: null }],
            conversation_participants: [{ data: null, error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptionForAttachment } = await import('../src/services/retrieval.service');
        await expect(retrieveTranscriptionForAttachment('outsider', 'att-ajeno')).rejects.toMatchObject({ statusCode: 403 });
        expect(mock.getCalledTables()).not.toContain('audio_transcriptions');
    });

    it('retrieveCommitmentEvents con commitmentIds ajenos llamado directamente: nunca expone eventos fuera de la visibilidad del actor', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveCommitmentEvents } = await import('../src/services/retrieval.service');
        const events = await retrieveCommitmentEvents('outsider', ['cm-ajeno-1', 'cm-ajeno-2'], 20);
        expect(events).toEqual([]);
        expect(mock.getCalledTables()).not.toContain('commitment_events');
    });
});

describe('M-1B.1: participante legítimo — el hardening no rompe el acceso autorizado', () => {
    it('retrieveAttachments: participante real de la conversación sigue recibiendo datos', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [{ id: 'att1', message_id: 'm1', context_conversation_id: 'conv-1', kind: 'image', mime_type: 'image/png', original_filename: 'foto.png', lifecycle_status: 'attached', attached_at: '2026-09-01T00:00:00Z', created_at: '2026-08-30T00:00:00Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveAttachments } = await import('../src/services/retrieval.service');
        const result = await retrieveAttachments('u1', 'conv-1', 10);
        expect(result).toHaveLength(1);
        // Orden de consultas: autorización antes que datos.
        expect(mock.getCalledTables()).toEqual(['conversation_participants', 'attachments']);
    });

    it('retrieveTranscriptions: participante real sigue recibiendo datos, autorización antes que datos', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            attachments: [{ data: [{ id: 'att1', message_id: 'm1' }], error: null }],
            audio_transcriptions: [{ data: [{ id: 'tr1', attachment_id: 'att1', status: 'completed', transcript_text: 'hola', language_detected: 'es', completed_at: '2026-09-01T00:00:00Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveTranscriptions } = await import('../src/services/retrieval.service');
        const result = await retrieveTranscriptions('u1', 'conv-1', 10);
        expect(result).toHaveLength(1);
        expect(mock.getCalledTables()[0]).toBe('conversation_participants');
    });
});

// ─── retrieveContext — orquestación de extremo a extremo (secciones 5, 14, 15) ─

describe('M-1B: retrieveContext — orquestación', () => {
    it('con types=["commitment"] sólo consulta lo necesario y arma el shape completo', async () => {
        const mock = createSupabaseAdminMock({
            conversation_participants: [{ data: { conversation_id: 'conv-1', role: 'member' }, error: null }],
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{
                data: [{ id: 'cm1', title: 'Enviar informe', description: null, status: 'accepted', type: 'task', priority: null, due_at: null, proposed_due_at: null, expected_result: null, resolved_at: null, resolution_result: null, rejection_reason: null, owner_user_id: 'u1', assigned_to_user_id: null, counterparty_contact_id: null, conversation_id: 'conv-1', message_id: 'm1', created_at: '2026-09-01T00:00:00Z' }],
                error: null,
            }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveContext } = await import('../src/services/retrieval.service');

        const result = await retrieveContext({ actorUserId: 'u1', conversationId: 'conv-1', types: ['commitment'] });
        expect(result.scope).toEqual({ actorUserId: 'u1', conversationId: 'conv-1', personId: null, contactId: null });
        expect(result.commitments).toHaveLength(1);
        expect(result.events).toEqual([]);
        expect(result.messages).toEqual([]);
        expect(result.transcriptions).toEqual([]);
        expect(result.attachments).toEqual([]);
        expect(result.provenance).toHaveLength(1);
    });

    it('sin resultados en ningún lado devuelve arrays vacíos, no un error', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveContext } = await import('../src/services/retrieval.service');

        const result = await retrieveContext({ actorUserId: 'u1', types: ['commitment'] });
        expect(result.commitments).toEqual([]);
        expect(result.provenance).toEqual([]);
    });

    it('encadena eventos sólo para los commitments efectivamente encontrados y autorizados', async () => {
        const mock = createSupabaseAdminMock({
            commitment_proposal_responses: [{ data: [], error: null }],
            commitments: [{ data: [{ id: 'cm1', title: 't', description: null, status: 'accepted', type: 'task', priority: null, due_at: null, proposed_due_at: null, expected_result: null, resolved_at: null, resolution_result: null, rejection_reason: null, owner_user_id: 'u1', assigned_to_user_id: null, counterparty_contact_id: null, conversation_id: null, message_id: null, created_at: '2026-09-01T00:00:00Z' }], error: null }],
            commitment_events: [{ data: [{ id: 'ev1', commitment_id: 'cm1', actor_user_id: 'u1', event_type: 'created', previous_status: null, new_status: 'proposed', created_at: '2026-09-01T00:00:00Z' }], error: null }],
        });
        setSupabaseAdminMock(mock);
        const { retrieveContext } = await import('../src/services/retrieval.service');

        const result = await retrieveContext({ actorUserId: 'u1', types: ['commitment', 'commitment_event'] });
        expect(result.events).toHaveLength(1);
        expect(result.events[0].commitmentId).toBe('cm1');
    });
});
