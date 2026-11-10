// Closing the live voice by voice. Only a whole, short goodbye counts
// ("chao Vorian", "gracias, eso es todo", "cierra"), never a sentence that
// merely contains one of the words ("cierra el compromiso con Juan"), so a
// conversation is not cut in the middle by mistake.

const FAREWELL_PATTERN = new RegExp(
    '^(?:(?:ok|oka|okey|bueno|listo|ya|perfecto|vale|muchas gracias|gracias|vorian|oye vorian)\\s+)*'
    + '(?:chao|chau|adios|hasta luego|hasta pronto|hasta manana|nos vemos|eso es todo|eso seria todo|seria todo|nada mas'
    + '|(?:cierra|cerrar|cierrate|termina|terminar|corta|cortar|apaga|salir|sal)(?:\\s+(?:la conversacion|la llamada|el asistente|la voz|vorian))?)'
    + '(?:\\s+(?:vorian|gracias|muchas gracias|por ahora|entonces|por hoy|nomas))*$',
);

export function normalizeFarewell(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
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
  const text=value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z\\s]/g,' ').replace(/\\s+/g,' ').trim();
  return text.length>0&&text.length<=60&&FAREWELL_PATTERN.test(text);
};`;
