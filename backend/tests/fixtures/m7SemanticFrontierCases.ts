export type FrontierCase = {
    id: string;
    utterance: string;
    expected: {
        kind: 'read_request' | 'write_request' | 'slot_answer' | 'lifecycle_command' | 'unknown';
        domain?: 'commitment' | 'messaging' | 'people' | 'historical_read' | 'generic' | 'unknown';
        objectiveType?: string | null;
        independentObjective?: 'yes' | 'no' | 'unknown';
        continuationLike?: 'yes' | 'no' | 'unknown';
        lifecycleCommand?: 'none' | 'abandon' | 'resume';
    };
    dialogue?: {
        lifecycle: 'none' | 'active' | 'suspended' | 'active_and_suspended';
        activeObjectiveType: string | null;
        missingSlotType: string | null;
        suspendedObjectiveType: string | null;
        referentHints: string[];
    };
};

// Frozen before candidate-model execution. These are intentionally not copied
// from production keyword tables or the existing M-7 generalization fixture.
export const M7_FRONTIER_CASES: FrontierCase[] = [
    { id:'F01', utterance:'¿Qué me queda por hacer esta semana?', expected:{kind:'read_request',domain:'commitment'} },
    { id:'F02', utterance:'Déjame pendiente revisar el generador mañana.', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F03', utterance:'No quiero que se me pase llamar a Paula.', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F04', utterance:'No quiero llamar a Paula.', expected:{kind:'unknown'} },
    { id:'F05', utterance:'¿Qué habíamos quedado con Paula?', expected:{kind:'read_request'} },
    { id:'F06', utterance:'Mándale a Paula que voy saliendo.', expected:{kind:'write_request',domain:'messaging'} },
    { id:'F07', utterance:'Pregúntale a Paula si alcanzamos mañana.', expected:{kind:'write_request',domain:'messaging'} },
    { id:'F08', utterance:'Lo de la bomba, mejor el viernes.', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F09', utterance:'¿Cuándo era lo de la bomba?', expected:{kind:'read_request'} },
    { id:'F10', utterance:'Borra eso de mi cabeza, no lo guardes.', expected:{kind:'write_request'} },
    { id:'F11', utterance:'¿Qué fue lo último que te dije de la concesión?', expected:{kind:'read_request'} },
    { id:'F12', utterance:'Anota altiro q mañana tengo q llamar al juan', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F13', utterance:'oye acuérdame ver eso dsp del almuerzo', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F14', utterance:'what do I still owe Camila?', expected:{kind:'read_request',domain:'commitment'} },
    { id:'F15', utterance:'recuérdame call Camila mañana', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F16', utterance:'¿Qué onda con eso?', expected:{kind:'read_request'} },
    { id:'F17', utterance:'Sí, ese.', expected:{kind:'slot_answer',continuationLike:'yes'}, dialogue:{lifecycle:'active',activeObjectiveType:'cancel_existing_commitment',missingSlotType:'targetEntity',suspendedObjectiveType:null,referentHints:['Revisar bomba','Revisar motor']} },
    { id:'F18', utterance:'el viernes', expected:{kind:'slot_answer',continuationLike:'yes'}, dialogue:{lifecycle:'active',activeObjectiveType:'create_personal_commitment',missingSlotType:'time',suspendedObjectiveType:null,referentHints:['revisar bomba']} },
    { id:'F19', utterance:'No, olvida eso. Mejor recuérdame llamar a Pedro mañana.', expected:{kind:'write_request',independentObjective:'yes'}, dialogue:{lifecycle:'active',activeObjectiveType:'create_personal_commitment',missingSlotType:'time',suspendedObjectiveType:null,referentHints:['revisar bomba']} },
    { id:'F20', utterance:'sigamos con lo anterior', expected:{kind:'lifecycle_command',lifecycleCommand:'resume'}, dialogue:{lifecycle:'suspended',activeObjectiveType:null,missingSlotType:null,suspendedObjectiveType:'create_personal_commitment',referentHints:['revisar bomba']} },
    { id:'F21', utterance:'déjalo hasta ahí', expected:{kind:'lifecycle_command',lifecycleCommand:'abandon'}, dialogue:{lifecycle:'active',activeObjectiveType:'create_personal_commitment',missingSlotType:'time',suspendedObjectiveType:null,referentHints:['revisar bomba']} },
    { id:'F22', utterance:'¿Puedes ordenar mis pendientes por fecha?', expected:{kind:'read_request',domain:'commitment'} },
    { id:'F23', utterance:'Dalo por terminado.', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F24', utterance:'¿Lo dimos por terminado?', expected:{kind:'read_request',domain:'commitment'} },
    { id:'F25', utterance:'Cámbialo pa pasado mañana en la tarde.', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F26', utterance:'No sé, quizás después.', expected:{kind:'unknown'} },
    { id:'F27', utterance:'Acuérdate que prefiero que me llamen temprano.', expected:{kind:'write_request'} },
    { id:'F28', utterance:'¿Te acuerdas a qué hora prefiero que me llamen?', expected:{kind:'read_request'} },
    { id:'F29', utterance:'ponme eso para el jueves y si no alcanzo vemos', expected:{kind:'write_request',domain:'commitment'} },
    { id:'F30', utterance:'cuántos pendientes tengo?', expected:{kind:'read_request',domain:'commitment'} },
];
