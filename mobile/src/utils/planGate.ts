// Shown when the server answers that this needs a plan (the free trial
// ended). Once per moment, even if several requests are turned away together.
// The card is loaded lazily so the API client stays free of UI code.

let lastShown = 0;
let dialog: Promise<typeof import('../design/ConfirmDialog')> | null = null;

export const PLAN_REQUIRED_TITLE = 'Tu prueba gratis terminó';
export const PLAN_REQUIRED_MESSAGE =
    'Puedes seguir leyendo y respondiendo tus mensajes. El asistente, los resúmenes, los compromisos nuevos y las llamadas vuelven con un plan. Muy pronto podrás suscribirte desde la app; mientras, escríbenos a contacto@marvex.cl.';

export function showPlanRequired(now = Date.now()): boolean {
    if (now - lastShown < 10_000) return false;
    lastShown = now;
    dialog ??= import('../design/ConfirmDialog');
    void dialog
        .then(({ notify }) => notify({ title: PLAN_REQUIRED_TITLE, message: PLAN_REQUIRED_MESSAGE }))
        .catch(() => undefined);
    return true;
}
