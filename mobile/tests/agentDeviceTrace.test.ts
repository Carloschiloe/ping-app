import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(__dirname, '../src/api/query-modules/agent.ts'), 'utf8');

describe('M-7B device trace mobile delivery', () => {
    it('logs the backend debug envelope with the required prefix', () => {
        expect(source).toContain("console.log('PING_DEVICE_TRACE', result.debug)");
    });

    it('gates logging to dev or staging and never renders a UI element', () => {
        expect(source).toContain('__DEV__ || isStagingBuild');
        expect(source).not.toContain('debugText');
        expect(source).not.toContain('DebugView');
    });

    it('does not log request text, tokens, PII, or model payloads', () => {
        const loggingBlock = source.slice(source.indexOf("console.log('PING_DEVICE_TRACE'", source.indexOf('useAgentTurn')) - 300, source.indexOf("console.log('PING_DEVICE_TRACE'", source.indexOf('useAgentTurn')) + 100);
        expect(loggingBlock).not.toContain('input');
        expect(loggingBlock).not.toContain('access_token');
        expect(loggingBlock).not.toContain('email');
        expect(loggingBlock).not.toContain('phone');
        expect(loggingBlock).toContain('result.debug');
    });
});
