#!/usr/bin/env node

// Read-only production smoke gate for Ping. It intentionally exercises only
// public health/client surfaces: no auth, no user data, no mutations.
const DEFAULT_PRODUCTION_URL = 'https://ping-app-con3.onrender.com';
const ALLOWED_PRODUCTION_HOST = 'ping-app-con3.onrender.com';
const target = process.env.PING_PRODUCTION_URL || DEFAULT_PRODUCTION_URL;
const expectedCommit = process.env.PING_EXPECTED_COMMIT?.trim() || null;
const checks = [];

function safeError(error) {
    if (!error || typeof error !== 'object') return 'unknown_error';
    const name = typeof error.name === 'string' ? error.name.slice(0, 60) : 'Error';
    const message = typeof error.message === 'string' ? error.message.slice(0, 120) : 'request_failed';
    return `${name}: ${message}`;
}

function record(name, startedAt, details = {}) {
    checks.push({ name, pass: true, status: details.status ?? null, latencyMs: Date.now() - startedAt, ...details });
}

async function getJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* the caller reports an invalid shape */ }
    return { response, body };
}

try {
    const parsedTarget = new URL(target);
    if (parsedTarget.protocol !== 'https:' || parsedTarget.hostname !== ALLOWED_PRODUCTION_HOST) {
        throw new Error('production smoke refuses non-production hostname');
    }

    const healthStartedAt = Date.now();
    const healthResult = await getJson(`${parsedTarget.origin}/api/health`);
    if (!healthResult.response.ok || !healthResult.body || healthResult.body.ok !== true) {
        throw new Error(`health_failed_http_${healthResult.response.status}`);
    }
    const health = healthResult.body;
    if (health.db_status !== 'connected') throw new Error('health_db_not_connected');
    if (health.agent_runtime !== 'durable' || health.agent_durable_status?.reason !== 'ready') {
        throw new Error('health_durable_runtime_not_ready');
    }
    if (health.agent_private_database_diagnostic?.passed !== true || health.agent_durable_contract_diagnostic?.passed !== true) {
        throw new Error('health_durable_diagnostics_failed');
    }
    if (health.live_voice?.enabled !== true) throw new Error('health_live_voice_disabled');
    if (expectedCommit && health.commit !== expectedCommit.slice(0, 7)) {
        throw new Error(`health_commit_mismatch_expected_${expectedCommit.slice(0, 7)}_got_${health.commit || 'null'}`);
    }
    record('health', healthStartedAt, {
        status: healthResult.response.status,
        commit: health.commit,
        db: health.db_status,
        durable: health.agent_runtime,
        privateDatabase: health.agent_private_database_diagnostic.passed,
        durableContract: health.agent_durable_contract_diagnostic.passed,
        liveVoice: health.live_voice.enabled,
    });

    const voiceStartedAt = Date.now();
    const voiceResponse = await fetch(`${parsedTarget.origin}/api/agent/voice/live/client`, {
        headers: { Accept: 'text/html' },
    });
    const voiceHtml = await voiceResponse.text();
    if (!voiceResponse.ok || !voiceHtml.includes('Preparando Ping') || !voiceHtml.includes('ReactNativeWebView')) {
        throw new Error(`voice_client_failed_http_${voiceResponse.status}`);
    }
    record('live_voice_client', voiceStartedAt, {
        status: voiceResponse.status,
        contentType: voiceResponse.headers.get('content-type')?.split(';')[0] || null,
        bytes: Buffer.byteLength(voiceHtml, 'utf8'),
    });

    console.log(JSON.stringify({
        ready: true,
        target: parsedTarget.origin,
        commit: health.commit || null,
        checks,
        mutationPerformed: false,
        checkedAt: new Date().toISOString(),
    }, null, 2));
} catch (error) {
    console.error(JSON.stringify({
        ready: false,
        target,
        checks,
        error: safeError(error),
        mutationPerformed: false,
        checkedAt: new Date().toISOString(),
    }, null, 2));
    process.exitCode = 1;
}
