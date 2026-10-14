import { afterEach, describe, expect, it } from 'vitest';
import { isCanonicalDurableAgentRuntimeEnabled } from '../src/services/agentDurableConfig.service';

const original = {
    environment: process.env.PING_ENVIRONMENT,
    database: process.env.PING_M7_DATABASE_URL,
    flag: process.env.PING_ENABLE_DURABLE_AGENT_TURN,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

afterEach(() => {
    for (const [key, value] of Object.entries({
        PING_ENVIRONMENT: original.environment,
        PING_M7_DATABASE_URL: original.database,
        PING_ENABLE_DURABLE_AGENT_TURN: original.flag,
        SUPABASE_SERVICE_ROLE_KEY: original.serviceRole,
    })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe('canonical durable runtime configuration', () => {
    it('is implicit in staging only when the durable database is configured', () => {
        process.env.PING_ENVIRONMENT = 'staging';
        process.env.PING_M7_DATABASE_URL = 'postgres://staging';
        delete process.env.PING_ENABLE_DURABLE_AGENT_TURN;
        expect(isCanonicalDurableAgentRuntimeEnabled()).toBe(true);
    });

    it('does not implicitly enable the durable runtime in production', () => {
        process.env.PING_ENVIRONMENT = 'production';
        delete process.env.PING_M7_DATABASE_URL;
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'production-backend-only';
        delete process.env.PING_ENABLE_DURABLE_AGENT_TURN;
        expect(isCanonicalDurableAgentRuntimeEnabled()).toBe(false);
    });

    it('enables production durability only with the explicit gate and backend transport', () => {
        process.env.PING_ENVIRONMENT = 'production';
        delete process.env.PING_M7_DATABASE_URL;
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'production-backend-only';
        process.env.PING_ENABLE_DURABLE_AGENT_TURN = 'true';
        expect(isCanonicalDurableAgentRuntimeEnabled()).toBe(true);
    });
});
