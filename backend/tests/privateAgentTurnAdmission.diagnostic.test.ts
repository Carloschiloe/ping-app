import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const end = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('pg', () => ({
    Pool: class MockPool {
        query = query;
        end = end;
    },
}));

import {
    checkPrivateAgentTurnDatabase,
    diagnosePrivateAgentTurnDatabase,
    isPrivateAgentTurnDatabaseDiagnosticEnabled,
} from '../src/services/privateAgentTurnAdmission.service';

afterEach(() => {
    delete process.env.PING_ENVIRONMENT;
    delete process.env.PING_M7_PRIVATE_DB_CHECK;
    delete process.env.PING_M7_DATABASE_URL;
    query.mockReset();
    end.mockClear();
});

describe('M-7 private database startup diagnostic', () => {
    it('runs only for staging with the explicit diagnostic flag', () => {
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_M7_PRIVATE_DB_CHECK = 'true';
        expect(isPrivateAgentTurnDatabaseDiagnosticEnabled()).toBe(false);
        process.env.PING_ENVIRONMENT = 'staging';
        expect(isPrivateAgentTurnDatabaseDiagnosticEnabled()).toBe(true);
        process.env.PING_M7_PRIVATE_DB_CHECK = 'false';
        expect(isPrivateAgentTurnDatabaseDiagnosticEnabled()).toBe(false);
    });

    it('executes only SELECT 1 and reports PASS without exposing an error', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        await expect(checkPrivateAgentTurnDatabase()).resolves.toBe(true);
        expect(query).toHaveBeenCalledWith('select 1');
        expect(end).toHaveBeenCalledOnce();
    });

    it('reports FAIL for an invalid connection and does not throw', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockRejectedValueOnce(new Error('sensitive connection detail'));
        await expect(checkPrivateAgentTurnDatabase()).resolves.toBe(false);
        expect(end).toHaveBeenCalledOnce();
    });

    it('reports FAIL when the private URL is absent', async () => {
        await expect(checkPrivateAgentTurnDatabase()).resolves.toBe(false);
        expect(query).not.toHaveBeenCalled();
    });

    it('exposes only a safe category for a connection failure', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockRejectedValueOnce(Object.assign(new Error('password=must-not-be-logged'), { code: '28P01' }));
        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({
            passed: false,
            category: 'authentication',
        });
    });

    it('classifies malformed configuration without opening a pool', async () => {
        process.env.PING_M7_DATABASE_URL = 'not-a-postgres-url';
        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({
            passed: false,
            category: 'invalid_url',
        });
        expect(query).not.toHaveBeenCalled();
    });
});
