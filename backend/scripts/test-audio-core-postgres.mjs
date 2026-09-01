import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PING_C5B_DATABASE_URL;
if (!databaseUrl) throw new Error('PING_C5B_DATABASE_URL is required');
const parsedUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)) {
    throw new Error('C-5B PostgreSQL tests are restricted to a loopback database');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const integrationSql = path.join(backendRoot, 'tests', 'postgres', 'audioTranscription.integration.sql');
const psql = process.env.PING_C5B_PSQL_BIN || 'psql';

function runPsql(args, capture = false) {
    return new Promise((resolve) => {
        const child = spawn(psql, ['-d', databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', ...args], {
            cwd: backendRoot,
            stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        if (capture) {
            child.stdout.on('data', (chunk) => { stdout += chunk; });
            child.stderr.on('data', (chunk) => { stderr += chunk; });
        }
        child.on('error', (error) => resolve({ code: -1, stdout, stderr, error }));
        child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
}

function requireSuccess(result, label) {
    if (result.code !== 0) {
        throw new Error(`${label} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
    }
}

const actor = randomUUID();
const clientUploadId = randomUUID();
const clientMessageId = randomUUID();
const workerA = randomUUID();
const workerB = randomUUID();
let conversationId = '';
let attachmentId = '';
let certified = false;

try {
    const existingEligible = await runPsql(['-q', '-A', '-t', '-c', `
        select count(*) from public.audio_transcriptions
        where status in ('pending', 'failed') and next_retry_at <= now();
    `], true);
    requireSuccess(existingEligible, 'eligible-job preflight');
    if (existingEligible.stdout.trim() !== '0') {
        throw new Error('Refusing concurrency certification while unrelated eligible audio jobs exist');
    }

    const integration = await runPsql(['-q', '-f', integrationSql]);
    requireSuccess(integration, 'Audio Core integration/RLS');

    const setup = await runPsql(['-q', '-A', '-t', '-c', `
        insert into auth.users (id, email)
        values ('${actor}', 'c5b-concurrency-${actor}@example.invalid');
        select public.create_conversation_with_participants(
            '${actor}', 'direct', array['${actor}'::uuid], 'C-5B concurrency', null, true
        );
    `], true);
    requireSuccess(setup, 'concurrency setup');
    conversationId = setup.stdout.trim().split(/\r?\n/).at(-1)?.trim() || '';
    if (!conversationId) throw new Error('concurrency setup did not return a conversation');

    const attachmentSetup = await runPsql(['-q', '-A', '-t', '-c', `
        select id from public.create_message_attachment_intent(
            '${actor}', '${conversationId}', 'audio', 'audio/m4a', 'race.m4a',
            '${clientUploadId}', 'chat-media',
            'conversations/${conversationId}/attachments/${actor}/race.m4a',
            '{"audio":{"durationMs":2400,"durationSource":"client_recorder"}}'
        );
    `], true);
    requireSuccess(attachmentSetup, 'audio attachment setup');
    attachmentId = attachmentSetup.stdout.trim();

    const persist = await runPsql(['-q', '-c', `
        select public.complete_message_attachment('${attachmentId}', '${actor}', 'audio/m4a', 128);
        select * from public.persist_message_with_attachment(
            '${actor}', '${conversationId}', 'Audio', null, '${clientMessageId}', '{}', '${attachmentId}'
        );
    `], true);
    requireSuccess(persist, 'audio message/job persistence');

    const claim = (workerId) => runPsql(['-q', '-A', '-t', '-c', `
        select id from public.claim_audio_transcription_job('${workerId}');
    `], true);
    const claims = await Promise.all([claim(workerA), claim(workerB)]);
    claims.forEach((result, index) => requireSuccess(result, `worker ${index + 1} claim`));
    const winners = claims.map((result) => result.stdout.trim()).filter(Boolean);
    if (winners.length !== 1) {
        throw new Error(`expected one worker winner, got ${winners.length}`);
    }

    const verification = await runPsql(['-q', '-A', '-t', '-F', '|', '-c', `
        select count(*), min(status), min(attempt_count), count(distinct locked_by)
        from public.audio_transcriptions where attachment_id = '${attachmentId}';
    `], true);
    requireSuccess(verification, 'worker concurrency verification');
    if (verification.stdout.trim() !== '1|processing|1|1') {
        throw new Error(`unexpected worker concurrency result: ${verification.stdout.trim()}`);
    }
    certified = true;
} finally {
    if (conversationId) {
        const cleanup = await runPsql(['-q', '-c', `
            set session_replication_role = replica;
            delete from public.audio_transcriptions where attachment_id = '${attachmentId}';
            delete from public.attachments where context_conversation_id = '${conversationId}';
            delete from public.messages where conversation_id = '${conversationId}';
            delete from public.conversation_participants where conversation_id = '${conversationId}';
            delete from public.conversations where id = '${conversationId}';
            delete from auth.users where id = '${actor}';
            set session_replication_role = origin;
        `], true);
        requireSuccess(cleanup, 'concurrency cleanup');
    }
}

if (certified) {
    console.log(JSON.stringify({
        target: 'local-postgresql',
        integration_rls_retry_tombstone: 'passed',
        worker_concurrency: 'exactly-one-winner',
        cleanup: 'completed',
    }));
}
