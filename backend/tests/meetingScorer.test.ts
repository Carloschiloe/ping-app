// Checks of the checker itself: these use no model at all. They prove the
// references are consistent and the scoring rules do what they say.
import { describe, expect, it } from 'vitest';
import { MEETING_CASES, MEETING_USER, longMeetingCases, type MeetingCase } from './fixtures/meetingBench';
import { scoreCase, speakerAccuracy, totals, wordErrorRate, keyTermsKept } from './support/meetingScorer';
import { normalizeMeetingAnalysis } from '../src/services/meetings/meetingAnalysis';
import type { MeetingAnalysis } from '../src/services/meetings/meetingTypes';

function perfectAnswer(id: string, pool: MeetingCase[] = MEETING_CASES): MeetingAnalysis {
    const testCase = pool.find((c) => c.id === id)!;
    const refs = testCase.commitments;
    return {
        summary: (testCase.facts || []).map((groups) => groups.map((g) => g[0]).join(' ')).join('. '),
        decisions: (testCase.decisions || []).map((groups) => groups.map((g) => g[0]).join(' ')),
        commitments: refs.map((ref) => ({
            owner: [ref.owner].flat()[0], ownerIsUser: [ref.owner].flat()[0] === MEETING_USER,
            task: ref.what.map((g) => g[0]).join(' '), dueDate: ref.due, dueText: null,
            conditional: !!ref.conditional, condition: null,
            dependsOn: ref.dependsOn ? refs.findIndex((r) => r.id === ref.dependsOn) : null,
            quote: null, confidence: 'alta' as const,
        })),
        openQuestions: [],
    };
}

describe('meeting test set', () => {
    it('has 50 meetings with unique ids and dates on the calendar', () => {
        expect(MEETING_CASES).toHaveLength(50);
        expect(new Set(MEETING_CASES.map((c) => c.id)).size).toBe(50);
        for (const c of MEETING_CASES) for (const ref of c.commitments) {
            if (ref.due) expect(ref.due).toMatch(/^2026-1[12]-\d{2}$/);
            if (ref.dependsOn) expect(c.commitments.some((r) => r.id === ref.dependsOn)).toBe(true);
        }
    });

    it('gives full marks to an answer that copies every reference', () => {
        const scores = MEETING_CASES.map((c) => scoreCase(c, perfectAnswer(c.id)));
        for (const s of scores) expect({ id: s.id, problems: s.problems }).toEqual({ id: s.id, problems: [] });
        const sum = totals(scores, MEETING_CASES);
        expect(sum.perfectCases).toBe(50);
        expect(sum.recall).toBe(1);
        expect(sum.precision).toBe(1);
    });

    it('the long joined meetings keep every reference and still score a copy as perfect', () => {
        const long = longMeetingCases(25);
        expect(long).toHaveLength(2);
        expect(long.reduce((a, c) => a + c.commitments.length, 0)).toBe(MEETING_CASES.reduce((a, c) => a + c.commitments.length, 0));
        for (const c of long) expect(scoreCase(c, perfectAnswer(c.id, long)).problems).toEqual([]);
    });

    it('a reference answer never trips a "must not" rule of its own meeting', () => {
        for (const c of MEETING_CASES) expect(scoreCase(c, perfectAnswer(c.id)).mustNotHits).toBe(0);
    });

    it('counts an empty answer as missing everything and inventing nothing', () => {
        const empty = { summary: '', decisions: [], commitments: [], openQuestions: [] };
        const sum = totals(MEETING_CASES.map((c) => scoreCase(c, empty)), MEETING_CASES);
        expect(sum.recall).toBe(0);
        expect(sum.invented).toBe(0);
        expect(sum.noCommitmentCasesClean).toBe('7/7');
    });

    it('catches a cancelled item, the old quantity, a wrong owner and a wrong date', () => {
        const m38 = MEETING_CASES.find((c) => c.id === 'm38')!;
        const answer = perfectAnswer('m38');
        answer.commitments.push({ ...answer.commitments[0], task: 'Despachar 120 cajas' });
        expect(scoreCase(m38, answer).mustNotHits).toBe(1);

        const m03 = MEETING_CASES.find((c) => c.id === 'm03')!;
        const wrong = perfectAnswer('m03');
        wrong.commitments[0].owner = 'Carlos';
        wrong.commitments[0].dueDate = '2026-11-16';
        const s = scoreCase(m03, wrong);
        expect(s.found).toBe(1);
        expect(s.ownerOk).toBe(0);
        expect(s.dateOk).toBe(0);
        expect(s.perfect).toBe(false);
    });

    it('notices a missing dependency', () => {
        const m06 = MEETING_CASES.find((c) => c.id === 'm06')!;
        const answer = perfectAnswer('m06');
        answer.commitments[1].dependsOn = null;
        expect(scoreCase(m06, answer).dependencyOk).toBe(0);
    });
});

describe('transcription checks', () => {
    it('measures word errors', () => {
        expect(wordErrorRate('te mando la cotización el miércoles', 'te mando la cotizacion el miercoles').wer).toBe(0);
        const r = wordErrorRate('te mando la cotización el miércoles', 'te mando cotización el jueves');
        expect(r.deletions).toBe(1);
        expect(r.substitutions).toBe(1);
        expect(r.wer).toBeCloseTo(2 / 6);
        expect(wordErrorRate('son 450.000 pesos', 'son 450000 pesos').wer).toBe(0);
    });

    it('measures who said what, whatever the labels are called', () => {
        const reference = [{ speaker: 'Paula', text: 'yo te mando la cotización' }, { speaker: 'Carlos', text: 'perfecto gracias' }];
        expect(speakerAccuracy(reference, [{ speaker: 'B', text: 'yo te mando la cotización' }, { speaker: 'A', text: 'perfecto gracias' }])).toBe(1);
        expect(speakerAccuracy(reference, [{ speaker: 'A', text: 'yo te mando la cotización perfecto gracias' }])).toBeCloseTo(5 / 7);
        expect(speakerAccuracy(reference, [{ speaker: null, text: 'yo te mando' }])).toBeNull();
    });

    it('finds names and figures kept in a transcript', () => {
        expect(keyTermsKept(['210', 'Hugo', 'la Vega'], 'Hugo: son 210 cajas para la vega').lost).toEqual([]);
        expect(keyTermsKept(['210'], 'son 120 cajas').lost).toEqual(['210']);
    });
});

describe('cleaning what a model returns', () => {
    it('drops repeats, keeps dependencies pointing at the right item and spots the user', () => {
        const analysis = normalizeMeetingAnalysis({
            summary: ' Reunión breve. ',
            decisions: ['Subir precios 5%', ''],
            commitments: [
                { owner: 'Fernanda', task: 'Pasar datos de ventas', due_date: '2026-11-19T09:00', conditional: false },
                { owner: 'Fernanda', task: 'Pasar datos de ventas', due_date: '2026-11-19' },
                { owner: 'Carlos', task: 'Armar informe', due_date: '2026-11-20', depends_on: 1 },
                { owner: 'X', task: '' },
            ],
        }, 'Carlos');
        expect(analysis.commitments).toHaveLength(2);
        expect(analysis.commitments[0].dueDate).toBe('2026-11-19');
        expect(analysis.commitments[1].dependsOn).toBe(0);
        expect(analysis.commitments[1].ownerIsUser).toBe(true);
        expect(analysis.decisions).toEqual(['Subir precios 5%']);
        expect(analysis.summary).toBe('Reunión breve.');
    });
});
