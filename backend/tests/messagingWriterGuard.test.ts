import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

function walk(directory: string, extensions: Set<string>): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return walk(absolute, extensions);
        return extensions.has(path.extname(entry.name)) ? [absolute] : [];
    });
}

function relative(file: string) {
    return path.relative(SOURCE_ROOT, file).replaceAll('\\', '/');
}

describe('C-3 canonical Messaging writer guard', () => {
    it('keeps runtime receipt writes inside the canonical application boundary', () => {
        const directWrite = /\.from\s*\(\s*(['"])message_receipts\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/gms;
        const found: string[] = [];
        for (const file of walk(SOURCE_ROOT, new Set(['.ts', '.js']))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(directWrite)) {
                found.push(`${relative(file)}:${match[2]}`);
            }
        }
        expect(found).toEqual([]);

        const boundary = fs.readFileSync(
            path.join(SOURCE_ROOT, 'services', 'messagingApplication.service.ts'),
            'utf8',
        );
        expect(boundary).toContain("rpc('mark_message_receipt'");
        expect(boundary).toContain("rpc('mark_conversation_read'");
    });

    it('forbids physical message deletes and direct lifecycle status writes in runtime code', () => {
        const destructiveDelete = /\.from\s*\(\s*(['"])messages\1\s*\)\s*\.\s*delete\s*\(/gms;
        const statusUpdate = /\.from\s*\(\s*(['"])messages\1\s*\)\s*\.\s*update\s*\(\s*\{[^}]*\bstatus\s*:/gms;
        const offenders: string[] = [];

        for (const file of walk(SOURCE_ROOT, new Set(['.ts', '.js']))) {
            const source = fs.readFileSync(file, 'utf8');
            if (destructiveDelete.test(source)) offenders.push(`${relative(file)}:delete`);
            destructiveDelete.lastIndex = 0;
            if (statusUpdate.test(source)) offenders.push(`${relative(file)}:status`);
            statusUpdate.lastIndex = 0;
        }
        expect(offenders).toEqual([]);
    });

    it('allows new message inserts only in the boundary plus explicit out-of-scope legacy adapters', () => {
        const insert = /\.from\s*\(\s*(['"])messages\1\s*\)\s*\.\s*insert\s*\(/gms;
        const found = new Set<string>();
        for (const file of walk(SOURCE_ROOT, new Set(['.ts', '.js']))) {
            const source = fs.readFileSync(file, 'utf8');
            if (insert.test(source)) found.add(relative(file));
            insert.lastIndex = 0;
        }

        expect([...found].sort()).toEqual([
            'services/call-processing.service.ts', // Calls: fuera de alcance C-3; DB trigger igualmente crea receipts.
            'services/messagingApplication.service.ts',
            'services/morningRoutine.service.ts', // Ping AI: fuera de alcance C-3; DB trigger igualmente crea receipts.
        ]);
    });

    it('keeps database-level guards and canonical RPCs in the C-3 migration', () => {
        const migration = fs.readFileSync(
            path.join(REPO_ROOT, 'supabase', 'migrations', '20260830010000_messaging_core_canonical.sql'),
            'utf8',
        );
        expect(migration).toContain('trg_initialize_message_recipients');
        expect(migration).toContain('trg_guard_message_legacy_status_write');
        expect(migration).toContain('trg_prevent_message_physical_delete');
        expect(migration).toContain('create or replace function public.mark_message_receipt');
        expect(migration).toContain('create or replace function public.tombstone_message');
    });
});
