// Closing the live voice by voice. People say goodbye with words around it
// ("Eso nomás quería saber. Chau.", "Ciérrate, ya terminé de hablar contigo"),
// so it closes when:
//   - the last part of what was said is a goodbye ("... chau", "... gracias, eso es todo"), or
//   - any part is an unmistakable order to close ("ciérrate", "apágate",
//     "terminé de hablar contigo", "cierra la conversación").
// A request that only uses one of the words never closes it
// ("Cierra el compromiso con Juan", "Chao, y recuérdame llamar a Juan").
// The same source runs here and in the phone's voice page.

export const M8_VOICE_FAREWELL_BROWSER_SOURCE = String.raw`
const FAREWELL_CORE='(?:chao|chau|adios|hasta luego|hasta pronto|hasta manana|nos vemos|eso es todo|eso seria todo|seria todo|nada mas|eso nomas|eso era todo|eso era'
  +'|(?:cierra|cerrar|cierrate|cierre|termina|terminar|terminamos|termine|ya termine|corta|cortar|apaga|apagate|salir|sal|sali|salte)'
  +'(?: +(?:la conversacion|la llamada|el asistente|la voz|el modo voz|vorian|de hablar contigo))?)';
const FAREWELL_PATTERN=new RegExp('^(?:(?:ok|oka|okey|bueno|listo|ya|perfecto|vale|muchas gracias|gracias|vorian|oye vorian|y) +)*'
  +FAREWELL_CORE+'(?: +(?:'+FAREWELL_CORE+'|vorian|gracias|muchas gracias|por ahora|entonces|por hoy|nomas|ya|listo|porfa|por favor|amigo))*$');
const FAREWELL_DISMISS='(?:te salude sin querer|te llame sin querer|te abri sin querer|fue sin querer|era sin querer|sin querer|no necesito nada(?: de ti| mas| por ahora| por hoy)?|no quiero nada(?: mas)?|olvidalo|olvida eso|dejalo|deja eso|me equivoque|no era nada|no es nada|me arrepenti)';
const FAREWELL_FILLER='(?:ok|oka|okey|bueno|listo|ya|perfecto|vale|gracias|muchas gracias|no gracias|vorian|oye vorian|y|no|nada|te dije|ya te dije|te lo dije|estoy bien|todo bien|nomas|no mas|perdon|disculpa|entonces|por ahora|por hoy|porfa|por favor|amigo|de ti|en serio|po|pues)';
const FAREWELL_UNIT='(?:'+FAREWELL_CORE+'|'+FAREWELL_DISMISS+'|'+FAREWELL_FILLER+')';
// A goodbye or a "never mind" mixed only with filler ("chao, te dije", "olvidalo, no necesito nada, chao").
const FAREWELL_LOOSE=new RegExp('^(?:'+FAREWELL_UNIT+' +)*(?:'+FAREWELL_CORE+'|'+FAREWELL_DISMISS+')(?: +'+FAREWELL_UNIT+')*$');
const FAREWELL_STRONG=/(?:^|\s)(?:cierrate|apagate|salte|(?:ya |yo )?termine de hablar contigo|(?:cierra|termina|corta|apaga) (?:la conversacion|la llamada|el asistente|la voz|el modo voz))(?:\s|$)/;
const farewellNormalize=(value)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim();
const isVoiceFarewell=(value)=>{
  if(typeof value!=='string')return false;
  const whole=farewellNormalize(value);
  if(!whole||whole.length>120)return false;
  if(FAREWELL_PATTERN.test(whole)||FAREWELL_STRONG.test(whole)||FAREWELL_LOOSE.test(whole))return true;
  const parts=value.split(/[.,;:!?¡¿\n]+/).map(farewellNormalize).filter(Boolean);
  return parts.length>0&&FAREWELL_PATTERN.test(parts[parts.length-1]);
};`;

const loaded = new Function(`${M8_VOICE_FAREWELL_BROWSER_SOURCE}; return { isVoiceFarewell, farewellNormalize };`)() as {
    isVoiceFarewell: (value: unknown) => boolean;
    farewellNormalize: (value: string) => string;
};

export function normalizeFarewell(value: string): string {
    return loaded.farewellNormalize(value);
}

export function isVoiceFarewell(value: unknown): boolean {
    return loaded.isVoiceFarewell(value);
}
