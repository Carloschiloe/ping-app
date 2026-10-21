import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backendRoot = resolve(dirname(__filename), '..');
const repositoryRoot = resolve(backendRoot, '..');

describe('storage cleanup configuration', () => {
    it('exposes only the non-destructive expired-attachment audit command', () => {
        const packageJson = JSON.parse(
            readFileSync(resolve(backendRoot, 'package.json'), 'utf8'),
        ) as { scripts?: Record<string, string> };
        const scripts = packageJson.scripts ?? {};

        expect(scripts['cleanup:expired-attachments']).toBeUndefined();
        expect(scripts['attachments:audit-expired'])
            .toBe('node dist/scripts/audit-expired-message-attachments.js');
        expect(JSON.stringify(scripts)).not.toContain('cleanup-expired-message-attachments.js');
        expect(existsSync(resolve(backendRoot, 'src/scripts/audit-expired-message-attachments.ts')))
            .toBe(true);
    });

    it('keeps Render cron and automation gates closed', () => {
        const renderYaml = readFileSync(resolve(repositoryRoot, 'render.yaml'), 'utf8');

        expect(renderYaml).toMatch(/key:\s*RUN_CRON_JOBS\s*[\r\n]+\s*value:\s*["']?false["']?/);
        expect(renderYaml).toMatch(/key:\s*ENABLE_AUTOMATIONS\s*[\r\n]+\s*value:\s*["']?false["']?/);
        expect(renderYaml).not.toMatch(/type:\s*cron/);
    });

    it('does not put attachment cleanup into the in-process scheduler', () => {
        const coordinator = readFileSync(
            resolve(backendRoot, 'src/services/cronCoordinator.ts'),
            'utf8',
        );

        expect(coordinator).not.toMatch(/attachment|expired/i);
    });

    it('keeps the audit command free of physical deletion calls', () => {
        const auditScript = readFileSync(
            resolve(backendRoot, 'src/scripts/audit-expired-message-attachments.ts'),
            'utf8',
        );

        expect(auditScript).not.toMatch(/\.\s*(delete|remove|empty)\s*\(/i);
        expect(auditScript).not.toMatch(/storage\.from\s*\(/i);
    });
});
