import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';

// These expressions were frozen after the M-7 implementation and are not
// copied from the generalization fixture. The test is opt-in because it uses
// the real staging model/provider.
if (process.env.M7_BLIND_REAL_LLM === '1') dotenv.config();

const REAL_LLM = process.env.M7_BLIND_REAL_LLM === '1';
const ACTOR = '00000000-0000-0000-0000-000000000001';

type BlindCase = {
    id: string;
    group: 'query-create' | 'reject-cancel' | 'negation-confirmation' | 'novel';
    utterance: string;
    route: 'read' | 'write';
    objective?: string;
};

/**
 * Blind manifest: defined after implementation freeze. It tests meaning,
 * not literal phrase membership, and deliberately includes paired contrasts.
 */
const BLIND_CASES: BlindCase[] = [
    { id: 'B01', group: 'query-create', utterance: '¿Qué cosas siguen abiertas esta semana?', route: 'read' },
    // The wording is intentionally ambiguous between a personal reminder
    // and a shared commitment; the acceptance criterion here is that its
    // durable-action speech act reaches WRITE, not that Core invents a
    // participant or overclaims the subtype before entity resolution.
    { id: 'B02', group: 'query-create', utterance: 'Déjame agendado revisar el medidor el jueves a primera hora.', route: 'write' },
    { id: 'B03', group: 'query-create', utterance: '¿Qué tengo que resolver antes del viernes?', route: 'read' },
    { id: 'B04', group: 'query-create', utterance: 'Apúntame revisar el medidor para el jueves.', route: 'write', objective: 'create_personal_commitment' },
    { id: 'B05', group: 'reject-cancel', utterance: 'Declina la propuesta de revisar el techo.', route: 'write', objective: 'respond_to_existing_proposal' },
    { id: 'B06', group: 'reject-cancel', utterance: 'Retira de mi agenda el compromiso de revisar el techo.', route: 'write', objective: 'cancel_existing_commitment' },
    { id: 'B07', group: 'negation-confirmation', utterance: 'No lo dejes guardado.', route: 'write' },
    { id: 'B08', group: 'negation-confirmation', utterance: 'Sí, déjalo guardado.', route: 'write' },
    { id: 'B09', group: 'negation-confirmation', utterance: 'No me recuerdes revisar el tablero.', route: 'write', objective: 'cancel_existing_commitment' },
    { id: 'B10', group: 'negation-confirmation', utterance: 'Sí, anota revisar el tablero el sábado.', route: 'write', objective: 'create_personal_commitment' },
    { id: 'B11', group: 'novel', utterance: '¿Qué onda con lo que tengo pendiente?', route: 'read' },
    { id: 'B12', group: 'novel', utterance: 'Anótame al tiro revisar la bomba el jueves.', route: 'write', objective: 'create_personal_commitment' },
    { id: 'B13', group: 'novel', utterance: 'Recuérdame qué dijimos del medidor.', route: 'read' },
    { id: 'B14', group: 'novel', utterance: 'Recuérdame revisar el medidor el jueves.', route: 'write', objective: 'create_personal_commitment' },
    { id: 'B15', group: 'novel', utterance: '¿A quién le propuse revisar el techo?', route: 'read' },
    { id: 'B16', group: 'novel', utterance: 'Organiza una revisión del techo con Camila para el sábado.', route: 'write', objective: 'create_commitment_or_proposal' },
    { id: 'B17', group: 'novel', utterance: 'Comunícale a Camila que llegaré después de las seis.', route: 'write', objective: 'communicate_message' },
    { id: 'B18', group: 'novel', utterance: 'Pregúntale a Camila si puede mover la revisión.', route: 'write', objective: 'communicate_and_wait' },
    { id: 'B19', group: 'novel', utterance: '¿Cuál de mis compromisos ocurre primero?', route: 'read' },
    { id: 'B20', group: 'novel', utterance: 'Guarda que prefiero llamadas en la mañana.', route: 'write', objective: 'remember_fact' },
    { id: 'B21', group: 'novel', utterance: '¿Qué recuerdas de mi preferencia por llamadas?', route: 'read' },
    { id: 'B22', group: 'novel', utterance: 'No me lo dejes anotado para mañana.', route: 'write' },
];

describe.skipIf(!REAL_LLM)('M-7 blind natural-language evidence', () => {
    it('classifies frozen unseen expressions and paired semantic contrasts', async () => {
        const failures: Array<{ id: string; group: string; utterance: string; expected: string; observed: string }> = [];
        const batchSize = 4;
        for (let offset = 0; offset < BLIND_CASES.length; offset += batchSize) {
            const batch = BLIND_CASES.slice(offset, offset + batchSize);
            const results = await Promise.all(batch.map(async (item) => {
                const result = await interpretAgentSemanticTurn(item.utterance, { actorUserId: ACTOR });
                const observedObjective = result.objective?.objectiveType ?? null;
                const objectiveMatches = !item.objective || observedObjective === item.objective;
                if (result.route !== item.route || !objectiveMatches) {
                    return {
                        id: item.id,
                        group: item.group,
                        utterance: item.utterance,
                        expected: `${item.route}/${item.objective ?? '-'}`,
                        observed: `${result.route}/${observedObjective ?? '-'} [input:${result.interpretation.source}; objective:${result.objective?.source ?? '-'}]`,
                    };
                }
                return null;
            }));
            failures.push(...results.filter((value): value is NonNullable<typeof value> => value !== null));
        }

        expect({ failureCount: failures.length, firstFailures: failures.slice(0, 20) }).toEqual({
            failureCount: 0,
            firstFailures: [],
        });
    }, 900000);
});
