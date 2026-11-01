import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('expo-localization', () => ({
    getLocales: vi.fn(() => [{ languageTag: 'es-CL', languageCode: 'es', regionCode: 'CL' }]),
}));
vi.mock('expo-device', () => ({
    DeviceType: { TABLET: 2 },
    deviceType: null,
}));
vi.mock('expo-file-system', () => ({ File: class MockFile { constructor(public uri: string) {} } }));
vi.mock('../src/api/client', () => {
    class MockApiError extends Error {
        constructor(
            message: string,
            public status: number | null,
            public resultUnknown: boolean,
            public code?: string,
        ) { super(message); }
    }
    return {
        apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), patch: vi.fn() },
        ApiError: MockApiError,
        AGENT_TURN_REQUEST_TIMEOUT_MS: 45_000,
        API_URL: 'http://localhost:3000/api',
        getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer test' })),
    };
});

import { apiClient } from '../src/api/client';
import {
    adapterSurfaceForTurn, buildAgentSurfaceTurnRequest, parseAgentConversationTurns, parseAgentTurnResult,
    publicPingSurface, requestAgentSurfaceTurn, surfaceForDeviceType,
} from '../src/api/query-modules/agent';
import { appendAgentTurnMessage, isLatestAgentMessage, restoreAgentConversationMessages } from '../src/utils/agentChat';

const answer = (text: string) => ({ kind: 'response' as const, response: { status: 'answered' as const, answer: text, citations: [] } });

describe('Agent Turn API boundary', () => {
    it('sends a surface-neutral turn through one network adapter', async () => {
        vi.mocked(apiClient.post).mockResolvedValueOnce(answer('Hola'));
        const result = await requestAgentSurfaceTurn({
            surface: 'tablet', input: 'hola tablet', idempotencyKey: 'tablet-turn-1',
        });
        expect(result).toEqual(answer('Hola'));
        expect(apiClient.post).toHaveBeenCalledWith(
            '/agent/turn',
            expect.objectContaining({ input: 'hola tablet', channel: 'tablet' }),
            { 'Idempotency-Key': 'tablet-turn-1' },
            { timeoutMs: 45_000 },
        );
    });

    it('text, signed voice and reviewed voice share one request contract; the retry key is a header only', () => {
        expect(buildAgentSurfaceTurnRequest({
            surface: 'tablet', input: ' hablar con Ping ', idempotencyKey: 'tablet-turn-1',
        })).toEqual({
            body: expect.objectContaining({ input: 'hablar con Ping', channel: 'tablet' }),
            headers: { 'Idempotency-Key': 'tablet-turn-1' },
        });
        expect(buildAgentSurfaceTurnRequest({
            surface: 'mobile_voice', voiceInputToken: 'signed-voice-token', idempotencyKey: 'voice-turn-1',
        })).toEqual({
            body: { voiceInputToken: 'signed-voice-token' },
            headers: { 'Idempotency-Key': 'voice-turn-1' },
        });
        expect(buildAgentSurfaceTurnRequest({
            surface: 'mobile_text', input: 'recuérdame revisar el audio', reviewedVoiceInputToken: 'signed-token',
        }).body).toEqual({ input: 'recuérdame revisar el audio', reviewedVoiceInputToken: 'signed-token' });
        expect(adapterSurfaceForTurn({ input: 'tablet', channel: 'tablet' })).toBe('tablet');
        expect(adapterSurfaceForTurn({ voiceInputToken: 'voice' })).toBe('mobile_voice');
        expect(publicPingSurface()).toBe('mobile_text');
        expect(surfaceForDeviceType(2, 2)).toBe('tablet');
    });

    it('rejects a malformed answer instead of rendering it', () => {
        expect(() => parseAgentTurnResult({ kind: 'response', response: { status: 'nope', answer: 'x', citations: [] } })).toThrow();
        expect(() => parseAgentTurnResult({ kind: 'mystery' })).toThrow('invalid_agent_turn_shape');
    });

    it('keeps the "something changed" signal only when the server sends it', () => {
        expect(parseAgentTurnResult({ ...answer('Listo.'), changed: true }).changed).toBe(true);
        expect(parseAgentTurnResult({ ...answer('Hola'), changed: 'yes' })).not.toHaveProperty('changed');
    });

    it('shows turns saved before the assistant as plain text, never as something to confirm', () => {
        const history = parseAgentConversationTurns({
            enabled: true,
            turns: [
                ['plan', { kind: 'plan', plan: { planId: 'p' }, presentation: { summary: 'Crearé el compromiso.' } }],
                ['clarification', { kind: 'clarification', questions: [{ field: 'x', question: '¿Cuál?' }] }],
                ['unsupported', { kind: 'unsupported', reason: 'No disponible.' }],
                ['execution', { kind: 'execution', execution: { humanReadableSummary: 'Compromiso creado.' }, presentation: {} }],
                ['read', { kind: 'read', execution: {} }],
                ['response', answer('Tienes uno.')],
            ].map(([kind, result], index) => ({
                id: `t${index}`, conversationId: 'c', actorUserId: 'u', clientTurnKey: `k${index}`,
                inputText: 'hola', inputMode: 'text', resultKind: kind, result, createdAt: new Date(index).toISOString(),
            })),
        });
        expect(history.turns.map((turn) => turn.result.response.answer))
            .toEqual(['Crearé el compromiso.', '¿Cuál?', 'No disponible.', 'Compromiso creado.', 'Tienes uno.']);
        const messages = restoreAgentConversationMessages(history.turns);
        expect(messages).toHaveLength(10);
        expect(messages.every((message) => !message.pendingActions)).toBe(true);
        expect(messages[1]).toMatchObject({ id: 't0:result', role: 'agent', text: 'Crearé el compromiso.' });
    });

    const screen = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf8');
    const agentApi = fs.readFileSync(path.join(__dirname, '../src/api/query-modules/agent.ts'), 'utf8');

    it('Agent Preview submits both text and voice through useAgentTurn', () => {
        expect(screen).toContain('useAgentTurn');
        expect(screen).toContain('input: trimmed, reviewedVoiceInputToken: matchingVoiceDraft.token, idempotencyKey');
        expect(screen).toContain('useSelfConversationId');
        expect(screen).toContain('historyConversationId');
    });

    it('refreshes commitment views after a confirmed change in chat or a voice session', () => {
        expect(agentApi).toMatch(/onSuccess: \(result\) => \{\s*if \(!result\.changed\) return;\s*invalidateCommitmentViews\(queryClient, \{\s*includeAgreementProposals: true,\s*includeAgentTurns: true,/);
        expect(screen).toContain('invalidateCommitmentViews(queryClient, { includeAgreementProposals: true, includeAgentTurns: true })');
    });

    it('no longer talks to the removed plan routes', () => {
        for (const route of ['/agent/respond', '/agent/authorize', '/agent/execute', '/agent/plan']) {
            expect(agentApi).not.toContain(route);
        }
    });
});

describe('M9 assistant Confirm/Cancel buttons', () => {
    it('sends the decision with the button label as a text turn', () => {
        const request = buildAgentSurfaceTurnRequest({
            surface: 'mobile_text', input: 'Confirmar', idempotencyKey: 'k1',
            actionDecision: { action: 'a2', decision: 'confirm' },
        });
        expect(request.body).toMatchObject({ input: 'Confirmar', channel: 'mobile', actionDecision: { action: 'a2', decision: 'confirm' } });
        expect(request.headers['Idempotency-Key']).toBe('k1');
        expect(buildAgentSurfaceTurnRequest({ surface: 'mobile_text', input: 'hola' }).body).not.toHaveProperty('actionDecision');
    });

    it('keeps well-formed pending actions on the answer and shows buttons only on the latest one', () => {
        const result = parseAgentTurnResult({
            kind: 'response',
            response: { status: 'answered', answer: '¿Lo agendo?', citations: [] },
            pendingActions: [{ ref: 'a1', summary: 'Crear «x» el lunes a las 11:00' }, { ref: 7 }],
        });
        expect(result.pendingActions).toEqual([{ ref: 'a1', summary: 'Crear «x» el lunes a las 11:00' }]);
        const plain = parseAgentTurnResult({ kind: 'response', response: { status: 'answered', answer: 'Hola', citations: [] }, pendingActions: 'x' });
        expect(plain).not.toHaveProperty('pendingActions');

        const messages = appendAgentTurnMessage([], result);
        expect(messages[0].pendingActions).toHaveLength(1);
        expect(isLatestAgentMessage(messages, messages[0].id)).toBe(true);
        const later = appendAgentTurnMessage(messages, plain);
        expect(isLatestAgentMessage(later, messages[0].id)).toBe(false);
    });
});
