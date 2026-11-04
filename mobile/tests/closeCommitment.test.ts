import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closingResult } from '../src/utils/commitmentClosing';

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
            expect(src).toContain("if (outcome === 'not_done')");
        }
        expect(hoy).not.toContain('Resuelto desde Hoy.');
        expect(card).not.toContain('Marcar acción realizada');
    });

    it('only the owner is offered "No se hizo", since only the owner can call it off', () => {
        const sheet = read('components/compromisos/CloseCommitmentSheet.tsx');
        expect(sheet).toContain("o.outcome !== 'not_done' || canCancel");
        expect(read('screens/HoyScreen.tsx')).toContain('canCancel={!!closeItem && closeItem.owner_user_id === user?.id}');
        expect(read('components/GroupTaskCard.tsx')).toContain('canCancel={isOwner}');
    });

    it('the overdue notice walks through each overdue item, and every close can be undone', () => {
        const hoy = read('screens/HoyScreen.tsx');
        expect(hoy).toContain('startReview(mineData.overdue)');
        expect(hoy).toContain("showUndo(item.id, outcome === 'not_done' ? 'Cerrado como no hecho.' : 'Marcado como hecho.')");
        expect(hoy).toContain('reopenCommitment(undoToast.id)');
    });
});
