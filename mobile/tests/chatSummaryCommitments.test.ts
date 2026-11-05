import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { summaryCommitments } from '../src/utils/chatSummaryCommitments';

const now = new Date('2026-11-05T12:00:00Z');
const me = 'me';

describe('Chat summary shows the real commitments', () => {
    const items = [
        { id: 'a', title: 'Llevar estacas', status: 'resolved', resolved_at: '2026-03-17T16:03:00Z', due_at: '2026-03-17T12:00:00Z' },
        { id: 'b', title: 'Reunión de producción', status: 'cancelled', due_at: '2026-03-14T18:00:00Z' },
        { id: 'c', title: 'Reunión', status: 'accepted', due_at: '2026-11-09T13:00:00Z', assigned_to_user_id: 'ana', assignee: { full_name: 'Ana Pérez' } },
        { id: 'd', title: 'Reunión producción', status: 'accepted', due_at: '2026-03-09T13:45:00Z', assigned_to_user_id: me },
        { id: 'e', title: 'Sin contestar', status: 'proposed', due_at: '2026-11-03T13:00:00Z' },
        { id: 'f', title: 'Revisar documentos', status: 'accepted', due_at: null },
    ];

    it('lists late, next, unanswered and undated ones in that order, and leaves cancelled ones out', () => {
        const { open, openTotal, recentlyDone } = summaryCommitments(items, me, now);
        expect(open.map((c) => [c.id, c.state])).toEqual([['d', 'overdue'], ['c', 'pending'], ['e', 'expired'], ['f', 'pending']]);
        expect(openTotal).toBe(4);
        expect(recentlyDone.map((c) => c.id)).toEqual(['a']);
    });

    it('says who and when in plain words', () => {
        const { open } = summaryCommitments(items, me, now);
        expect(open[0].who).toBe('Tú');
        expect(open[1].who).toBe('Ana');
        expect(open[1].when).toMatch(/^lunes 9 de noviembre, \d{2}:\d{2}$/);
        expect(open[3].when).toBeNull();
    });

    it('the chat passes its commitments to the summary', () => {
        const chat = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'ChatScreen.tsx'), 'utf-8');
        expect(chat).toContain('commitments={groupTasks}');
        expect(chat).toContain("navigation.navigate('TaskHistory', taskHistoryParams)");
    });
});
