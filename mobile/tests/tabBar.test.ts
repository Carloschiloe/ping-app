import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('Bottom buttons Chats, Hoy and Perfil', () => {
    it('always show on the chat list, even if it was opened twice', () => {
        const bar = read('design/FloatingTabBar.tsx');
        expect(bar).toContain("new Set(['ConversationsList', 'ProfileHome'])");
        expect(bar).toContain('!TAB_HOME_SCREENS.has(nestedRoute)');
    });
});
