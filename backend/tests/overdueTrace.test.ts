import { afterEach, describe, expect, it, vi } from 'vitest';
import { traceOverdue, traceProposal } from '../src/utils/overdueTrace';

const originalEnvironment = process.env.PING_ENVIRONMENT;

afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.PING_ENVIRONMENT;
    else process.env.PING_ENVIRONMENT = originalEnvironment;
    vi.restoreAllMocks();
});

describe('production diagnostic trace containment', () => {
    it('does not emit overdue or proposal traces in production', () => {
        process.env.PING_ENVIRONMENT = 'production';
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        traceOverdue('trace-prod', 'INTERPRETATION', { safeTitle: 'Privado' });
        traceProposal('trace-prod', 'INTERPRETATION', { safeTitle: 'Privado' });

        expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('keeps traces available outside production for controlled diagnostics', () => {
        process.env.PING_ENVIRONMENT = 'test';
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        traceOverdue('trace-test', 'INTERPRETATION', { count: 1 });
        traceProposal('trace-test', 'INTERPRETATION', { count: 1 });

        expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
});
