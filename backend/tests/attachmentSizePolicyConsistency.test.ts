// PING — CANONICAL ATTACHMENT SIZE POLICY: proves the two size caps that
// are semantically DISTINCT from the message-attachment upload policy were
// correctly left untouched by the MAX_MESSAGE_ATTACHMENT_BYTES
// consolidation/raise (20MB -> 50MB):
// - audioTranscriptionWorker.service.ts's MAX_AUDIO_BYTES: a
//   transcription-eligibility/cost ceiling for already-stored audio
//   attachments, not an upload-size gate.
// - trustedMedia.ts's MAX_MEDIA_BYTES: a server-side download safety cap
//   used only when the worker fetches audio from Storage, not a client
//   upload gate either.
// Raising the message-attachment ceiling must never silently raise (or
// otherwise change) these — they gate different concerns (worker cost/
// safety, not "can a user send this file").
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

describe('unrelated 20MB audio-specific caps remain untouched by the attachment size policy change', () => {
    it('audioTranscriptionWorker.service.ts keeps its own independent MAX_AUDIO_BYTES = 20MB, not imported from privateFile.service.ts', () => {
        const src = readSrc('src/services/audioTranscriptionWorker.service.ts');

        expect(src).toContain('const MAX_AUDIO_BYTES = 20 * 1024 * 1024;');
        expect(src).not.toContain("from '../services/privateFile.service'");
        expect(src).not.toContain('MAX_MESSAGE_ATTACHMENT_BYTES');
    });

    it('trustedMedia.ts keeps its own independent MAX_MEDIA_BYTES = 20MB, not imported from privateFile.service.ts', () => {
        const src = readSrc('src/utils/trustedMedia.ts');

        expect(src).toContain('const MAX_MEDIA_BYTES = 20 * 1024 * 1024;');
        expect(src).not.toContain("from '../services/privateFile.service'");
        expect(src).not.toContain('MAX_MESSAGE_ATTACHMENT_BYTES');
    });
});

describe('repo-controlled Storage bucket provisioning matches the canonical policy (no drift source left as an undocumented Admin API mutation)', () => {
    it('supabase/storage/chat-media-private.sql sets file_size_limit to the current canonical value (52428800), not the old 20971520', async () => {
        const { MAX_MESSAGE_ATTACHMENT_BYTES } = await import('../src/services/privateFile.service');
        const provisioningSql = fs.readFileSync(
            path.join(__dirname, '..', '..', 'supabase', 'storage', 'chat-media-private.sql'),
            'utf-8'
        );

        expect(MAX_MESSAGE_ATTACHMENT_BYTES).toBe(52428800);
        // Strip SQL line comments before matching: the old 20971520
        // legitimately still appears in a `--` comment documenting what the
        // value was raised FROM — only the actual live literal being
        // inserted/upserted (inside the `values (...)` clause) matters here.
        const sqlWithoutComments = provisioningSql
            .split('\n')
            .map((line) => line.replace(/--.*$/, ''))
            .join('\n');

        expect(sqlWithoutComments).toMatch(/values\s*\(\s*'chat-media',\s*'chat-media',\s*false,\s*52428800/);
        expect(sqlWithoutComments).not.toMatch(/values\s*\(\s*'chat-media',\s*'chat-media',\s*false,\s*20971520/);
    });

    it('the DB migration guard matches the same canonical value, not the old 20971520', () => {
        const migrationSql = fs.readFileSync(
            path.join(
                __dirname,
                '..',
                '..',
                'supabase',
                'migrations',
                '20260910010000_message_attachment_size_policy.sql'
            ),
            'utf-8'
        );

        expect(migrationSql).toContain('52428800');
        expect(migrationSql).not.toMatch(/\b20971520\b/);
    });
});
