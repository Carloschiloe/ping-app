import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('Hoy — one tab for the day and every commitment', () => {
    const nav = read('navigation/index.tsx');
    const hoy = read('screens/HoyScreen.tsx');
    const row = read('components/compromisos/CommitmentRow.tsx');

    it('the app has three tabs: Chats, Hoy and Perfil', () => {
        const tabs = [...nav.matchAll(/<Tab\.Screen name="(\w+)"/g)].map((m) => m[1]);
        expect(tabs).toEqual(['Chats', 'Hoy', 'Perfil']);
        expect(nav).not.toContain('TaskDashboardScreen');
        expect(nav).not.toContain('InsightsScreen');
    });

    it('splits what I owe from what others owe me', () => {
        expect(hoy).toContain("['mine', 'Yo debo', mineData.pendingCount]");
        expect(hoy).toContain("['theirs', 'Me deben', theirsData.pendingCount]");
    });

    it('keeps later days and recent done items folded, and opens them while searching', () => {
        for (const key of ['manana', 'semana', 'adelante', 'sinfecha', 'hechos']) {
            expect(hoy).toMatch(new RegExp(`key: '${key}'[^}]*collapsible: true`));
        }
        expect(hoy).toContain('isOpen: !s.collapsible || !!query');
    });

    it('a meeting from a past day leaves the list instead of turning overdue', () => {
        expect(hoy).toContain('if (classifyMeeting(c) && date < today) return;');
    });

    it('a meeting offers no "Listo" button', () => {
        expect(row).toContain("if (isMeeting && primaryAction === 'complete') return null;");
    });

    it('"Me deben" rows offer Recordarle and Ya me lo dio', () => {
        expect(hoy).toContain("onNudge={view === 'theirs' ? handleNudge : undefined}");
        expect(hoy).toContain("onReceived={view === 'theirs' ? handleReceived : undefined}");
        expect(hoy).toContain('await Share.share({ message: reminderMessage(c, name) });');
        expect(row).toContain('>Recordarle<');
        expect(row).toContain("onReceived && primaryAction === 'complete'");
    });

    it('the + button opens Ping with a draft ready to finish', () => {
        expect(hoy).toContain("onPress={() => openPing('Recuérdame ')}");
        expect(hoy).toContain("screen: 'PingAI'");
        expect(read('screens/AgentPreviewScreen.tsx')).toContain('setInputText(draftParam);');
    });

    it('an empty day says so and shows what comes next', () => {
        expect(hoy).toContain('Hoy estás libre');
        expect(hoy).toContain('Lo próximo:');
    });
});
