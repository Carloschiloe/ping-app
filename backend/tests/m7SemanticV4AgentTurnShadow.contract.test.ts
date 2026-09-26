import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const corePath = path.resolve(__dirname, '../src/services/agentTurnCore.service.ts');
const wrapperPath = path.resolve(__dirname, '../src/services/agentTurn.service.ts');

describe('M-7 V4 shadow placement on the real Agent Turn path', () => {
    it('keeps V4 observational and places it before Legacy-owned routing branches', () => {
        const source = fs.readFileSync(corePath, 'utf8');
        const shadow = source.indexOf('const semanticShadow = await runSemanticV4Shadow({');
        const coreShadow = source.indexOf('const semanticV4CoreShadow = await runSemanticV4CoreShadow({');
        const context = source.indexOf('const context = await buildAgentContext({');
        const write = source.indexOf("if (semantic.route === 'write'");
        const read = source.indexOf("traceAgentDevice(traceId, 'AGENT_ROUTING_DECISION', { path: 'read_response'");
        expect(shadow).toBeGreaterThan(-1);
        expect(context).toBeGreaterThan(shadow);
        expect(coreShadow).toBeGreaterThan(context);
        expect(write).toBeGreaterThan(context);
        expect(read).toBeGreaterThan(write);
        expect(source.slice(coreShadow, write)).toContain('semanticV4CoreShadow');
        expect(source).toContain('legacy semantic result still owns every branch below');
    });

    it('keeps the wrapper follow-up adapter outside the public Core contract', () => {
        const source = fs.readFileSync(wrapperPath, 'utf8');
        expect(source).toContain("from './agentTurnCore.service'");
        expect(source).toContain('resolveVerifiedReadFollowup');
        expect(source).toContain('canonical');
        expect(source).toContain('No encontr');
    });
});
