import { describe, expect, it } from 'vitest';
import { isAllowedRequestOrigin } from '../src/security/corsPolicy';

function request(host: string, protocol: string = 'https') {
    return {
        protocol,
        get(name: string) {
            return name.toLowerCase() === 'host' ? host : undefined;
        },
    };
}

describe('CORS request-origin policy', () => {
    it('allows the same HTTPS origin without ALLOWED_ORIGINS', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'https://ping-app-con3.onrender.com',
            [],
        )).toBe(true);
    });

    it('preserves explicitly configured origins', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'https://mobile.example.test',
            ['https://mobile.example.test'],
        )).toBe(true);
    });

    it('rejects a different origin when no allowlist entry exists', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'https://attacker.example.test',
            [],
        )).toBe(false);
    });

    it('rejects a same-host origin with the wrong protocol', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'http://ping-app-con3.onrender.com',
            [],
        )).toBe(false);
    });
});
