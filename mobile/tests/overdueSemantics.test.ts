// M-1H v3 — FINAL CANONICAL OVERDUE SEMANTICS. Espejo EXACTO de
// backend/tests/overdueSemantics.test.ts: mismos 8 instantes temporales
// (verificados con Intl.DateTimeFormat contra America/Santiago, no
// aritmética de zona horaria hecha a mano), mismo EXPECTED_OVERDUE_IDS del
// dataset de paridad completa.
//
// Timezone: a diferencia del backend (servidor sin zona propia, necesita un
// IANA timezone explícito por parámetro), mobile usa la hora LOCAL del
// proceso (el dispositivo real del usuario está en su propia zona). Para
// que este archivo sea comparable 1:1 contra America/Santiago sin depender
// de la zona del host donde corra vitest, se fija `process.env.TZ` SÓLO
// para este archivo (Node/V8 lee TZ de forma perezosa en cada llamada a
// Date/Intl, confirmado -- no requiere reiniciar el proceso) y se restaura
// al terminar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Import estático normal: commitmentDisplay.ts no cachea nada de Date/zona
// al importarse -- sus funciones llaman a Date/date-fns perezosamente en
// cada invocación, momento en el que process.env.TZ (fijado en beforeAll de
// abajo) ya está activo.
import { isCommitmentOverdue } from '../src/utils/commitmentDisplay';

let originalTz: string | undefined;
beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = 'America/Santiago';
});
afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
});

// Mismos instantes reales que el espejo backend:
//   NOW                = 2026-01-15T18:00:00Z -> 2026-01-15 15:00 Santiago
//   YESTERDAY_2300     = 2026-01-15T02:00:00Z -> 2026-01-14 23:00 Santiago
//   TODAY_0001         = 2026-01-15T03:01:00Z -> 2026-01-15 00:01 Santiago
//   TODAY_MINUS_1MIN   = 2026-01-15T17:59:00Z -> 2026-01-15 14:59 Santiago
//   TODAY_PLUS_1H      = 2026-01-15T19:00:00Z -> 2026-01-15 16:00 Santiago
//   TODAY_2359         = 2026-01-16T02:59:00Z -> 2026-01-15 23:59 Santiago
//   TOMORROW           = 2026-01-16T13:00:00Z -> 2026-01-16 10:00 Santiago
const NOW = new Date('2026-01-15T18:00:00Z');

describe('CANONICAL_OVERDUE_RULE: sanity check -- TZ=America/Santiago realmente está activo en este proceso', () => {
    it('Date.getHours() de NOW debe ser 15 (hora local Santiago), nunca la hora UTC (18) ni la del host original', () => {
        expect(NOW.getHours()).toBe(15);
    });
});

describe('CANONICAL_OVERDUE_RULE: temporal boundary tests (America/Santiago) — sección 10 del ticket', () => {
    const cases: Array<[string, string | null, boolean]> = [
        ['ayer 23:00', '2026-01-15T02:00:00Z', true],
        ['hoy 00:01', '2026-01-15T03:01:00Z', false],
        ['hoy hace 1 minuto', '2026-01-15T17:59:00Z', false],
        ['ahora (due_at === now)', NOW.toISOString(), false],
        ['hoy dentro de 1 hora', '2026-01-15T19:00:00Z', false],
        ['hoy 23:59', '2026-01-16T02:59:00Z', false],
        ['mañana', '2026-01-16T13:00:00Z', false],
        ['sin due_at', null, false],
    ];

    it.each(cases)('%s -> isOverdue=%s (status accepted, referenceDay=now por defecto)', (_label, dueAt, expected) => {
        expect(isCommitmentOverdue({ status: 'accepted', due_at: dueAt }, NOW)).toBe(expected);
    });

    it('proposed y counter_proposal aplican la MISMA regla de fecha que accepted', () => {
        expect(isCommitmentOverdue({ status: 'proposed', due_at: '2026-01-14T12:00:00Z' }, NOW)).toBe(true);
        expect(isCommitmentOverdue({ status: 'counter_proposal', due_at: '2026-01-14T12:00:00Z' }, NOW)).toBe(true);
        expect(isCommitmentOverdue({ status: 'proposed', due_at: '2026-01-16T02:59:00Z' }, NOW)).toBe(false); // hoy 23:59 Santiago
    });

    it('resolved/cancelled/rejected NUNCA están vencidos, incluso con due_at claramente pasado', () => {
        for (const status of ['resolved', 'cancelled', 'rejected']) {
            expect(isCommitmentOverdue({ status, due_at: '2026-01-14T12:00:00Z' }, NOW)).toBe(false);
        }
    });
});

// ─── Sección 11: paridad completa — espejo EXACTO de
// backend/tests/overdueSemantics.test.ts (mismos ids, mismas fechas).
const EXPECTED_OVERDUE_IDS = [
    'pending-proposal-ayer',
    'shared-proposal-ayer',
    'counter-proposal-ayer',
    'proposed-commitment-ayer',
    'accepted-commitment-ayer',
].sort();

const AYER = '2026-01-15T02:00:00Z';
const HOY_PASADA = '2026-01-15T17:59:00Z';
const HOY_FUTURA = '2026-01-15T19:00:00Z';
const MANANA = '2026-01-16T13:00:00Z';

// Shape "legacy" (snake_case), igual al que toAgreementView/toLegacyCommitmentShape
// devuelven realmente -- isCommitmentOverdue consume { status, due_at }.
const DATASET = [
    { id: 'pending-proposal-ayer', status: 'proposed', due_at: AYER },
    { id: 'pending-proposal-hoy-pasada', status: 'proposed', due_at: HOY_PASADA },
    { id: 'pending-proposal-hoy-futura', status: 'proposed', due_at: HOY_FUTURA },
    { id: 'pending-proposal-manana', status: 'proposed', due_at: MANANA },
    // "shared-proposal" comparte el MISMO status derivado que una proposal
    // solo (proposed) -- la distinción solo/compartida vive en
    // agreement_responses (dispatch de confirm), no en la regla de overdue.
    { id: 'shared-proposal-ayer', status: 'proposed', due_at: AYER },
    { id: 'counter-proposal-ayer', status: 'counter_proposal', due_at: AYER },
    { id: 'counter-proposal-manana', status: 'counter_proposal', due_at: MANANA },
    { id: 'proposed-commitment-ayer', status: 'proposed', due_at: AYER },
    { id: 'proposed-commitment-hoy-futura', status: 'proposed', due_at: HOY_FUTURA },
    { id: 'accepted-commitment-ayer', status: 'accepted', due_at: AYER },
    { id: 'accepted-commitment-hoy-pasada', status: 'accepted', due_at: HOY_PASADA },
    { id: 'rejected-ayer', status: 'rejected', due_at: AYER },
    { id: 'resolved-ayer', status: 'resolved', due_at: AYER },
    { id: 'cancelled-ayer', status: 'cancelled', due_at: AYER },
];

describe('CANONICAL_OVERDUE_RULE: UI_OVERDUE_IDS (Mis Compromisos / Encargados) -- misma función, mismo resultado (sección 11)', () => {
    it('Mis Compromisos: coincide exactamente con EXPECTED_OVERDUE_IDS', () => {
        const uiOverdueIds = DATASET.filter((item) => isCommitmentOverdue(item, NOW)).map((i) => i.id).sort();
        expect(uiOverdueIds).toEqual(EXPECTED_OVERDUE_IDS);
    });

    it('Encargados: MISMA llamada (isCommitmentOverdue(item, now), sin referenceDay distinto) -- ya no una tercera regla propia', () => {
        // M-1H v3: antes InsightsScreen.tsx#encargadosData tenía su propia
        // condición (sin carve-out de día, sin excluir cancelled/rejected).
        // Ahora usa literalmente la misma llamada que Mis Compromisos -- este
        // test es la regresión que evita que alguien vuelva a divergirlas.
        const encargadosOverdueIds = DATASET.filter((item) => isCommitmentOverdue(item, NOW)).map((i) => i.id).sort();
        expect(encargadosOverdueIds).toEqual(EXPECTED_OVERDUE_IDS);
    });
});

describe('CANONICAL_OVERDUE_RULE: Hoy (TaskDashboardScreen, referenceDay=selectedDate) -- items de "hoy" nunca aparecen como vencidos', () => {
    it('con selectedDate=hoy, los items hoy-pasada/hoy-futura NUNCA están vencidos (aparecen en la lista de Hoy, no en Vencidos)', () => {
        const today = NOW; // TaskDashboardScreen: selectedDate por defecto es "hoy"
        const hoyPasada = DATASET.find((i) => i.id === 'pending-proposal-hoy-pasada')!;
        const hoyFutura = DATASET.find((i) => i.id === 'pending-proposal-hoy-futura')!;
        expect(isCommitmentOverdue(hoyPasada, NOW, today)).toBe(false);
        expect(isCommitmentOverdue(hoyFutura, NOW, today)).toBe(false);
    });

    it('HOY_OVERDUE_IDS con referenceDay=hoy coincide con EXPECTED_OVERDUE_IDS -- misma regla que Mis Compromisos/Encargados cuando se navega al día real', () => {
        const today = NOW;
        const hoyOverdueIds = DATASET.filter((item) => isCommitmentOverdue(item, NOW, today)).map((i) => i.id).sort();
        expect(hoyOverdueIds).toEqual(EXPECTED_OVERDUE_IDS);
    });
});
