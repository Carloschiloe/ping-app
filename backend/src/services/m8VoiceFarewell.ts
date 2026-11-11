// Closing the live voice by voice. Only a whole, short goodbye counts
// ("chao Vorian", "gracias, eso es todo", "cierra"), never a sentence that
// merely contains one of the words ("cierra el compromiso con Juan"), so a
// conversation is not cut in the middle by mistake.

// One goodbye, or several in a row ("chao, ciérrate", "listo, apágate Vorian").
const FAREWELL_CORE = '(?:chao|chau|adios|hasta luego|hasta pronto|hasta manana|nos vemos|eso es todo|eso seria todo|seria todo|nada mas'
    + '|(?:cierra|cerrar|cierrate|cierre|termina|terminar|terminamos|corta|cortar|apaga|apagate|salir|sal|sali)'
    + '(?:\\s+(?:la conversacion|la llamada|el asistente|la voz|el modo voz|vorian))?)';

const FAREWELL_PATTERN = new RegExp(
    '^(?:(?:ok|oka|okey|bueno|listo|ya|perfecto|vale|muchas gracias|gracias|vorian|oye vorian)\\s+)*'
    + FAREWELL_CORE
    + '(?:\\s+(?:' + FAREWELL_CORE + '|vorian|gracias|muchas gracias|por ahora|entonces|por hoy|nomas|ya|listo|porfa|por favor))*$',
);

export function normalizeFarewell(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
}

export function isVoiceFarewell(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const text = normalizeFarewell(value);
    return text.length > 0 && text.length <= 60 && FAREWELL_PATTERN.test(text);
}

/** Same check for the voice page, which runs in the phone's WebView. */
export const M8_VOICE_FAREWELL_BROWSER_SOURCE = `
const FAREWELL_PATTERN=new RegExp(${JSON.stringify(FAREWELL_PATTERN.source)});
const isVoiceFarewell=(value)=>{
  if(typeof value!=='string')return false;
  const text=value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z\\s]/g,' ').replace(/\\\s+/g,' ').trim();
  return text.length>0&&text.length<=60&&FAREWELL_PATTERN.test(text);
};`;
