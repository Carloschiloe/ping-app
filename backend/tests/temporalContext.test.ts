import { describe, expect, it } from 'vitest';
import { buildVerifiedTemporalContext } from '../src/utils/temporalContext';

describe('verified temporal context for Ping AI', () => {
    it('identifies the real weekday and separates this week from next week', () => {
        const context = buildVerifiedTemporalContext(
            '2026-07-30T15:00:00.000Z',
            [
                {
                    id: 'current',
                    title: 'Ver película',
                    status: 'accepted',
                    due_at: '2026-07-31T17:00:00.000Z',
                },
                {
                    id: 'next',
                    title: 'Hacer supermercado',
                    status: 'accepted',
                    due_at: '2026-08-05T17:00:00.000Z',
                },
            ]
        );

        expect(context.verifiedNow).toContain('jueves');
        expect(context.commitments[0]).toMatchObject({
            weekRelation: 'esta_semana',
        });
        expect(context.commitments[0].verifiedLocalDate).toContain('viernes');
        expect(context.commitments[1]).toMatchObject({
            weekRelation: 'proxima_semana',
        });
        expect(context.commitments[1].verifiedLocalDate).toContain('miércoles');
    });

    it('does not invent dates for undated commitments', () => {
        const context = buildVerifiedTemporalContext(
            '2026-07-30T15:00:00.000Z',
            [{ id: 'undated', title: 'Revisar idea', status: 'accepted', due_at: null }]
        );

        expect(context.commitments[0]).toMatchObject({
            verifiedLocalDate: 'Sin fecha',
            weekRelation: 'sin_fecha',
        });
    });
});
