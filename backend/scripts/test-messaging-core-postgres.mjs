import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PING_C3_DATABASE_URL;
if (!databaseUrl) throw new Error('PING_C3_DATABASE_URL is required');
const parsedUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)) {
    throw new Error('C-3 PostgreSQL tests are restricted to a loopback database');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const integrationSql = path.join(backendRoot, 'tests', 'postgres', 'messagingCore.integration.sql');
const psql = process.env.PING_C3_PSQL_BIN || 'psql';

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

await (async () => {
    const integration = await runPsql(['-q', '-f', integrationSql]);
    requireSuccess(integration, 'Messaging Core integration');

    const a = randomUUID();
    const b = randomUUID();
    const clientMessageId = randomUUID();
    const setup = await runPsql(['-q', '-c', `
        insert into auth.users (id, email) values
            ('${a}', 'c3-concurrency-a-${a}@example.invalid'),
            ('${b}', 'c3-concurrency-b-${b}@example.invalid');
    `], true);
    requireSuccess(setup, 'concurrency setup');

    const createSql = `
        select public.create_conversation_with_participants(
            '${a}', 'direct', array['${a}'::uuid, '${b}'::uuid], null, null, true
        );
    `;
    const [firstConversation, secondConversation] = await Promise.all([
        runPsql(['-q', '-A', '-t', '-c', createSql], true),
        runPsql(['-q', '-A', '-t', '-c', createSql], true),
    ]);
    requireSuccess(firstConversation, 'first concurrent conversation create');
    requireSuccess(secondConversation, 'second concurrent conversation create');
    const conversationId = firstConversation.stdout.trim();
    if (!conversationId || conversationId !== secondConversation.stdout.trim()) {
        throw new Error('concurrent direct conversation creation did not converge on one id');
    }

    const insertSql = `
        insert into public.messages (conversation_id, sender_id, content, client_message_id)
        values ('${conversationId}', '${a}', 'C-3 concurrent retry', '${clientMessageId}');
    `;
    const [firstInsert, secondInsert] = await Promise.all([
        runPsql(['-q', '-c', insertSql], true),
        runPsql(['-q', '-c', insertSql], true),
    ]);
    const successes = [firstInsert, secondInsert].filter((result) => result.code === 0);
    const conflicts = [firstInsert, secondInsert].filter((result) =>
        result.code !== 0 && /duplicate key value|unique constraint/i.test(result.stderr));
    if (successes.length !== 1 || conflicts.length !== 1) {
        throw new Error('concurrent idempotency did not produce one insert and one controlled unique conflict');
    }

    const verification = await runPsql([
        '-q', '-A', '-t', '-F', '|', '-c',
        `select
            (select count(*) from public.conversations c
             where c.id = '${conversationId}'),
            (select count(*) from public.messages m
             where m.sender_id = '${a}' and m.client_message_id = '${clientMessageId}'),
            (select count(*) from public.message_receipts mr
             join public.messages m on m.id = mr.message_id
             where m.sender_id = '${a}' and m.client_message_id = '${clientMessageId}');`,
    ], true);
    requireSuccess(verification, 'concurrency verification');
    if (verification.stdout.trim() !== '1|1|1') {
        throw new Error(`unexpected concurrency result: ${verification.stdout.trim()}`);
    }

    console.log(JSON.stringify({
        target: 'local-postgresql',
        integration: 'passed',
        direct_conversation_concurrency: 'converged',
        client_message_id_concurrency: 'one message',
        receipt_snapshot: 'atomic',
    }));
})();
