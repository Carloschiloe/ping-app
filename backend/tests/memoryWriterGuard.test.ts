import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

function walk(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return walk(absolute);
        return /\.(ts|js)$/.test(entry.name) ? [absolute] : [];
    });
}

describe('M-2 canonical Memory writer guard', () => {
    it('keeps direct memory_records writes inside memory.service.ts', () => {
        const directWrite = /\.from\s*\(\s*(['"])memory_records\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/gms;
        const found = new Set<string>();

        for (const file of walk(SOURCE_ROOT)) {
            const source = fs.readFileSync(file, 'utf8');
            const executableSource = source
                .replace(/\/\*[\\s\\S]*?\\*\//g, '')
                .replace(/^\\s*\\/\\/.*$/gm, '');
            if (directWrite.test(executableSource)) {
                found.add(path.relative(SOURCE_ROOT, file).replaceAll('\\\\', '/'));
            }
            directWrite.lastIndex = 0;
        }

        expect([...found]).toEqual(['services/memory.service.ts']);
    });

    it('removes authenticated direct-write policies from the canonical migration', () => {
        const migration = fs.readFileSync(
            path.join(REPO_ROOT, 'supabase', 'migrations', '20261017020000_harden_memory_direct_writes.sql'),
            'utf8',
        );

        expect(migration).toContain('drop policy if exists memory_records_owner_insert');
        expect(migration).toContain('revoke insert, update, delete on table public.memory_records');
        expect(migration).toContain('revoke all on table public.memory_record_evidence');
    });
});
