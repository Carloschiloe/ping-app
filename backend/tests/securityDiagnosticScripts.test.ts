import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('diagnostic scripts do not leak credentials', () => {
    const scripts = [
        'test_notify_endpoint.js',
        'test_push_direct.js',
        'test_call_push.js',
    ];

    it.each(scripts)('redacts secrets from %s logs', (script) => {
        const source = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');

        expect(source).not.toMatch(/console\.log\([^\n]*(token|access_token|expo_push_token)/i);
        expect(source).not.toContain('test1234');
        expect(source).not.toContain('carlos@marvex.cl');
    });
});
