import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closingResult, remainingDueOptions } from '../src/utils/commitmentClosing';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

describe('Closing a commitment says how it went', () => {
    it('keeps what the user wrote, or a plain word when they wrote nothing', () => {
        expect(closingResult('done', 'Enviada por correo, la recibió Pedro')).toBe('Enviada por correo, la recibió Pedro');
        expect(closingResult('done', '  ')).toBe('Hecho.');
        expect(closingResult('done', '', true)).toBe('Se hizo.');
        expect(closingResult('not_done', '')).toBe('No se hizo.');
    });

    it('a very short note stays next to the outcome, so the server always gets a few words', () => {
        expect(closingResult('done', 'ok')).toBe('Hecho: ok');
        expect(closingResult('not_done', 'no')).toBe('No se hizo: no');
    });

    it('half done always says so, with what is missing', () => {
        expect(closingResult('partial', 'falta la firma')).toBe('Hecho a medias: falta la firma');
        expect(closingResult('partial', '')).toBe('Hecho a medias.');
        expect(closingResult('partial', 'acta', true)).toBe('Quedó algo pendiente: acta');
    });

    it('Hoy and the chat card close through the same sheet', () => {
        const hoy = read('screens/HoyScreen.tsx');
        const card = read('components/GroupTaskCard.tsx');
        for (const src of [hoy, card]) {
            expect(src).toContain('<CloseCommitmentSheet');
            expect(src).toContain('useCloseCommitment()');
        }
        expect(hoy).not.toContain('Resuelto desde Hoy.');
        expect(card).not.toContain('Marcar acción realizada');
    });

    it('half done stays open with a new date and what is missing, right in the sheet', () => {
        const close = read('hooks/useCloseCommitment.ts');
        expect(close).toContain("if (outcome === 'partial' && dueAt)");
        expect(close).toContain('await update({ id: item.id, data: { due_at: iso } });');
        expect(close).toContain('nextAction: missing');
        expect(close).toContain('undo: () => update({ id: item.id, data: { due_at: previous } })');
        expect(read('screens/HoyScreen.tsx')).not.toContain('Recuérdame terminar');
        expect(read('components/compromisos/CloseCommitmentSheet.tsx')).toContain('¿Para cuándo?');
    });

    it('quick dates for the rest are tomorrow, in three days and next week, at ten', () => {
        const now = new Date(2026, 10, 4, 16, 30);
        const options = remainingDueOptions(now);
        expect(options.map((o) => o.label)).toEqual(['Mañana', 'En 3 días', 'Próxima semana']);
        expect(options.map((o) => o.date.getDate())).toEqual([5, 7, 11]);
        expect(options.every((o) => o.date.getHours() === 10 && o.date.getMinutes() === 0)).toBe(true);
    });

    it('the creator and the person it was given to are offered "No se hizo", since both can call it off', () => {
        const sheet = read('components/compromisos/CloseCommitmentSheet.tsx');
        expect(sheet).toContain("o.outcome !== 'not_done' || canCancel");
        expect(read('screens/HoyScreen.tsx')).toContain('canCancel={!!closeItem && (closeItem.owner_user_id === user?.id || closeItem.assigned_to_user_id === user?.id)}');
        expect(read('components/GroupTaskCard.tsx')).toContain('canCancel={isOwner || isAssignee}');
    });

    it('the overdue notice walks through each overdue item, and every close can be undone', () => {
        const hoy = read('screens/HoyScreen.tsx');
        expect(hoy).toContain('startReview(mineData.overdue)');
        expect(hoy).toContain('showUndo(notice);');
        expect(hoy).toContain('undoToast.undo();');
    });
});
