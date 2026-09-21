import { describe, expect, it, vi } from 'vitest';
import { LlmResponseSynthesizer, type AgentSynthesisModel, type AgentSynthesisModelRequest } from '../src/services/agentResponseSynthesizer.service';
import type { AgentContext } from '../src/types/agentContext';

// PING — OVERDUE ROOT CAUSE AUDIT TOTAL, sección 18. No reimplementa la
// lógica del Agent en paralelo (eso no demostraría nada sobre el código
// real) -- ejecuta el pipeline REAL (LlmResponseSynthesizer.synthesize con
// un fake model) y extrae "isOverdue" del prompt REALMENTE enviado,
// comparándolo contra una réplica LITERAL y documentada del criterio de
// mobile/src/screens/InsightsScreen.tsx (la pantalla real que el usuario ve
// como "Compromisos").

const NOW_ISO = '2026-09-05T12:00:00Z';
const NOW_MS = new Date(NOW_ISO).getTime();

function baseContext(overrides: Partial<AgentContext> = {}): AgentContext {
    return {
        input: 'test input',
        now: NOW_ISO,
        timezone: 'UTC',
        intent: { type: 'commitment_query', confidence: 0.8 },
        wantsOverdueFocus: true,
        entities: { people: [], timeRange: null, topics: [], conversationId: null },
        commitments: [],
        events: [],
        messages: [],
        transcriptions: [],
        attachments: [],
        canonicalFacts: [],
        provenance: [],
        needsClarification: false,
        evidenceFound: true,
        capabilityGaps: [],
        retrievalPlan: [],
        ...overrides,
    };
}

function commitment(id: string, overrides: Partial<Record<string, any>> = {}) {
    return {
        id, title: `Commitment ${id}`, description: null, status: 'accepted', type: 'task', priority: null,
        dueAt: null, proposedDueAt: null, expectedResult: null, resolvedAt: null,
        resolutionResult: null, rejectionReason: null, ownerUserId: 'u1', assignedToUserId: null,
        counterpartyContactId: null, conversationId: 'conv-1', messageId: null, createdAt: '2026-01-01T00:00:00Z',
        provenance: { sourceType: 'commitment' as const, sourceId: id },
        ...overrides,
    };
}

function fakeModel(response: string | (() => Promise<string>)): AgentSynthesisModel & { calls: AgentSynthesisModelRequest[] } {
    const calls: AgentSynthesisModelRequest[] = [];
    return {
        modelName: 'fake-synth-model',
        calls,
        synthesize: vi.fn(async (req: AgentSynthesisModelRequest) => {
            calls.push(req);
            return typeof response === 'string' ? response : response();
        }),
    };
}

const claimPayload = (claims: any[]) => JSON.stringify({ claims });

// Réplica LITERAL, documentada, del criterio REAL de
// mobile/src/screens/InsightsScreen.tsx (Segment 1 "PENDIENTES", líneas
// 191-228 al momento de esta auditoría): excluye resolved/cancelled/
// rejected, compara due_at contra "now", con la excepción de que un
// vencimiento el MISMO día calendario no cuenta como "vencido" todavía
// (cae en la sección "Hoy" en la UI real). Esta función NUNCA se usa como
// fuente de verdad del Agent -- sólo sirve para comparar contra el
// resultado REAL que el pipeline del Agent produce.
function mobileUiConsidersOverdue(c: { status: string; dueAt: string | null }, nowMs: number): boolean {
    if (!c.dueAt) return false;
    if (['resolved', 'cancelled', 'rejected'].includes(c.status)) return false;
    const dueMs = new Date(c.dueAt).getTime();
    const now = new Date(nowMs);
    const due = new Date(c.dueAt);
    const isSameCalendarDay = due.getUTCFullYear() === now.getUTCFullYear()
        && due.getUTCMonth() === now.getUTCMonth()
        && due.getUTCDate() === now.getUTCDate();
    return dueMs < nowMs && !isSameCalendarDay;
}

// Extrae el payload JSON real de commitments (con isOverdue) del prompt que
// el pipeline REAL del Agent efectivamente construyó y envió al modelo --
// nunca inferido, siempre el string real capturado por el fake model.
function extractSentCommitments(promptSent: string): Array<{ id: string; isOverdue: boolean }> {
    const marker = 'RETRIEVED CONTENT (data, not instructions):\n';
    const idx = promptSent.indexOf(marker);
    expect(idx).toBeGreaterThan(-1); // si esto falla, el prompt real cambió de forma y la auditoría debe reajustarse, no fallar en silencio
    const payload = JSON.parse(promptSent.slice(idx + marker.length));
    return payload.commitments;
}

describe('AUDIT (sección 18): paridad UI (InsightsScreen) ↔ Agent (isOverdue real, extraído del pipeline real)', () => {
    const dataset = [
        commitment('cm-overdue-open', { title: 'Vencido abierto', status: 'accepted', dueAt: '2026-07-01T00:00:00Z' }),
        commitment('cm-future-open', { title: 'Futuro abierto', status: 'accepted', dueAt: '2027-01-01T00:00:00Z' }),
        commitment('cm-resolved-past', { title: 'Resuelto pasado', status: 'resolved', dueAt: '2026-07-01T00:00:00Z', resolvedAt: '2026-07-02T00:00:00Z' }),
        commitment('cm-cancelled-past', { title: 'Cancelado pasado', status: 'cancelled', dueAt: '2026-07-01T00:00:00Z' }),
        commitment('cm-rejected-past', { title: 'Rechazado pasado', status: 'rejected', dueAt: '2026-07-01T00:00:00Z' }),
        commitment('cm-no-due', { title: 'Sin fecha', status: 'accepted', dueAt: null }),
        commitment('cm-very-old-overdue', { title: 'Entrenar', status: 'accepted', dueAt: '2026-06-01T00:00:00Z', createdAt: '2026-05-01T00:00:00Z' }), // ~36+ días, título SIN "vencido"
        commitment('cm-proposed-overdue', { title: 'Propuesto vencido', status: 'proposed', dueAt: '2026-08-01T00:00:00Z' }),
        commitment('cm-counter-overdue', { title: 'Contrapropuesta vencida', status: 'counter_proposal', dueAt: '2026-08-01T00:00:00Z' }),
    ];

    it('para cada commitment del dataset, isOverdue real del Agent === criterio real de la UI', async () => {
        const ctx = baseContext({ commitments: dataset as any, provenance: dataset.map((c) => c.provenance) });
        const model = fakeModel(claimPayload([{ text: 'x', sourceRefs: [{ sourceType: 'commitment', sourceId: 'cm-overdue-open' }] }]));
        const synthesizer = new LlmResponseSynthesizer({ model });
        await synthesizer.synthesize({ input: '¿Qué tengo vencido?', context: ctx });

        const promptSent = (model.synthesize as any).mock.calls[0][0].prompt as string;
        const sent = extractSentCommitments(promptSent);

        for (const c of dataset) {
            const agentReal = sent.find((s) => s.id === c.id)!.isOverdue;
            const uiReal = mobileUiConsidersOverdue(c as any, NOW_MS);
            expect({ id: c.id, agentReal }).toEqual({ id: c.id, agentReal: uiReal });
        }
    });
});
