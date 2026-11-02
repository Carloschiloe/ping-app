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

    it('groups the list into Atrasado, Hoy, Próximos and Sin fecha, all starting closed', () => {
        expect(hoy).toMatch(/key: 'atrasado', title: 'Atrasado'[^}]*tone: 'danger'/);
        expect(hoy).toMatch(/key: 'hoy', title: 'Hoy'[^}]*tone: 'accent'/);
        expect(hoy).toMatch(/key: 'proximos', title: 'Próximos'/);
        expect(hoy).toMatch(/key: 'sinfecha', title: 'Sin fecha'/);
        expect(hoy).toContain('const isOpen = !!query || (choice ?? !!s.startsOpen);');
    });

    it('the calendar stays hidden until its button is tapped, and a picked day opens right away', () => {
        expect(hoy).toContain('const [calendarVisible, setCalendarVisible] = useState(false);');
        expect(hoy).toContain('const strip = calendarVisible && (');
        expect(hoy).toContain("accessibilityLabel={calendarVisible ? 'Ocultar calendario' : 'Ver calendario'}");
        expect(hoy).toMatch(/key: 'dia',[\s\S]*?startsOpen: true/);
    });

    it('tapping any section title opens or closes the whole section', () => {
        expect(hoy).toContain('onPress={() => toggleSection(s.key, s.isOpen)}');
        expect(hoy).toContain("data: isOpen ? s.data : []");
        expect(hoy).not.toContain('Ver ${s.hiddenCount} más');
        // While searching nothing stays closed.
        expect(hoy).toContain('const isOpen = !!query ||');
    });

    it('section titles are small colored labels, and each section sits on its own card', () => {
        expect(hoy).toContain('styles.countPill');
        expect(hoy).toContain('styles.cardRowFirst');
        expect(hoy).toContain('styles.cardRowLast');
    });

    it('every row shows when it is due on a badge at its left', () => {
        expect(row).toContain('const badge = dayBadge(c.due_at);');
        expect(row).not.toContain('indicatorBar');
    });

    it('finished and cancelled items are one tap away, and a cancel can be undone', () => {
        expect(hoy).toContain('Terminados y cancelados');
        expect(hoy).toContain('onReopen={view === \'historial\' ? handleReopen : undefined}');
        expect(row).toContain('>Reactivar<');
        expect(hoy).toContain('Cancelado. Lo verás en Terminados y cancelados.');
        expect(hoy).toContain('reopenCommitment(undoToast.id);');
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

describe('dayBadge', () => {
    it('names the day in plain words', async () => {
        const { dayBadge } = await import('../src/components/compromisos/dayBadge');
        const now = new Date();
        const at = (days: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.toISOString(); };
        expect(dayBadge(null)).toEqual({ day: 'sin', detail: 'fecha' });
        expect(dayBadge(at(0), now)).toEqual({ day: 'hoy', detail: '10:00' });
        expect(dayBadge(at(-1), now)).toEqual({ day: 'ayer', detail: '10:00' });
        expect(dayBadge(at(1), now)).toEqual({ day: 'mañana', detail: '10:00' });
        expect(dayBadge(at(-400), now).detail).toMatch(/^\d{4}$/);
    });
});

describe('Chat: Agendar from a suggestion keeps its date and assignee', () => {
    const chat = read('screens/ChatScreen.tsx');
    it('maps the camelCase suggestion to the field names the server accepts', () => {
        expect(chat).toContain('due_at: suggestionData.dueAt || null,');
        expect(chat).toContain('assigned_to_user_id: suggestionData.assignedToUserId || null,');
        expect(chat).not.toContain('...suggestionData,\n                                conversation_id');
    });
});

describe('Chat bubbles', () => {
    const item = read('components/MessageItem.tsx');
    it('photos and videos fill the bubble and carry time and ticks on top', () => {
        expect(item).toContain('(isImage || isVideo) ? styles.bubbleVisual');
        expect(item).toContain('metaOnMedia ? styles.metaOverlay');
    });
    it('ticks are large and reactions sit on the bubble edge', () => {
        expect(item).toContain('const TICK_SIZE = 17;');
        expect(item).toMatch(/reactionsContainer: \{[^}]*marginTop: -8/);
    });
});

describe('Reactions and ticks', () => {
    const queries = read('api/query-modules/commitments.ts');
    const item = read('components/MessageItem.tsx');
    it('reactions are saved through the server and shown at once', () => {
        expect(queries).toContain('/messages/${messageId}/reactions`, { reaction: emoji })');
        expect(queries).toContain('onMutate: async ({ messageId, emoji }) => {');
        expect(queries).not.toContain(".from('message_reactions')");
    });
    it('delivery ticks use the drawn DeliveryTicks component', () => {
        expect(item).toContain('<DeliveryTicks');
        expect(item).not.toContain('name="checkmark-done"');
    });
});
