import { describe, expect, it, vi } from 'vitest';
import { renderCallPage } from '../src/controllers/agora.controller';

function createResponse() {
    const headers = new Map<string, string>();
    let body = '';
    let statusCode = 200;
    const response: any = {
        setHeader: vi.fn((name: string, value: string) => {
            headers.set(name.toLowerCase(), value);
            return response;
        }),
        status: vi.fn((value: number) => {
            statusCode = value;
            return response;
        }),
        type: vi.fn(() => response),
        send: vi.fn((value: string) => {
            body = value;
            return response;
        }),
    };

    return {
        response,
        headers,
        get body() {
            return body;
        },
        get statusCode() {
            return statusCode;
        },
    };
}

describe('Agora call page', () => {
    it('rejects requests without all call access parameters', () => {
        const result = createResponse();

        renderCallPage({ query: {} } as any, result.response);

        expect(result.statusCode).toBe(400);
        expect(result.body).toBe('Missing call access parameters');
    });

    it('allows only the Agora page resources required by the isolated call view', () => {
        const result = createResponse();

        renderCallPage({
            query: {
                appId: 'app-id',
                token: 'temporary-rtc-token',
                channel: 'conversation-id',
                video: 'true',
            },
        } as any, result.response);

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain('AgoraRTC_N-4.20.2.js');
        expect(result.body).toContain('window.ReactNativeWebView.postMessage');
        expect(result.body).toContain('postStatus("connected")');

        const csp = result.headers.get('content-security-policy') || '';
        expect(csp).toContain('https://download.agora.io');
        expect(csp).toContain('connect-src https: wss:');
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).not.toContain("script-src 'unsafe-inline'");

        const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
        expect(nonce).toBeTruthy();
        expect(result.body).toContain(`<script nonce="${nonce}"`);
        expect(result.headers.get('cache-control')).toBe('no-store');
    });
});
