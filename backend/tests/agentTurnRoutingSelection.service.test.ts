import { describe, expect, it, vi } from 'vitest';
import { AgentTurnRoutingSelectionService, READ_V4_EXACT_COUNT_OPT_IN } from '../src/services/agentTurnRoutingSelection.service';
import type { AgentTurnAdmission } from '../src/types/agentTurnAdmission';

const admission = (overrides: Partial<AgentTurnAdmission> = {}): AgentTurnAdmission => ({
    turnId: 'turn-1', actorUserId: 'actor-1', dialogueScopeKey: 'scope-1', clientTurnKey: 'key-1',
    requestFingerprint: 'f'.repeat(64), turnSequence: 1, status: 'accepted', failureClass: null,
    resultRef: null, createdAt: '', updatedAt: '', completedAt: null, expiresAt: '',
    idempotentReplay: false, routingMode: 'legacy', ...overrides,
});

const input = (overrides: Record<string, unknown> = {}) => ({
    server: { actorUserId: 'actor-1', dialogueScopeKey: 'scope-1' },
    request: { idempotencyKey: 'key-1', semanticRequest: { input: 'opaque canonical request' }, ...overrides },
});

describe('M-7 server routing selection boundary', () => {
    it.each([
        ['staging + enabled + explicit opt-in', { environmentName: 'staging', readV4ExactCountEnabled: true }, READ_V4_EXACT_COUNT_OPT_IN, 'read_v4_exact_count'],
        ['disabled flag', { environmentName: 'staging', readV4ExactCountEnabled: false }, READ_V4_EXACT_COUNT_OPT_IN, 'legacy'],
        ['wrong environment', { environmentName: 'production', readV4ExactCountEnabled: true }, READ_V4_EXACT_COUNT_OPT_IN, 'legacy'],
        ['missing opt-in', { environmentName: 'staging', readV4ExactCountEnabled: true }, undefined, 'legacy'],
        ['invalid opt-in', { environmentName: 'staging', readV4ExactCountEnabled: true }, 'commitment_count_v4_extra', 'legacy'],
    ])('%s selects the safe candidate mode', async (_name, config, readCapability, expected) => {
        const admit = vi.fn().mockResolvedValue(admission({ routingMode: expected as 'legacy' | 'read_v4_exact_count' }));
        const service = new AgentTurnRoutingSelectionService({ admit }, () => config);
        const result = await service.selectAndAdmit(input({ readCapability }));
        expect(result.routingMode).toBe(expected);
        expect(admit).toHaveBeenCalledWith(expect.objectContaining({ routingMode: expected }));
    });

    it('recovers the stored mode before a changed flag can affect a retry', async () => {
        const admit = vi.fn().mockResolvedValue(admission({ routingMode: 'read_v4_exact_count', idempotentReplay: true }));
        const service = new AgentTurnRoutingSelectionService({ admit }, () => ({ environmentName: 'production', readV4ExactCountEnabled: false }));
        const result = await service.selectAndAdmit(input({ readCapability: undefined }));
        expect(result.routingMode).toBe('read_v4_exact_count');
        expect(result.newlySelected).toBe(false);
        expect(admit).toHaveBeenCalledTimes(1);
    });

    it('passes only server actor/scope and excludes requestId/traceId from durable admission', async () => {
        const admit = vi.fn().mockResolvedValue(admission());
        const service = new AgentTurnRoutingSelectionService({ admit }, () => ({ environmentName: 'staging', readV4ExactCountEnabled: true }));
        await service.selectAndAdmit({
            server: { actorUserId: 'trusted-actor', dialogueScopeKey: 'trusted-scope' },
            request: { idempotencyKey: 'stable-key', readCapability: READ_V4_EXACT_COUNT_OPT_IN, semanticRequest: { input: 'request' } },
        });
        expect(admit).toHaveBeenCalledWith({
            actorUserId: 'trusted-actor', dialogueScopeKey: 'trusted-scope', clientTurnKey: 'stable-key',
            semanticRequest: { input: 'request' }, routingMode: 'read_v4_exact_count',
        });
        expect(admit.mock.calls[0][0]).not.toHaveProperty('requestId');
        expect(admit.mock.calls[0][0]).not.toHaveProperty('traceId');
    });

    it.each([
        ['actorUserId', { server: { actorUserId: '', dialogueScopeKey: 'scope-1' } }],
        ['dialogueScopeKey', { server: { actorUserId: 'actor-1', dialogueScopeKey: '' } }],
        ['idempotencyKey', { request: { idempotencyKey: '   ', semanticRequest: {} } }],
    ])('rejects invalid %s before admission', async (_name, overrides) => {
        const admit = vi.fn();
        const service = new AgentTurnRoutingSelectionService({ admit }, () => ({ environmentName: 'staging', readV4ExactCountEnabled: true }));
        await expect(service.selectAndAdmit({ ...input(), ...overrides } as any)).rejects.toMatchObject({ statusCode: 400 });
        expect(admit).not.toHaveBeenCalled();
    });
});
