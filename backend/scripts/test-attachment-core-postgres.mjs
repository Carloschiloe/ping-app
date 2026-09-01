import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PING_C4B_DATABASE_URL;
if (!databaseUrl) throw new Error('PING_C4B_DATABASE_URL is required');
const parsedUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)) {
    throw new Error('C-4B PostgreSQL tests are restricted to a loopback database');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const integrationSql = path.join(backendRoot, 'tests', 'postgres', 'attachmentCore.integration.sql');
const psql = process.env.PING_C4B_PSQL_BIN || 'psql';

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
const participant = randomUUID();
const clientUploadId = randomUUID();
const attachmentMessageA = randomUUID();
const attachmentMessageB = randomUUID();
let conversationId = '';
let attachmentId = '';
let certified = false;

try {
    const integration = await runPsql(['-q', '-f', integrationSql]);
    requireSuccess(integration, 'Attachment Core integration/RLS');

    const setup = await runPsql(['-q', '-A', '-t', '-c', `
        insert into auth.users (id, email) values
            ('${actor}', 'c4b-concurrency-a-${actor}@example.invalid'),
            ('${participant}', 'c4b-concurrency-b-${participant}@example.invalid');
        select public.create_conversation_with_participants(
            '${actor}', 'group', array['${actor}'::uuid, '${participant}'::uuid],
            'C-4B concurrency', null, false
        );
    `], true);
    requireSuccess(setup, 'concurrency setup');
    conversationId = setup.stdout.trim().split(/\r?\n/).at(-1)?.trim() || '';
    if (!conversationId) throw new Error('concurrency setup did not return a conversation');

    const attachmentSetup = await runPsql(['-q', '-A', '-t', '-c', `
        select id from public.create_message_attachment_intent(
            '${actor}', '${conversationId}', 'document', 'application/pdf', 'race.pdf',
            '${clientUploadId}', 'chat-media',
            'conversations/${conversationId}/attachments/${actor}/race.pdf', '{}'
        );
    `], true);
    requireSuccess(attachmentSetup, 'attachment setup');
    attachmentId = attachmentSetup.stdout.trim();
    if (!attachmentId) throw new Error('attachment setup did not return an attachment');

    const complete = await runPsql(['-q', '-c', `
        select public.complete_message_attachment(
            '${attachmentId}', '${actor}', 'application/pdf', 128
        );
    `], true);
    requireSuccess(complete, 'attachment complete');

    const claim = (clientMessageId, content) => runPsql(['-q', '-c', `
        select * from public.persist_message_with_attachment(
            '${actor}', '${conversationId}', '${content}', null,
            '${clientMessageId}', '{}', '${attachmentId}'
        );
    `], true);
    const [first, second] = await Promise.all([
        claim(attachmentMessageA, 'Concurrent A'),
        claim(attachmentMessageB, 'Concurrent B'),
    ]);
    const successes = [first, second].filter((result) => result.code === 0);
    const rejected = [first, second].filter((result) =>
        result.code !== 0 && /already claimed|not uploaded/i.test(result.stderr));
    if (successes.length !== 1 || rejected.length !== 1) {
        throw new Error('concurrent attachment claim did not produce one winner and one controlled rejection');
    }

    const verification = await runPsql(['-q', '-A', '-t', '-F', '|', '-c', `
        select
            (select count(*) from public.messages where conversation_id = '${conversationId}'),
            (select count(*) from public.attachments where id = '${attachmentId}' and lifecycle_status = 'attached'),
            (select count(*) from public.attachments where id = '${attachmentId}' and message_id is not null);
    `], true);
    requireSuccess(verification, 'concurrency verification');
    if (verification.stdout.trim() !== '1|1|1') {
        throw new Error(`unexpected concurrency result: ${verification.stdout.trim()}`);
    }

    certified = true;
} finally {
    if (conversationId) {
        const cleanup = await runPsql(['-q', '-c', `
            set session_replication_role = replica;
            delete from public.message_receipts where message_id in (
                select id from public.messages where conversation_id = '${conversationId}'
            );
            delete from public.message_events where conversation_id = '${conversationId}';
            delete from public.attachments where context_conversation_id = '${conversationId}';
            delete from public.messages where conversation_id = '${conversationId}';
            delete from public.conversation_participants where conversation_id = '${conversationId}';
            delete from public.conversations where id = '${conversationId}';
            delete from auth.users where id in ('${actor}', '${participant}');
            set session_replication_role = origin;
        `], true);
        requireSuccess(cleanup, 'concurrency cleanup');
    }
}

if (certified) {
    console.log(JSON.stringify({
        target: 'local-postgresql',
        integration_and_rls: 'passed',
        attachment_claim_concurrency: 'one winner',
        cleanup: 'completed',
    }));
}
