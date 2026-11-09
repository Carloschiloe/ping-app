import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('M11 — what Ping remembers', () => {
    it('reads and forgets facts through the memory endpoints', () => {
        const api = read('api/query-modules/memory.ts');
        expect(api).toContain("apiClient.get('/memory/facts')");
        expect(api).toContain('apiClient.delete(`/memory/facts/${id}`)');
        expect(read('api/query-modules/index.ts')).toContain("export * from './memory';");
    });

    it('Ajustes opens the list, and forgetting asks first', () => {
        expect(read('screens/SettingsScreen.tsx')).toContain('<MemorySheet visible={memoryVisible}');
        const sheet = read('components/perfil/MemorySheet.tsx');
        expect(sheet).toContain("Alert.alert('¿Olvidar esto?'");
        expect(sheet).toContain('useRememberedFacts(visible)');
    });
});
