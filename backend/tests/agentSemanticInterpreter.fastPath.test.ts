import { afterEach, describe, expect, it } from 'vitest';
import { DeterministicInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { isDeterministicReadFastPathEligible } from '../src/services/agentSemanticInterpreter.service';

const noDialogue = {
    pendingPlan: undefined,
    activeObjective: undefined,
    dialogueReconciliation: undefined,
};

describe('deterministic semantic read fast path', () => {
    afterEach(() => {
        delete process.env.PING_ENABLE_SEMANTIC_READ_FAST_PATH;
    });

    it.each([
        '¿Qué compromisos tengo para mañana?',
        '¿Qué tengo vencido?',
        '¿Qué hablamos del viaje?',
        '¿Qué le prometí a Laura?',
        '¿Cuántos pendientes tengo?',
    ])('accepts a clear read: %s', async (input) => {
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(true);
    });

    it('accepts a social turn without calling the provider', async () => {
        const input = 'hola, ¿cómo estás?';
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(true);
    });

    it('does not bypass the semantic model for actions', async () => {
        const input = 'Agenda mañana comprar materiales';
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(interpretation.isWriteActionRequest).toBe(true);
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(false);
    });

    it('does not bypass declarative commitment capture when punctuation is absent', async () => {
        const input = 'Tengo que llamar a Pedro';
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(false);
    });

    it.each([
        'I have to call an unregistered person',
        'Assign tomorrow the review to an unregistered person',
    ])('does not bypass declarative commitment capture in English: %s', async (input) => {
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(false);
    });

    // Word order must not decide whether a write reaches the semantic model:
    // a leading time expression or a non-listed verb used to make these
    // statements look like plain reads and silently drop the commitment.
    it.each([
        'mañana tengo que llamar a Marcelo a las diez',
        'el viernes debo pagar la luz',
        'no olvides que mañana llamo a Marcelo',
        'a las nueve tengo reunión con Laura',
        'pasado mañana hay que llevar el auto al taller',
        'el viernes debo pagar la luz (¿o era el sábado?)',
    ])('does not bypass a declarative statement regardless of word order: %s', async (input) => {
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(false);
    });

    it.each([
        'qué tengo mañana',
        'cuándo es la reunión con Laura',
        '¿Tengo algo el viernes?',
    ])('keeps the fast path for question-shaped reads without punctuation: %s', async (input) => {
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(true);
    });

    it('does not bypass dialogue reconciliation', async () => {
        const input = '¿Qué tengo para mañana?';
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, {
            pendingPlan: { objectiveType: 'create_personal_commitment' },
            activeObjective: undefined,
            dialogueReconciliation: 'pending_plan',
        })).toBe(false);
    });

    it('can be disabled explicitly for controlled rollback', async () => {
        process.env.PING_ENABLE_SEMANTIC_READ_FAST_PATH = 'false';
        const input = '¿Qué tengo para mañana?';
        const interpretation = await new DeterministicInputInterpreter().interpret(input, {});
        expect(isDeterministicReadFastPathEligible(input, interpretation, noDialogue)).toBe(false);
    });
});
