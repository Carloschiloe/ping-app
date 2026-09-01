import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const LEGACY_WRITER_REASON = 'LEGACY SATELLITE WRITER — migrate in future slice';

const ALLOWED_SOURCE_WRITERS = new Map<string, string>([
    ['controllers/calendar.controller.ts:update', LEGACY_WRITER_REASON],
    ['services/calendar_sync.service.ts:update', LEGACY_WRITER_REASON],
    ['services/call-processing.service.ts:insert', LEGACY_WRITER_REASON],
    ['services/operation.service.ts:update', LEGACY_WRITER_REASON],
    ['scripts/debug_schema.ts:insert', 'LEGACY DIAGNOSTIC WRITER — never runtime'],
    ['scripts/debug_schema.ts:delete', 'LEGACY DIAGNOSTIC WRITER — never runtime'],
]);

const ALLOWED_SQL_DML = new Map<string, string>([
    [
        'backend/src/database/migrations/add_commitment_type.sql:update',
        'LEGACY SQL MIGRATION — canonical migrations live in supabase/migrations',
    ],
]);

function walk(directory: string, extensions: Set<string>): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return walk(absolute, extensions);
        return extensions.has(path.extname(entry.name)) ? [absolute] : [];
    });
}

function unixRelative(root: string, file: string) {
    return path.relative(root, file).replaceAll('\\', '/');
}

describe('C-2 canonical Commitment writer guard', () => {
    it('rejects new Supabase writes to commitments outside the explicit legacy allowlist', () => {
        const directWrite = /\.from\s*\(\s*(['"])commitments\1\s*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/gms;
        const found = new Set<string>();

        for (const file of walk(SOURCE_ROOT, new Set(['.ts', '.js']))) {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(directWrite)) {
                found.add(`${unixRelative(SOURCE_ROOT, file)}:${match[2]}`);
            }
        }

        expect([...found].sort()).toEqual([...ALLOWED_SOURCE_WRITERS.keys()].sort());
        for (const reason of ALLOWED_SOURCE_WRITERS.values()) {
            expect(reason.length).toBeGreaterThan(20);
        }
    });

    it('rejects direct Commitment DML in SQL outside canonical or explicitly legacy migrations', () => {
        const sqlFiles = [
            ...walk(path.join(BACKEND_ROOT, 'src'), new Set(['.sql'])),
            ...walk(path.join(REPO_ROOT, 'supabase'), new Set(['.sql'])),
        ];
        const directDml = /^\s*(insert\s+into|update|delete\s+from)\s+(?:public\.)?commitments\b/gim;
        const found = new Set<string>();

        for (const file of sqlFiles) {
            const relative = unixRelative(REPO_ROOT, file);
            if (relative.startsWith('supabase/migrations/')) continue;
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(directDml)) {
                const operation = match[1].toLowerCase().startsWith('insert')
                    ? 'insert'
                    : match[1].toLowerCase().startsWith('delete')
                        ? 'delete'
                        : 'update';
                found.add(`${relative}:${operation}`);
            }
        }

        expect([...found].sort()).toEqual([...ALLOWED_SQL_DML.keys()].sort());
    });

    it('keeps Commitment HTTP routes behind the application boundary', () => {
        const controller = fs.readFileSync(
            path.join(SOURCE_ROOT, 'controllers', 'commitment.controller.ts'),
            'utf8'
        );
        expect(controller).toContain("from '../services/commitmentApplication.service'");
        expect(controller).not.toMatch(/from ['"]\.\.\/services\/commitment(?:Proposal)?\.service['"]/);

        const routes = fs.readFileSync(path.join(SOURCE_ROOT, 'routes', 'index.ts'), 'utf8');
        const commitmentRouteLines = routes
            .split(/\r?\n/)
            .filter((line) => /router\.(post|patch|delete)\('\/commitment(?:s|-proposals)/.test(line));
        const bypasses = commitmentRouteLines.filter((line) => (
            !line.includes('commitmentController.')
            && !line.includes("'/commitments/:id/operation-action'")
        ));

        expect(bypasses).toEqual([]);
        expect(commitmentRouteLines.some((line) => line.includes("'/commitments/:id/operation-action'")))
            .toBe(true); // LEGACY SATELLITE WRITER — migrate in future slice.
    });
});
