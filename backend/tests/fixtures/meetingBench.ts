// 50 invented meetings in Chilean Spanish with the commitments a careful
// person would write down from each one. They are made up for testing: no
// real person or recording is behind them.
//
// The meeting happens on Monday 2026-11-16 at 10:00 in Santiago. Calendar:
// lun 16 · mar 17 · mié 18 · jue 19 · vie 20 · sáb 21 · dom 22 · lun 23 ·
// mar 24 · mié 25 · jue 26 · vie 27 · lun 30 · mar 1-dic · jue 3 · vie 4.
//
// How the references are written, so a check is objective:
// - what: every group must appear in the proposed task (any word of the
//   group counts); words are compared without accents and in lower case,
//   and they are word beginnings ("cotiz" matches "cotización").
// - owner: the person who will do it (any of the names listed counts).
// - due: the date it is due, or null when none was said; dueAlt lists other
//   readings a reasonable person could make.
// - optional: a half-promise; proposing it or not are both fine.
// - mustNot: things that must NOT come out as a commitment (cancelled,
//   declined, hypothetical or already done).

export const MEETING_NOW = '2026-11-16T13:00:00.000Z'; // 10:00 in Santiago
export const MEETING_TIME_ZONE = 'America/Santiago';
export const MEETING_USER = 'Carlos';

export type Group = string[];

export interface ReferenceCommitment {
    id: string;
    owner: string | string[];
    what: Group[];
    due: string | null;
    dueAlt?: (string | null)[];
    conditional?: boolean;
    dependsOn?: string;
    optional?: boolean;
}

export interface MeetingCase {
    id: string;
    kinds: string[];
    title: string;
    participants: string[];
    transcript: string;
    commitments: ReferenceCommitment[];
    decisions?: Group[][];
    mustNot?: Group[][];
    facts?: Group[][]; // must appear in the summary
}

const t = (lines: string[]) => lines.join('\n');

export const MEETING_CASES: MeetingCase[] = [
    {
        id: 'm01', kinds: ['explicito'], title: 'Proveedor y contrato', participants: ['Carlos', 'Paula'],
        transcript: t([
            'Paula: Hola Carlos, ¿cómo estai? Oye, te llamaba por lo del proveedor de envases.',
            'Carlos: Hola Paula, bien, bien. Sí, cuéntame, ¿llegó la cotización?',
            'Paula: Todavía no me la mandan completa, pero yo te mando la cotización del proveedor el miércoles, sin falta.',
            'Carlos: Perfecto. Y yo reviso el contrato antes del viernes, para que podamos firmar la otra semana.',
            'Paula: Ya, buenísimo. Cualquier cosa me escribes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Paula', what: [['cotiz']], due: '2026-11-18' },
            { id: 'c2', owner: 'Carlos', what: [['contrat']], due: '2026-11-20', dueAlt: ['2026-11-19'] },
        ],
        facts: [[['envase', 'proveedor']], [['contrato']]],
    },
    {
        id: 'm02', kinds: ['sin_compromisos'], title: 'Conversación del fin de semana', participants: ['Carlos', 'Andrea'],
        transcript: t([
            'Andrea: ¿Y, cómo te fue el fin de semana?',
            'Carlos: Bien po, fuimos a Pichilemu con los niños. Hacía un frío terrible igual.',
            'Andrea: Uy, qué rico. Nosotros nos quedamos en la casa viendo el partido. Perdió la Chile, pa variar.',
            'Carlos: Jajaja, sí, lo vi. Qué manera de jugar mal.',
            'Andrea: Oye, ya, te dejo, tengo que entrar a otra llamada.',
            'Carlos: Dale, cuídate.',
        ]),
        commitments: [],
        mustNot: [[['pichilemu', 'partido']]],
    },
    {
        id: 'm03', kinds: ['cambio_responsable'], title: 'Pago de factura', participants: ['Carlos', 'Jorge'],
        transcript: t([
            'Carlos: Jorge, hay que pagarle la factura a Transportes Rivas, vence mañana.',
            'Jorge: ¿La de los fletes de octubre?',
            'Carlos: Esa. Yo la pago hoy en la tarde... no, espera, mejor págala tú, que tienes la clave del banco de la empresa.',
            'Jorge: Ya, sí, yo la pago mañana a primera hora, antes de que venza.',
            'Carlos: Perfecto, gracias.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Jorge', what: [['pag'], ['factur', 'rivas', 'flete']], due: '2026-11-17' },
        ],
        facts: [[['rivas']]],
    },
    {
        id: 'm04', kinds: ['cambio_fecha'], title: 'Presentación al directorio', participants: ['Carlos', 'Gabriela'],
        transcript: t([
            'Gabriela: Carlos, ¿para cuándo tendrías la presentación para el directorio?',
            'Carlos: Pensaba tenerla el jueves.',
            'Gabriela: Ya.',
            'Carlos: Aunque... no, el jueves no alcanzo, me faltan los números de ventas. Dejémoslo para el lunes que viene, el 23.',
            'Gabriela: Ok, el lunes 23 entonces. Le aviso al directorio.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['present']], due: '2026-11-23' },
            { id: 'c2', owner: 'Gabriela', what: [['avis', 'inform', 'comunic']], due: null, optional: true },
        ],
        mustNot: [],
    },
    {
        id: 'm05', kinds: ['condicional'], title: 'Instalación de paneles', participants: ['Carlos', 'Andrés'],
        transcript: t([
            'Carlos: Andrés, ¿cómo vamos con lo de los paneles solares de la bodega?',
            'Andrés: Mira, yo tengo todo listo para partir. Si el cliente aprueba el presupuesto esta semana, yo parto con la instalación el lunes 23.',
            'Carlos: Ya, y si no lo aprueba, lo dejamos para enero nomás.',
            'Andrés: Exacto.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Andrés', what: [['instal']], due: '2026-11-23', conditional: true },
        ],
        decisions: [[['enero']]],
    },
    {
        id: 'm06', kinds: ['dependencia'], title: 'Informe de ventas', participants: ['Carlos', 'Fernanda'],
        transcript: t([
            'Carlos: Fernanda, necesito armar el informe de ventas del trimestre para el viernes.',
            'Fernanda: Ya, ¿qué te falta?',
            'Carlos: Los datos de la zona sur. Cuando tú me pases los datos de ventas, yo armo el informe.',
            'Fernanda: Te los paso el jueves, que el miércoles cierro con los vendedores.',
            'Carlos: Perfecto, con eso el viernes lo tengo.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Fernanda', what: [['dato', 'venta']], due: '2026-11-19' },
            { id: 'c2', owner: 'Carlos', what: [['inform']], due: '2026-11-20', dependsOn: 'c1' },
        ],
    },
    {
        id: 'm07', kinds: ['cancelacion'], title: 'Planilla y contador', participants: ['Carlos', 'Marta'],
        transcript: t([
            'Marta: Carlos, ¿llamaste al contador por lo del IVA?',
            'Carlos: Iba a llamarlo hoy, pero ya no es necesario, se resolvió solo: el SII corrigió el formulario.',
            'Marta: Ah, qué bueno. Entonces yo te envío la planilla de gastos hoy mismo para que la revises.',
            'Carlos: Dale, gracias.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Marta', what: [['planill', 'gasto']], due: '2026-11-16' },
        ],
        mustNot: [[['contador', 'llam']]],
    },
    {
        id: 'm08', kinds: ['pedido_rechazado'], title: 'Revisión de propuesta', participants: ['Carlos', 'Pedro'],
        transcript: t([
            'Pedro: Carlos, ¿podrías revisar mi propuesta para el cliente mañana?',
            'Carlos: Mañana imposible, Pedro, estoy a full con el cierre. Pregúntale a Sofía, ella conoce al cliente.',
            'Pedro: Ya, le pregunto entonces.',
            'Carlos: Sí, mejor.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Pedro', what: [['pregunt', 'sofia', 'consult']], due: null, optional: true },
        ],
        mustNot: [[['revis'], ['propuest']]],
    },
    {
        id: 'm09', kinds: ['fechas_relativas'], title: 'Cierre de mes', participants: ['Carlos', 'Lucía', 'Tomás'],
        transcript: t([
            'Lucía: Ya, repasemos. ¿Quién manda el borrador del acuerdo comercial?',
            'Carlos: Yo lo mando pasado mañana.',
            'Lucía: Ok. Yo cierro la facturación a fin de mes, como siempre.',
            'Tomás: Y yo agendo la visita a la planta de Rancagua en una semana más, el lunes, para que vayamos los tres.',
            'Carlos: Perfecto.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['borrador', 'acuerdo']], due: '2026-11-18' },
            { id: 'c2', owner: 'Lucía', what: [['factur']], due: '2026-11-30' },
            { id: 'c3', owner: 'Tomás', what: [['visit', 'planta']], due: '2026-11-23' },
        ],
    },
    {
        id: 'm10', kinds: ['interrupcion', 'correccion'], title: 'Presupuesto actualizado', participants: ['Carlos', 'Ignacio'],
        transcript: t([
            'Ignacio: Carlos, te mando el... ¿aló? ¿Se escucha?',
            'Carlos: Se cortó un poco, ahora sí te escucho.',
            'Ignacio: Ya. Te decía que te mando el presupuesto actualizado mañana a primera hora... bueno, no, mañana en la tarde mejor, porque en la mañana tengo terreno.',
            'Carlos: No hay problema, mañana en la tarde está bien.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Ignacio', what: [['presupuest']], due: '2026-11-17' },
        ],
    },
    {
        id: 'm11', kinds: ['varios_participantes'], title: 'Evento aniversario', participants: ['Carlos', 'Valentina', 'Rodrigo', 'Camila'],
        transcript: t([
            'Carlos: Ya, equipo, quedamos en que el aniversario de la empresa es el viernes 4 de diciembre. ¿De acuerdo?',
            'Valentina: Sí, el 4. Yo tengo el diseño de la invitación para el miércoles.',
            'Rodrigo: Yo me encargo de reservar el salón, lo dejo reservado el viernes a más tardar.',
            'Camila: Y yo armo la lista de invitados, la tengo el jueves.',
            'Carlos: Buenísimo. Y yo confirmo el catering el lunes 23.',
            'Camila: Oye, ¿y la música?',
            'Carlos: Eso lo vemos más adelante.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Valentina', what: [['diseñ', 'invitac']], due: '2026-11-18' },
            { id: 'c2', owner: 'Rodrigo', what: [['salon', 'reserv']], due: '2026-11-20' },
            { id: 'c3', owner: 'Camila', what: [['invitad', 'lista']], due: '2026-11-19' },
            { id: 'c4', owner: 'Carlos', what: [['catering']], due: '2026-11-23' },
        ],
        decisions: [[['4', 'diciembre', 'aniversari']]],
        mustNot: [[['music']]],
    },
    {
        id: 'm12', kinds: ['chileno'], title: 'Declaración en el SII', participants: ['Carlos', 'Daniela'],
        transcript: t([
            'Daniela: Ya po Carlos, cachai que el viernes vence la cuestión del SII, la declaración mensual.',
            'Carlos: Sí, sí, cacho. ¿Qué te falta?',
            'Daniela: Las boletas de honorarios de octubre, po. Sin eso no la puedo presentar.',
            'Carlos: Al tiro te mando las boletas, hoy mismo.',
            'Daniela: Ya, bacán. Con eso yo presento la declaración el viernes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['bolet', 'document', 'honorari']], due: '2026-11-16' },
            { id: 'c2', owner: 'Daniela', what: [['declarac', 'sii']], due: '2026-11-20', dependsOn: 'c1' },
        ],
    },
    {
        id: 'm13', kinds: ['ambiguo', 'sin_compromisos'], title: 'Arriendo de la oficina', participants: ['Carlos', 'Patricio'],
        transcript: t([
            'Patricio: Oye, habría que ver lo del arriendo de la oficina algún día, está carísimo.',
            'Carlos: Sí, habría que verlo. Sería bueno cambiarse a algo más chico.',
            'Patricio: Sí po. Bueno, ya veremos.',
        ]),
        commitments: [],
        mustNot: [[['arriend', 'oficina', 'cambi']]],
    },
    {
        id: 'm14', kinds: ['decision'], title: 'Cambio de transportista', participants: ['Carlos', 'Verónica', 'Héctor'],
        transcript: t([
            'Verónica: Con los atrasos de este mes, yo creo que hay que cambiar de transportista.',
            'Héctor: Estoy de acuerdo. Transportes Sur nos ofreció un 10% menos y cumplen.',
            'Carlos: Ya, decidido: desde diciembre trabajamos con Transportes Sur.',
            'Verónica: Perfecto.',
        ]),
        commitments: [],
        decisions: [[['transportes sur', 'sur']]],
        facts: [[['10']]],
    },
    {
        id: 'm15', kinds: ['ambiguo'], title: 'Pasar por la oficina', participants: ['Carlos', 'Rocío'],
        transcript: t([
            'Rocío: ¿Vas a poder pasar por la oficina esta semana a firmar los papeles?',
            'Carlos: Voy a tratar de pasar el jueves, pero no te prometo nada, tengo la semana complicada.',
            'Rocío: Ya, avísame.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['pas', 'firm', 'oficina']], due: '2026-11-19', optional: true },
        ],
    },
    {
        id: 'm16', kinds: ['delegacion'], title: 'Informe de Raúl', participants: ['Carlos', 'Silvia'],
        transcript: t([
            'Silvia: Carlos, todavía no me llega el informe de mantención.',
            'Carlos: Uy, lo tiene Raúl. Le voy a pedir a Raúl que te lo mande.',
            'Silvia: Ya, gracias.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['raul', 'pedi'], ['inform', 'mantenc']], due: null },
        ],
    },
    {
        id: 'm17', kinds: ['cambio_fecha'], title: 'Entrega de propuesta', participants: ['Carlos', 'Natalia'],
        transcript: t([
            'Natalia: Lo de la propuesta para Minera Andes: primero dijimos el 25, pero el cliente pidió moverla.',
            'Carlos: ¿Para cuándo?',
            'Natalia: Para el jueves 3 de diciembre. Yo la entrego ese día.',
            'Carlos: Perfecto, mejor así.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Natalia', what: [['propuest']], due: '2026-12-03' },
        ],
        facts: [[['minera', 'andes']]],
    },
    {
        id: 'm18', kinds: ['cancelacion'], title: 'Reunión con el banco', participants: ['Carlos', 'Eduardo'],
        transcript: t([
            'Eduardo: Al final la reunión del jueves con el banco se cancela, ya no necesitamos el crédito.',
            'Carlos: Ah, ya. Yo le aviso al ejecutivo del banco hoy.',
            'Eduardo: Gracias.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['avis', 'cancel', 'inform']], due: '2026-11-16' },
        ],
        mustNot: [[['reunion'], ['banco']]],
    },
    {
        id: 'm19', kinds: ['cifras'], title: 'Transferencia', participants: ['Carlos', 'Gonzalo'],
        transcript: t([
            'Gonzalo: Carlos, lo de la camioneta: te transfiero los 450 mil el viernes, que me pagan el jueves.',
            'Carlos: Ya, perfecto. ¿A la cuenta de siempre?',
            'Gonzalo: Sí, a la cuenta corriente.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Gonzalo', what: [['transfer', 'pag'], ['450']], due: '2026-11-20' },
        ],
        facts: [[['450']]],
    },
    {
        id: 'm20', kinds: ['varios_del_usuario'], title: 'Viaje a Concepción', participants: ['Carlos', 'Ximena'],
        transcript: t([
            'Ximena: ¿Quién ve lo del viaje a Concepción?',
            'Carlos: Yo me encargo de tres cosas: hoy llamo a la aseguradora, mañana compro los pasajes y el viernes mando el acta de la reunión pasada.',
            'Ximena: Ya, súper.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['asegurador']], due: '2026-11-16' },
            { id: 'c2', owner: 'Carlos', what: [['pasaj']], due: '2026-11-17' },
            { id: 'c3', owner: 'Carlos', what: [['acta']], due: '2026-11-20' },
        ],
    },
    {
        id: 'm21', kinds: ['negacion', 'cambio_responsable'], title: 'Capacitación', participants: ['Carlos', 'Ricardo'],
        transcript: t([
            'Carlos: Ricardo, no, yo no voy a poder hacer la capacitación del sistema nuevo.',
            'Ricardo: Tranquilo, la hago yo. ¿El martes 24 te parece?',
            'Carlos: Perfecto, el martes 24.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Ricardo', what: [['capacit']], due: '2026-11-24' },
        ],
    },
    {
        id: 'm22', kinds: ['conjunto'], title: 'Revisar presupuesto con Ana', participants: ['Carlos', 'Ana'],
        transcript: t([
            'Ana: Tenemos que revisar el presupuesto del próximo año juntos.',
            'Carlos: Sí. Nos juntamos el miércoles a las cuatro, ¿te parece? Yo mando la invitación.',
            'Ana: Dale, el miércoles a las cuatro.',
        ]),
        commitments: [
            { id: 'c1', owner: ['Carlos', 'Ana'], what: [['presupuest', 'reun', 'junt', 'invitac']], due: '2026-11-18' },
        ],
    },
    {
        id: 'm23', kinds: ['hora'], title: 'Llamar a Beatriz', participants: ['Carlos', 'Beatriz'],
        transcript: t([
            'Beatriz: Carlos, ahora no puedo hablar, estoy manejando.',
            'Carlos: Ya, no te preocupes. Te llamo mañana a las 9.',
            'Beatriz: Ya, mañana a las 9.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['llam']], due: '2026-11-17' },
        ],
    },
    {
        id: 'm24', kinds: ['condicional'], title: 'Repuesto', participants: ['Carlos', 'Esteban'],
        transcript: t([
            'Esteban: El repuesto de la grúa debería llegar el miércoles.',
            'Carlos: ¿Y si no llega?',
            'Esteban: Si no llega el miércoles, yo llamo al proveedor el jueves y le reclamo.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Esteban', what: [['llam', 'reclam'], ['proveedor', 'repuest']], due: '2026-11-19', conditional: true },
        ],
    },
    {
        id: 'm25', kinds: ['voluntario'], title: 'Página web', participants: ['Carlos', 'Martina', 'Felipe'],
        transcript: t([
            'Carlos: Alguien tiene que actualizar la página web con los precios nuevos.',
            'Felipe: Yo no sé usar eso.',
            'Martina: Yo lo hago, no hay drama.',
            'Carlos: Gracias Martina.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Martina', what: [['pagina', 'web', 'precio']], due: null },
        ],
    },
    {
        id: 'm26', kinds: ['dependencia', 'varios_participantes'], title: 'Contrato, factura y despacho', participants: ['Carlos', 'Ana', 'Luis'],
        transcript: t([
            'Ana: Yo firmo el contrato con el cliente mañana martes.',
            'Carlos: Una vez firmado, yo emito la factura el miércoles.',
            'Luis: Y apenas esté la factura, yo despacho el pedido el jueves.',
            'Carlos: Perfecto, así cerramos la semana.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Ana', what: [['firm', 'contrat']], due: '2026-11-17' },
            { id: 'c2', owner: 'Carlos', what: [['factur']], due: '2026-11-18', dependsOn: 'c1' },
            { id: 'c3', owner: 'Luis', what: [['despach', 'pedido']], due: '2026-11-19', dependsOn: 'c2' },
        ],
    },
    {
        id: 'm27', kinds: ['sin_compromisos', 'pasado'], title: 'Estado de avance', participants: ['Carlos', 'Mónica'],
        transcript: t([
            'Mónica: Te cuento cómo vamos: ya mandé el informe al cliente, ya pagamos a los proveedores y la auditoría terminó el viernes.',
            'Carlos: Excelente, Mónica. Todo al día entonces.',
            'Mónica: Todo al día.',
        ]),
        commitments: [],
        mustNot: [[['inform', 'pag', 'auditor']]],
    },
    {
        id: 'm28', kinds: ['cambio_responsable'], title: 'Inventario', participants: ['Carlos', 'Diego'],
        transcript: t([
            'Carlos: El inventario de la bodega lo hace Pía el viernes.',
            'Diego: Pía está de vacaciones hasta fin de mes.',
            'Carlos: Ah, verdad. Entonces lo haces tú, Diego, ¿puedes el viernes?',
            'Diego: Ya, lo hago yo el viernes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Diego', what: [['inventari']], due: '2026-11-20' },
        ],
    },
    {
        id: 'm29', kinds: ['decision', 'condicional'], title: 'Feria del sábado', participants: ['Carlos', 'Loreto'],
        transcript: t([
            'Loreto: ¿Y si llueve el sábado?',
            'Carlos: Si llueve el sábado, postergamos la feria para el domingo. Queda decidido así.',
            'Loreto: Ya, me parece.',
        ]),
        commitments: [],
        decisions: [[['feria', 'posterg', 'domingo']]],
    },
    {
        id: 'm30', kinds: ['pedido_aceptado'], title: 'Catálogo', participants: ['Carlos', 'Pedro'],
        transcript: t([
            'Pedro: ¿Me puedes mandar el catálogo nuevo?',
            'Carlos: Mmm, a ver... está en diseño todavía.',
            'Pedro: No importa si no está perfecto.',
            'Carlos: Ya, sí, te lo mando el jueves.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['catalog']], due: '2026-11-19' },
        ],
    },
    {
        id: 'm31', kinds: ['muletillas'], title: 'Turnos del personal', participants: ['Carlos', 'Carolina'],
        transcript: t([
            'Carolina: Eh, o sea, igual, eh, lo que pasa es que los turnos, los turnos de la próxima semana, eh, no están, o sea, no están cuadrados.',
            'Carlos: Ya, ¿y qué hacemos?',
            'Carolina: Eh, no, yo, o sea, yo los reviso, igual, eh, los reviso y te los tengo para el lunes, ¿ya?',
            'Carlos: Ya, el lunes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carolina', what: [['turno']], due: '2026-11-23' },
        ],
    },
    {
        id: 'm32', kinds: ['asignado_al_usuario'], title: 'Reporte trimestral', participants: ['Carlos', 'Mauricio'],
        transcript: t([
            'Mauricio: Carlos, necesito el reporte trimestral el miércoles, que el jueves lo presento a gerencia.',
            'Carlos: Dale, el miércoles lo tienes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['report', 'trimestr']], due: '2026-11-18' },
            { id: 'c2', owner: 'Mauricio', what: [['present', 'gerencia']], due: '2026-11-19', optional: true },
        ],
    },
    {
        id: 'm33', kinds: ['rechazo_y_voluntario'], title: 'Reunión con el municipio', participants: ['Carlos', 'Paula', 'Óscar'],
        transcript: t([
            'Óscar: ¿Quién puede ir a la reunión con el municipio el jueves?',
            'Carlos: Yo no puedo, tengo médico.',
            'Paula: Voy yo.',
            'Óscar: Gracias Paula.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Paula', what: [['municip', 'reun', 'asist', 'ir']], due: '2026-11-19' },
        ],
        mustNot: [],
    },
    {
        id: 'm34', kinds: ['fecha_ambigua'], title: 'Muestras', participants: ['Carlos', 'Renato'],
        transcript: t([
            'Renato: Las muestras te las mando el martes que viene.',
            'Carlos: Ya, gracias.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Renato', what: [['muestr']], due: '2026-11-24', dueAlt: ['2026-11-17'] },
        ],
    },
    {
        id: 'm35', kinds: ['recurrente'], title: 'Resumen semanal', participants: ['Carlos', 'Sergio'],
        transcript: t([
            'Sergio: Desde ahora, todos los lunes te mando el resumen de ventas de la semana.',
            'Carlos: Buenísimo, así me ordeno.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Sergio', what: [['resumen', 'venta']], due: '2026-11-23', dueAlt: [null] },
        ],
    },
    {
        id: 'm36', kinds: ['hipotetico', 'sin_compromisos'], title: 'Nueva sucursal', participants: ['Carlos', 'Isabel'],
        transcript: t([
            'Isabel: Imagínate que tuviéramos que abrir otra sucursal en Temuco.',
            'Carlos: Uf, habría que contratar unas diez personas y arrendar un local.',
            'Isabel: Sí, sería harto. Pero por ahora no.',
            'Carlos: No, por ahora no.',
        ]),
        commitments: [],
        mustNot: [[['contrat', 'arrend', 'sucursal', 'temuco']]],
    },
    {
        id: 'm37', kinds: ['usuario'], title: 'Mantención del auto', participants: ['Carlos', 'Cristián'],
        transcript: t([
            'Cristián: El auto de la empresa está sonando raro.',
            'Carlos: Sí, yo agendo la mantención para el sábado en el taller de siempre.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['mantenc', 'taller', 'auto']], due: '2026-11-21' },
        ],
    },
    {
        id: 'm38', kinds: ['cifras', 'correccion'], title: 'Despacho de cajas', participants: ['Carlos', 'Hugo'],
        transcript: t([
            'Hugo: Para el pedido de la Vega son 120 cajas... no, perdón, 210, son 210 cajas.',
            'Carlos: 210, ya. ¿Cuándo salen?',
            'Hugo: Las despacho el jueves temprano.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Hugo', what: [['despach', 'caja'], ['210']], due: '2026-11-19' },
        ],
        facts: [[['210']]],
        mustNot: [[['120']]],
    },
    {
        id: 'm39', kinds: ['cancelacion'], title: 'Materiales y flete', participants: ['Carlos', 'Teresa'],
        transcript: t([
            'Carlos: Ya, yo compro los materiales y tú, Tere, contratas el flete.',
            'Teresa: Oye, el flete ya no, porque el proveedor incluye el despacho.',
            'Carlos: Ah, mejor todavía. Entonces solo compro los materiales.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['material']], due: null },
        ],
        mustNot: [[['flete']]],
    },
    {
        id: 'm40', kinds: ['fecha_vaga'], title: 'Patente comercial', participants: ['Carlos', 'Javiera'],
        transcript: t([
            'Javiera: La patente comercial vence en enero.',
            'Carlos: ¿Y quién la renueva?',
            'Javiera: Yo la renuevo antes de fin de año, no te preocupes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Javiera', what: [['patent', 'renov']], due: '2026-12-31', dueAlt: [null] },
        ],
    },
    {
        id: 'm41', kinds: ['fecha_numero'], title: 'Contrato firmado', participants: ['Carlos', 'Matías'],
        transcript: t([
            'Matías: El contrato firmado te lo envío el 4 de diciembre, que ese día vuelve el gerente.',
            'Carlos: Perfecto.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Matías', what: [['contrat']], due: '2026-12-04' },
        ],
    },
    {
        id: 'm42', kinds: ['anglicismo'], title: 'Deck para el meeting', participants: ['Carlos', 'Kevin'],
        transcript: t([
            'Kevin: ¿Tienes el deck para el meeting del jueves con los inversionistas?',
            'Carlos: Lo estoy terminando, te lo mando el miércoles para que le des una mirada.',
            'Kevin: Ok, thanks.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['deck', 'present']], due: '2026-11-18' },
        ],
    },
    {
        id: 'm43', kinds: ['aceptacion_corta'], title: 'Técnico', participants: ['Carlos', 'Rosa'],
        transcript: t([
            'Rosa: Carlos, la impresora está mala de nuevo. ¿Puedes llamar al técnico hoy?',
            'Carlos: Ya, ya, lo llamo.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['tecnic', 'llam']], due: '2026-11-16' },
        ],
    },
    {
        id: 'm44', kinds: ['condicional', 'dependencia'], title: 'Compra de equipos', participants: ['Carlos', 'Felipe'],
        transcript: t([
            'Felipe: ¿Compro los notebooks nuevos o espero?',
            'Carlos: Espera. Apenas tenga la aprobación de gerencia, te aviso para que compres los equipos.',
            'Felipe: Ya, quedo atento.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Carlos', what: [['avis', 'aprobac']], due: null, conditional: true },
            { id: 'c2', owner: 'Felipe', what: [['compr'], ['equipo', 'notebook']], due: null, dependsOn: 'c1', conditional: true, optional: true },
        ],
    },
    {
        id: 'm45', kinds: ['varios_participantes', 'decision'], title: 'Precios de diciembre', participants: ['Carlos', 'Lorena', 'Bruno', 'Elisa', 'Andrés'],
        transcript: t([
            'Elisa: Con la inflación no nos queda otra que subir los precios.',
            'Andrés: Yo propongo un 5%.',
            'Carlos: Ya, aprobado: subimos 5% desde el 1 de diciembre.',
            'Lorena: Entonces yo actualizo la lista de precios el viernes.',
            'Bruno: Y yo les aviso a los clientes el lunes 23.',
            'Carlos: Y yo reviso cómo queda el margen con el nuevo precio, para el miércoles 25.',
            'Elisa: Perfecto.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Lorena', what: [['lista', 'precio']], due: '2026-11-20' },
            { id: 'c2', owner: 'Bruno', what: [['avis', 'cliente']], due: '2026-11-23' },
            { id: 'c3', owner: 'Carlos', what: [['margen']], due: '2026-11-25' },
        ],
        decisions: [[['5']]],
        facts: [[['5']]],
    },
    {
        id: 'm46', kinds: ['ambiguo'], title: 'Minuta', participants: ['Carlos', 'Clara'],
        transcript: t([
            'Clara: Lo del cambio de software lo vemos la otra semana, ¿ya?',
            'Carlos: Ya, lo vemos.',
            'Clara: Ah, y te mando la minuta de hoy en la tarde.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Clara', what: [['minut']], due: '2026-11-16' },
        ],
        mustNot: [[['software']]],
    },
    {
        id: 'm47', kinds: ['oferta_con_pregunta'], title: 'Propuesta de Iván', participants: ['Carlos', 'Iván'],
        transcript: t([
            'Iván: ¿Te parece si te envío la propuesta el viernes?',
            'Carlos: Perfecto, el viernes.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Iván', what: [['propuest']], due: '2026-11-20' },
        ],
    },
    {
        id: 'm48', kinds: ['hora_relativa'], title: 'Fotos y aprobación', participants: ['Carlos', 'Elena'],
        transcript: t([
            'Elena: Las fotos del catálogo las subo esta tarde a la carpeta.',
            'Carlos: Ya, y yo las apruebo mañana a primera hora para que salga la publicación.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Elena', what: [['foto', 'sub']], due: '2026-11-16' },
            { id: 'c2', owner: 'Carlos', what: [['aprob', 'apru', 'public']], due: '2026-11-17', dependsOn: 'c1' },
        ],
    },
    {
        id: 'm49', kinds: ['referencia'], title: 'Transporte del evento', participants: ['Carlos', 'Paz'],
        transcript: t([
            'Paz: ¿Y el transporte para el seminario?',
            'Carlos: Joaquín tiene contacto con una empresa de buses.',
            'Paz: Ya, entonces él se encarga. Lo hablé con él ayer y me dijo que lo coordina para el jueves.',
        ]),
        commitments: [
            { id: 'c1', owner: 'Joaquín', what: [['transport', 'bus', 'coordin']], due: '2026-11-19' },
        ],
    },
    {
        id: 'm50', kinds: ['sin_compromisos'], title: 'Llamada corta', participants: ['Carlos', 'Marcela'],
        transcript: t([
            'Marcela: Hola Carlos, te llamaba para saludarte nomás, hace tiempo que no hablábamos.',
            'Carlos: ¡Marcela! Qué gusto. Todo bien por acá, harta pega.',
            'Marcela: Igual yo. Ya, conversamos otro día con más calma.',
            'Carlos: Dale, un abrazo.',
        ]),
        commitments: [],
    },
];

/**
 * Long meetings: several short ones joined into one call with everybody in
 * it, the way a real 20 to 40 minute meeting jumps between topics. The
 * references are the union of the parts. Used to see whether a model still
 * catches everything when the transcript is long.
 */
export function longMeetingCases(size = 25): MeetingCase[] {
    const out: MeetingCase[] = [];
    for (let start = 0; start < MEETING_CASES.length; start += size) {
        const parts = MEETING_CASES.slice(start, start + size);
        const id = `L${String(out.length + 1).padStart(2, '0')}`;
        const prefix = (c: MeetingCase, ref: string) => `${c.id}.${ref}`;
        out.push({
            id,
            kinds: ['larga'],
            title: 'Reunión semanal de coordinación',
            participants: [...new Set(parts.flatMap((c) => c.participants))],
            transcript: parts.map((c) => c.transcript).join(String.fromCharCode(10)),
            commitments: parts.flatMap((c) => c.commitments.map((ref) => ({
                ...ref, id: prefix(c, ref.id), ...(ref.dependsOn ? { dependsOn: prefix(c, ref.dependsOn) } : {}),
            }))),
            decisions: parts.flatMap((c) => c.decisions || []),
            mustNot: parts.flatMap((c) => c.mustNot || []),
            facts: parts.flatMap((c) => c.facts || []),
        });
    }
    return out;
}
