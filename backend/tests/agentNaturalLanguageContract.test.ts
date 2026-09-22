import { describe, expect, it } from 'vitest';
import { DeterministicInputInterpreter } from '../src/services/agentInputInterpreter.service';
import { DeterministicObjectiveInterpreter } from '../src/services/agentObjectiveInterpreter.service';
import { resolveDeterministicRouting } from '../src/services/agentPlanOrchestrator.service';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Ping Core — contrato de lenguaje natural antes de voz/tablet', () => {
    const inputInterpreter = new DeterministicInputInterpreter();
    const objectiveInterpreter = new DeterministicObjectiveInterpreter();

    it.each([
        ['Necesito acordarme de llamar a Pedro mañana', 'create_personal_commitment', 'llamar a Pedro'],
        ['Me ayudas a organizar lo de la reunión con Ana para el viernes', 'create_commitment_or_proposal', 'lo de la reunión con Ana'],
        ['Cuando puedas recuérdame revisar el contrato', 'create_personal_commitment', 'revisar el contrato'],
        ['Hazte cargo de coordinar la reunión', 'create_commitment_or_proposal', 'coordinar la reunión'],
    ] as const)('resuelve la intención natural: %s', async (utterance, objectiveType, entityHint) => {
        const routing = await resolveDeterministicRouting(utterance, { actorUserId: ACTOR_ID });
        expect(routing.isWriteActionRequest).toBe(true);
        expect(routing.resolvedObjective?.objectiveType).toBe(objectiveType);
        expect(routing.resolvedObjective?.targetEntities.entityHints[0]).toBe(entityHint);
    });

    it('mantiene una pregunta natural como lectura y no la convierte en escritura', async () => {
        const interpretation = await inputInterpreter.interpret('¿Qué debería hacer hoy?', {});
        expect(interpretation.isWriteActionRequest).toBe(false);
        expect(interpretation.textQuery).toBeNull();
        expect(interpretation.timeExpression).toBe('hoy');
    });

    it('mantiene recall natural y tema real para recuperar evidencia', async () => {
        const interpretation = await inputInterpreter.interpret('¿Te acuerdas de lo que hablamos sobre el proyecto?', {});
        expect(interpretation.intent).toBe('recall');
        expect(interpretation.textQuery).toBe('proyecto');
    });

    it('usa el mismo contrato para un transcript de voz final', async () => {
        const transcript = 'Necesito acordarme de llamar a Pedro mañana';
        const interpretation = await inputInterpreter.interpret(transcript, {});
        const objective = await objectiveInterpreter.interpret(transcript, { actorUserId: ACTOR_ID });
        expect(interpretation.isWriteActionRequest).toBe(true);
        expect(objective.objectiveType).toBe('create_personal_commitment');
        expect(objective.targetEntities.entityHints[0]).toBe('llamar a Pedro');
    });

    it.each([
        ['¿Qué compromisos tengo hoy?', 'commitment_query', 'hoy', null],
        ['¿Cuál es más temprano?', 'commitment_query', null, 'earliest'],
        ['¿Cuál vence antes?', 'commitment_query', null, 'earliest'],
        ['¿Cuál vence después?', 'commitment_query', null, 'latest'],
    ] as const)('un transcript hablado de lectura conserva el contrato semántico: %s', async (transcript, intent, timeExpression, temporalComparison) => {
        const interpretation = await inputInterpreter.interpret(transcript, {});
        expect(interpretation.intent).toBe(intent);
        expect(interpretation.timeExpression).toBe(timeExpression);
        expect(interpretation.temporalComparison ?? null).toBe(temporalComparison);
        expect(interpretation.isWriteActionRequest).toBe(false);
    });

    it.each([
        ['No se me olvide llamar a Pedro manana', 'create_personal_commitment', 'llamar a Pedro'],
        ['Acuérdate de enviar el informe el viernes', 'create_personal_commitment', 'enviar el informe'],
        ['Ayúdame a coordinar la reunión con Ana', 'create_commitment_or_proposal', 'la reunión con Ana'],
        ['¿Me puedes recordar que llame a Pedro mañana?', 'create_personal_commitment', 'llame a Pedro'],
        ['¿Puedes recordarme revisar el contrato el viernes?', 'create_personal_commitment', 'revisar el contrato'],
    ] as const)('tolera variaciones informales o transcript sin tildes: %s', async (utterance, objectiveType, entityHint) => {
        const routing = await resolveDeterministicRouting(utterance, { actorUserId: ACTOR_ID });
        expect(routing.isWriteActionRequest).toBe(true);
        expect(routing.resolvedObjective?.objectiveType).toBe(objectiveType);
        expect(routing.resolvedObjective?.targetEntities.entityHints[0]).toBe(entityHint);
    });
});
