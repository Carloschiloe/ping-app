import { describe, expect, it } from 'vitest';
import {
    isAllowedRequestOrigin,
    isStrictCorsEnvironment,
    normalizeCorsOrigin,
    parseAllowedOrigins,
} from '../src/security/corsPolicy';

function request(host: string, protocol: string = 'https') {
    return {
        protocol,
        get(name: string) {
            return name.toLowerCase() === 'host' ? host : undefined;
        },
    };
}

describe('CORS request-origin policy', () => {
    it('normalizes only exact HTTP(S) origins and rejects unsafe configuration', () => {
        expect(normalizeCorsOrigin(' https://WEB.example.test/ ')).toBe('https://web.example.test');
        expect(normalizeCorsOrigin('https://web.example.test/app')).toBeNull();
        expect(normalizeCorsOrigin('https://user:pass@web.example.test')).toBeNull();
        expect(normalizeCorsOrigin('*')).toBeNull();
        expect(parseAllowedOrigins('https://WEB.example.test/, https://web.example.test'))
            .toEqual({ origins: ['https://web.example.test'], invalidCount: 0 });
        expect(parseAllowedOrigins('not-an-origin, file:///tmp/ping'))
            .toEqual({ origins: [], invalidCount: 2 });
    });

    it('keeps production and staging strict even if NODE_ENV is misconfigured', () => {
        expect(isStrictCorsEnvironment('production', 'production')).toBe(true);
        expect(isStrictCorsEnvironment('development', 'staging')).toBe(true);
        expect(isStrictCorsEnvironment('development', 'local')).toBe(false);
    });

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

    it('allows native-style requests without an Origin header', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            undefined,
            [],
        )).toBe(true);
    });

    it('rejects the browser null origin and arbitrary schemes', () => {
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'null',
            [],
        )).toBe(false);
        expect(isAllowedRequestOrigin(
            request('ping-app-con3.onrender.com'),
            'file:///tmp/ping',
            [],
        )).toBe(false);
    });
});
