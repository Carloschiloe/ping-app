export type M7SemanticClass = 'read' | 'write' | 'ambiguous' | 'dialogue';

export interface M7NaturalLanguageCase {
    id: string;
    utterance: string;
    expectedClass: M7SemanticClass;
    /** Ambiguous action-shaped turns still must enter the write/clarification path. */
    expectedRoute?: 'read' | 'write';
    expectedObjective?: string;
    novel: boolean;
    notes: string;
}

/**
 * M-7 expected-result manifest. This file is intentionally written before
 * the generalization tests: it is the contract we evaluate, not a list of
 * phrases used by production routing. Production code must not import it.
 */
export const M7_NATURAL_LANGUAGE_CASES: readonly M7NaturalLanguageCase[] = [
    // Read: ordinary and contextual retrieval (1-20)
    { id: 'R01', utterance: '¿Qué compromisos tengo para hoy?', expectedClass: 'read', novel: false, notes: 'fecha relativa' },
    { id: 'R02', utterance: 'Muéstrame lo que todavía tengo pendiente', expectedClass: 'read', novel: false, notes: 'estado abierto' },
    { id: 'R03', utterance: '¿Qué quedó sin cerrar con Camila?', expectedClass: 'read', novel: true, notes: 'persona + abierto' },
    { id: 'R04', utterance: '¿De qué cosas estoy esperando respuesta?', expectedClass: 'read', novel: true, notes: 'espera de terceros' },
    { id: 'R05', utterance: '¿Hay algo atrasado que requiera mi atención?', expectedClass: 'read', novel: true, notes: 'urgencia' },
    { id: 'R06', utterance: 'Cuéntame lo importante de esta semana', expectedClass: 'read', novel: true, notes: 'resumen temporal' },
    { id: 'R07', utterance: '¿Qué venció recientemente?', expectedClass: 'read', novel: true, notes: 'historial temporal' },
    { id: 'R08', utterance: '¿Qué tengo agendado para mañana?', expectedClass: 'read', novel: true, notes: 'consulta futura' },
    { id: 'R09', utterance: '¿Cuál es el asunto más urgente?', expectedClass: 'read', novel: false, notes: 'comparación de prioridad' },
    { id: 'R10', utterance: 'Ordéname los pendientes desde el más próximo', expectedClass: 'read', novel: true, notes: 'orden semántico' },
    { id: 'R11', utterance: '¿Qué le prometí a Diego?', expectedClass: 'read', novel: false, notes: 'persona' },
    { id: 'R12', utterance: '¿Qué me debe responder Paula?', expectedClass: 'read', novel: true, notes: 'responsabilidad ajena' },
    { id: 'R13', utterance: 'Recuérdame qué hablamos del arriendo', expectedClass: 'read', novel: true, notes: 'memoria conversacional' },
    { id: 'R14', utterance: '¿Qué se decidió sobre la parcela?', expectedClass: 'read', novel: true, notes: 'decisión histórica' },
    { id: 'R15', utterance: 'Busca los audios donde mencioné la bomba', expectedClass: 'read', novel: true, notes: 'fuente audio' },
    { id: 'R16', utterance: '¿Me mandaron algún documento sobre el contrato?', expectedClass: 'read', novel: false, notes: 'adjuntos' },
    { id: 'R17', utterance: '¿Qué pasó con el asunto del lunes?', expectedClass: 'read', novel: true, notes: 'referencia temporal' },
    { id: 'R18', utterance: '¿Cuál de estos viene primero?', expectedClass: 'read', novel: false, notes: 'comparación contextual' },
    { id: 'R19', utterance: '¿Y el otro cuándo era?', expectedClass: 'dialogue', novel: true, notes: 'referencia implícita multivuelta' },
    { id: 'R20', utterance: 'No, me refería al compromiso de la tarde', expectedClass: 'dialogue', novel: true, notes: 'corrección' },

    // Write: creation and personal capture (21-40)
    { id: 'W01', utterance: 'Recuérdame llevar las llaves mañana temprano', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'recordatorio' },
    { id: 'W02', utterance: 'Déjame anotado que el viernes reviso la caldera', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'captura coloquial' },
    { id: 'W03', utterance: 'Que no se me pase llamar al médico después de almuerzo', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'negación de olvido' },
    { id: 'W04', utterance: 'Anótame para el sábado comprar alimento para el perro', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'paráfrasis' },
    { id: 'W05', utterance: 'Guárdame como pendiente revisar las cuentas', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'lenguaje espontáneo' },
    { id: 'W06', utterance: 'Necesito acordarme de enviar el informe el lunes', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'recordatorio natural' },
    { id: 'W07', utterance: 'Pon en mi lista mental que debo cotizar neumáticos', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'metáfora de memoria' },
    { id: 'W08', utterance: 'Marca para mañana la revisión del generador', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'acción implícita' },
    { id: 'W09', utterance: 'Ayúdame a no olvidar entregar la boleta', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'ayuda' },
    { id: 'W10', utterance: 'Ojo: tengo que comprar pintura antes del domingo', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'coloquial chileno' },
    { id: 'W11', utterance: 'Quiero dejar registrado que debo llamar a mi mamá', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'intención explícita' },
    { id: 'W12', utterance: 'Hazte cargo de recordarme la reunión del martes', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'solicitud natural' },
    { id: 'W13', utterance: 'Por favor, déjame esto para después: renovar el seguro', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'transcripción espontánea' },
    { id: 'W14', utterance: 'Me ayudas a tener presente que debo pagar la patente', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'recordar sin verbo típico' },
    { id: 'W15', utterance: 'No quiero olvidarme de mandar las fotos a Tomás', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'negación' },
    { id: 'W16', utterance: 'Recuérdame que el chequeo es a las nueve', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'hora' },
    { id: 'W17', utterance: 'Apunta esto: llamar al proveedor apenas llegue', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'deixis' },
    { id: 'W18', utterance: 'Necesito que Ping me mantenga esto presente, comprar filtros', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'frase inédita' },
    { id: 'W19', utterance: 'Deja pendiente para mí coordinar la visita', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'pendiente personal' },
    { id: 'W20', utterance: 'Acuérdate de guardarme revisar el tablero el jueves', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'recordatorio con ruido' },

    // Write: create/schedule and communicate (41-60)
    { id: 'W21', utterance: 'Agenda revisar el presupuesto mañana a las 8', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'agendar' },
    { id: 'W22', utterance: 'Déjalo programado para el miércoles: inspeccionar la bodega', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: true, notes: 'paráfrasis' },
    { id: 'W23', utterance: 'Crea un compromiso que se llame revisar la bomba', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'título explícito' },
    { id: 'W24', utterance: 'Ponme una tarea para coordinar el retiro el viernes', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: true, notes: 'tarea como lenguaje del usuario' },
    { id: 'W25', utterance: 'Organiza para hoy en la tarde llamar al contador', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'organizar' },
    { id: 'W26', utterance: 'Planifica una revisión del camión para el próximo lunes', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'planificar' },
    { id: 'W27', utterance: 'Necesito que quede agendado llevar la excavadora', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: true, notes: 'pasiva' },
    { id: 'W28', utterance: 'Hazme un pendiente con nombre pagar la cuota', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'nombre personal' },
    { id: 'W29', utterance: 'Coordina la llamada con Fernanda para mañana', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'persona' },
    { id: 'W30', utterance: 'Arma un recordatorio para revisar el seguro', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: true, notes: 'recordatorio personal' },
    { id: 'W31', utterance: 'Dile a Camila que voy atrasado', expectedClass: 'write', expectedObjective: 'communicate_message', novel: false, notes: 'mensaje' },
    { id: 'W32', utterance: 'Mándale a Pedro: llego en diez minutos', expectedClass: 'write', expectedObjective: 'communicate_message', novel: true, notes: 'colon' },
    { id: 'W33', utterance: 'Avísale a Laura que cambié la hora', expectedClass: 'write', expectedObjective: 'communicate_message', novel: false, notes: 'comunicación' },
    { id: 'W34', utterance: 'Pregúntale a Nico si ya recibió el archivo', expectedClass: 'write', expectedObjective: 'communicate_and_wait', novel: true, notes: 'pregunta que espera respuesta' },
    { id: 'W35', utterance: 'Cuéntale a Paula que el proveedor confirmó', expectedClass: 'write', expectedObjective: 'communicate_message', novel: false, notes: 'comunicación' },
    { id: 'W36', utterance: 'Manda este mensaje a Sofía: “nos vemos a las seis”', expectedClass: 'write', expectedObjective: 'communicate_message', novel: true, notes: 'comillas' },
    { id: 'W37', utterance: 'Dile a Andrés que lo vemos mañana y si acepta déjalo anotado', expectedClass: 'write', expectedObjective: 'communicate_and_wait', novel: true, notes: 'seguimiento condicional' },
    { id: 'W38', utterance: 'Quiero avisarle a la jefa que no alcanzo a llegar', expectedClass: 'write', expectedObjective: 'communicate_message', novel: true, notes: 'transcripción sin imperativo' },
    { id: 'W39', utterance: 'Hazle saber a Martín: se atrasó el despacho', expectedClass: 'write', expectedObjective: 'communicate_message', novel: true, notes: 'paráfrasis' },
    { id: 'W40', utterance: 'Necesito preguntarle a Elena por la cotización', expectedClass: 'write', expectedObjective: 'communicate_message', novel: true, notes: 'frase inédita' },

    // Write: lifecycle operations (61-80)
    { id: 'W41', utterance: 'Mueve la revisión del jueves al viernes', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: false, notes: 'reprogramación' },
    { id: 'W42', utterance: 'Pásame para mañana el compromiso de la bomba', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: true, notes: 'coloquial chileno' },
    { id: 'W43', utterance: 'Cambia la hora de llamar a Diego para las cinco', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: true, notes: 'fecha/hora' },
    { id: 'W44', utterance: 'Reprograma la visita para el próximo martes', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: false, notes: 'reprogramación' },
    { id: 'W45', utterance: 'Mejor dejemos lo del informe para el lunes', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: true, notes: 'paráfrasis' },
    { id: 'W46', utterance: 'Pospón el chequeo hasta después de almuerzo', expectedClass: 'write', expectedObjective: 'reschedule_existing_commitment', novel: false, notes: 'posponer' },
    { id: 'W47', utterance: 'Completa el pendiente de comprar pan', expectedClass: 'write', expectedObjective: 'complete_existing_commitment', novel: false, notes: 'completar' },
    { id: 'W48', utterance: 'Dalo por terminado: revisión del motor lista', expectedClass: 'write', expectedObjective: 'complete_existing_commitment', novel: true, notes: 'resultado implícito' },
    { id: 'W49', utterance: 'Marca como resuelto lo de la cotización', expectedClass: 'write', expectedObjective: 'complete_existing_commitment', novel: false, notes: 'resolver' },
    { id: 'W50', utterance: 'Ya quedó listo el asunto del seguro, ciérralo', expectedClass: 'write', expectedObjective: 'complete_existing_commitment', novel: true, notes: 'cierre' },
    { id: 'W51', utterance: 'Acepta la propuesta de llamar a Juan', expectedClass: 'write', expectedObjective: 'respond_to_existing_proposal', novel: false, notes: 'aceptar' },
    { id: 'W52', utterance: 'Rechaza el compromiso de comprar la máquina', expectedClass: 'write', expectedObjective: 'respond_to_existing_proposal', novel: false, notes: 'rechazar' },
    { id: 'W53', utterance: 'Dile que sí a la propuesta de la reunión', expectedClass: 'write', expectedObjective: 'respond_to_existing_proposal', novel: true, notes: 'respuesta afirmativa' },
    { id: 'W54', utterance: 'No tomemos esa propuesta, déjala rechazada', expectedClass: 'write', expectedObjective: 'respond_to_existing_proposal', novel: true, notes: 'negación' },
    { id: 'W55', utterance: 'Cancela el compromiso de renovar el seguro', expectedClass: 'write', expectedObjective: 'cancel_existing_commitment', novel: false, notes: 'cancelación' },
    { id: 'W56', utterance: 'Saca de mis pendientes la visita del viernes', expectedClass: 'write', expectedObjective: 'cancel_existing_commitment', novel: true, notes: 'paráfrasis de cancelación' },
    { id: 'W57', utterance: 'No sigamos con lo de la cotización', expectedClass: 'write', expectedObjective: 'cancel_existing_commitment', novel: true, notes: 'cancelación coloquial' },
    { id: 'W58', utterance: 'Quiero dejar sin efecto el pendiente de la bodega', expectedClass: 'write', expectedObjective: 'cancel_existing_commitment', novel: true, notes: 'lenguaje formal' },
    { id: 'W59', utterance: 'Recuerda que mi hermano se llama Andrés', expectedClass: 'write', expectedObjective: 'remember_fact', novel: false, notes: 'hecho de memoria' },
    { id: 'W60', utterance: 'Guarda que el proveedor prefiere llamadas en la mañana', expectedClass: 'write', expectedObjective: 'remember_fact', novel: true, notes: 'preferencia' },

    // Ambiguity, denial, and safety (81-95)
    { id: 'A01', utterance: 'Haz algo con eso', expectedClass: 'ambiguous', expectedRoute: 'write', novel: true, notes: 'referente ausente' },
    { id: 'A02', utterance: 'Anótalo para después', expectedClass: 'ambiguous', expectedRoute: 'write', novel: true, notes: 'entidad ausente' },
    { id: 'A03', utterance: '¿Puedes encargarte?', expectedClass: 'ambiguous', expectedRoute: 'write', novel: true, notes: 'acción sin objetivo' },
    { id: 'A04', utterance: 'Lo de mañana, ya sabes', expectedClass: 'ambiguous', novel: true, notes: 'contexto insuficiente' },
    { id: 'A05', utterance: 'Sí', expectedClass: 'dialogue', novel: true, notes: 'confirmación depende de estado' },
    { id: 'A06', utterance: 'No, no lo crees', expectedClass: 'dialogue', novel: true, notes: 'negación de propuesta' },
    { id: 'A07', utterance: 'No me recuerdes eso', expectedClass: 'ambiguous', expectedRoute: 'write', novel: true, notes: 'intención de rechazo sin target' },
    { id: 'A08', utterance: 'No necesito que guardes nada', expectedClass: 'read', novel: true, notes: 'negación sin acción' },
    { id: 'A09', utterance: '¿Qué pasa si no lo hago?', expectedClass: 'read', novel: true, notes: 'consulta hipotética' },
    { id: 'A10', utterance: 'No quiero enviar ningún mensaje', expectedClass: 'read', novel: true, notes: 'negación de acción' },
    { id: 'A11', utterance: '¿Él tiene algo pendiente?', expectedClass: 'ambiguous', novel: false, notes: 'pronombre sin antecedente' },
    { id: 'A12', utterance: '¿Qué dijo ella ayer?', expectedClass: 'ambiguous', novel: false, notes: 'pronombre sin antecedente' },
    { id: 'A13', utterance: 'El asunto importante', expectedClass: 'ambiguous', novel: true, notes: 'fragmento' },
    { id: 'A14', utterance: 'Mañana a las diez', expectedClass: 'dialogue', novel: true, notes: 'slot answer' },
    { id: 'A15', utterance: 'Pedro González', expectedClass: 'dialogue', novel: false, notes: 'identity answer' },

    // Multiturn continuation expectations (96-110)
    { id: 'D01', utterance: 'Recuérdame llamar a Pedro', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'turno inicial' },
    { id: 'D02', utterance: 'mañana a las nueve', expectedClass: 'dialogue', novel: false, notes: 'completa fecha/hora del turno anterior' },
    { id: 'D03', utterance: 'Tengo que hablar con dos Pedros', expectedClass: 'ambiguous', novel: true, notes: 'aclaración de persona' },
    { id: 'D04', utterance: 'Con Pedro González', expectedClass: 'dialogue', novel: false, notes: 'respuesta a persona ambigua' },
    { id: 'D05', utterance: 'Agenda revisar el camión', expectedClass: 'write', expectedObjective: 'create_commitment_or_proposal', novel: false, notes: 'turno inicial' },
    { id: 'D06', utterance: 'Mejor el sábado', expectedClass: 'dialogue', novel: true, notes: 'corrección temporal' },
    { id: 'D07', utterance: 'No, el domingo en la tarde', expectedClass: 'dialogue', novel: true, notes: 'corrección negativa' },
    { id: 'D08', utterance: '¿Qué tengo mañana?', expectedClass: 'read', novel: false, notes: 'turno inicial de lectura' },
    { id: 'D09', utterance: 'El más temprano', expectedClass: 'dialogue', novel: true, notes: 'referencia implícita' },
    { id: 'D10', utterance: 'No ese, el de la parcela', expectedClass: 'dialogue', novel: true, notes: 'corrección de entidad' },
    { id: 'D11', utterance: 'Recuérdame enviar el informe', expectedClass: 'write', expectedObjective: 'create_personal_commitment', novel: false, notes: 'turno inicial' },
    { id: 'D12', utterance: 'Pero no mañana, el lunes', expectedClass: 'dialogue', novel: true, notes: 'negación/corrección temporal' },
    { id: 'D13', utterance: 'Sí, créalo', expectedClass: 'dialogue', expectedRoute: 'write', novel: true, notes: 'confirmación explícita' },
    { id: 'D14', utterance: 'No lo guardes', expectedClass: 'dialogue', expectedRoute: 'write', novel: true, notes: 'rechazo explícito' },
    { id: 'D15', utterance: 'Ahora hablemos de otra cosa', expectedClass: 'read', novel: true, notes: 'escape de diálogo' },
];

export const M7_CASE_COUNT = M7_NATURAL_LANGUAGE_CASES.length;
