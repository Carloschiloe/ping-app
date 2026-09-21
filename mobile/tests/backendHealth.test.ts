import { describe, expect, it } from 'vitest';
import { getBackendHealthUrl } from '../src/utils/backendHealth';

describe('backend health URL', () => {
    it('uses the root health endpoint when the API base ends in /api', () => {
        expect(getBackendHealthUrl('http://192.168.1.15:3001/api')).toBe('http://192.168.1.15:3001/health');
    });

    it('does not duplicate slashes or /api when the base is already normalized', () => {
        expect(getBackendHealthUrl('https://example.test/api/')).toBe('https://example.test/health');
        expect(getBackendHealthUrl('http://localhost:3000')).toBe('http://localhost:3000/health');
    });
});
