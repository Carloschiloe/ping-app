import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const end = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const poolOptions = vi.hoisted(() => vi.fn());

vi.mock('pg', () => ({
    Pool: class MockPool {
        constructor(options: unknown) {
            poolOptions(options);
        }
        query = query;
        end = end;
    },
}));

import {
    checkPrivateAgentTurnDatabase,
    diagnosePrivateAgentTurnDatabase,
    getLatestPrivateAgentTurnDatabaseDiagnostic,
    isPrivateAgentTurnDatabaseDiagnosticEnabled,
    PrivateAgentTurnAdmissionService,
    validatePrivateSessionPoolerUrl,
} from '../src/services/privateAgentTurnAdmission.service';

afterEach(() => {
    delete process.env.PING_ENVIRONMENT;
    delete process.env.PING_M7_PRIVATE_DB_CHECK;
    delete process.env.PING_M7_DATABASE_URL;
    query.mockReset();
    end.mockClear();
    poolOptions.mockClear();
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
            category: 'authentication_password',
            driverCode: '28P01',
        });
    });

    it('distinguishes an unknown pooler identity without exposing it', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockRejectedValueOnce(new Error('Tenant or user not found'));
        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({
            passed: false,
            category: 'authentication_identity',
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

    it('detects the required role.project-ref Session Pooler username without inspecting the password', () => {
        expect(validatePrivateSessionPoolerUrl(
            'postgresql://ping_m7_admission.oonijgmddgyymhrlnvuu:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
            'ping_m7_admission',
            'oonijgmddgyymhrlnvuu',
        )).toEqual({ valid: true });
        expect(validatePrivateSessionPoolerUrl(
            'postgresql://ping_m7_admission:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
            'ping_m7_admission',
            'oonijgmddgyymhrlnvuu',
        )).toEqual({ valid: false, reason: 'wrong_username' });
    });

    it('classifies certificate hostname failures as TLS failures', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockRejectedValueOnce(Object.assign(new Error('Hostname/IP does not match certificate altnames'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }));
        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({
            passed: false,
            category: 'tls',
            driverCode: 'ERR_TLS_CERT_ALTNAME_INVALID',
        });
    });

    it('maps a raw certificate-chain message to an allowlisted code without logging the message', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://private.invalid/test';
        query.mockRejectedValueOnce(new Error('self-signed certificate in certificate chain; secret details omitted'));
        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({
            passed: false,
            category: 'tls',
            driverCode: 'SELF_SIGNED_CERT_IN_CHAIN',
        });
    });

    it('pins the Supabase root CA without allowing the URL parser to discard it', async () => {
        process.env.PING_M7_DATABASE_URL = 'postgresql://ping_m7_admission.oonijgmddgyymhrlnvuu:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
        query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

        await expect(diagnosePrivateAgentTurnDatabase()).resolves.toEqual({ passed: true });
        const options = poolOptions.mock.calls[0][0] as {
            connectionString: string;
            ssl: { ca: string; rejectUnauthorized: boolean };
        };
        expect(new URL(options.connectionString).searchParams.has('sslmode')).toBe(false);
        expect(options.ssl.rejectUnauthorized).toBe(true);
        expect(options.ssl.ca).toContain('-----BEGIN CERTIFICATE-----');
        expect(options.ssl.ca).toContain('-----END CERTIFICATE-----');
        expect(getLatestPrivateAgentTurnDatabaseDiagnostic()).toEqual({ passed: true });
    });

    it('routes every durable admission lifecycle RPC through the fixed private allowlist', async () => {
        const service = new PrivateAgentTurnAdmissionService('postgresql://private.invalid/test');
        query.mockResolvedValue({ rows: [{ turn_id: 'turn-1', status: 'processing' }] });

        await expect(service.rpc('claim_agent_turn_admission', {
            p_turn_id: 'turn-1', p_actor_user_id: 'actor-1', p_dialogue_scope_key: 'agent:mobile_text',
        })).resolves.toMatchObject({ data: { turn_id: 'turn-1' }, error: null });
        await expect(service.rpc('complete_agent_turn_admission', {
            p_turn_id: 'turn-1', p_actor_user_id: 'actor-1', p_dialogue_scope_key: 'agent:mobile_text', p_result_ref: { kind: 'response' },
        })).resolves.toMatchObject({ data: { turn_id: 'turn-1' }, error: null });
        await expect(service.rpc('fail_agent_turn_admission', {
            p_turn_id: 'turn-1', p_actor_user_id: 'actor-1', p_dialogue_scope_key: 'agent:mobile_text', p_failure_class: 'retryable', p_result_ref: null,
        })).resolves.toMatchObject({ data: { turn_id: 'turn-1' }, error: null });

        expect(query).toHaveBeenCalledTimes(3);
        expect(query.mock.calls[0][0]).toContain('claim_agent_turn_admission');
        expect(query.mock.calls[1][0]).toContain('complete_agent_turn_admission');
        expect(query.mock.calls[2][0]).toContain('fail_agent_turn_admission');
        await service.close();
    });
});
