import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('Graphite and gold design', () => {
    const chats = read('screens/ConversationsScreen.tsx');
    const row = read('components/ConversationRow.tsx');
    const nav = read('navigation/index.tsx');

    it('Chats and its rows read every color from the design tokens', () => {
        for (const source of [chats, row]) {
            expect(source).not.toContain('useAppTheme');
            expect(source).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source).toContain("from '../design/tokens'");
        }
    });

    it('the tab bar is the floating glass bar', () => {
        expect(nav).toContain('tabBar={(props) => <GlassTabBar {...props} />}');
        expect(nav).not.toContain('tabBarStyle');
    });

    it('the app waits for the Manrope font before drawing', () => {
        expect(fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8')).toContain('if (!fontsLoaded) return null;');
    });
});
