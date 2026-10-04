import { afterEach, describe, expect, it } from 'vitest';
import { isCanonicalDurableAgentRuntimeEnabled } from '../src/services/agentDurableConfig.service';

const original = {
    environment: process.env.PING_ENVIRONMENT,
    database: process.env.PING_M7_DATABASE_URL,
    flag: process.env.PING_ENABLE_DURABLE_AGENT_TURN,
};

afterEach(() => {
    for (const [key, value] of Object.entries({
        PING_ENVIRONMENT: original.environment,
        PING_M7_DATABASE_URL: original.database,
        PING_ENABLE_DURABLE_AGENT_TURN: original.flag,
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
        process.env.PING_M7_DATABASE_URL = 'postgres://staging';
        process.env.PING_ENABLE_DURABLE_AGENT_TURN = 'true';
        expect(isCanonicalDurableAgentRuntimeEnabled()).toBe(false);
    });
});
