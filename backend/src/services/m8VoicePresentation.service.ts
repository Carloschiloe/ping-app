export type M8VoiceCoreKind = 'response' | 'error';

export interface M8VoiceCorePresentation {
    kind: M8VoiceCoreKind;
    authorizedText: string;
}

export const EMPTY_CORE_PRESENTATION = 'Vorian Core no entregó contenido suficiente para responder.';

/**
 * Screen formatting read aloud sounds like a machine: bold marks, list
 * bullets, headings and emoji. This removes only that formatting, never a
 * word, so what is spoken is still exactly the assistant's answer. The same
 * function runs in the voice page (see the browser source below).
 */
export function speakForVoice(text: string): string {
    const lines = String(text || '')
        .replace(/[*_`~]{1,3}/g, '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(#{1,6}\s+|[-•·]\s+|\d{1,2}[.)]\s+)/, '').trim())
        .filter(Boolean);
    return lines
        .map((line, index) => (index < lines.length - 1 && !/[.!?:;,]$/.test(line) ? line + '.' : line))
        .join(' ')
        .replace(/(\d)\s*(?:hrs?|hs)(?=[\s.,;]|$)/gi, '$1 horas')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Voice speaks exactly the assistant's answer. Anything else (an error body,
 * an empty answer) becomes an honest fixed sentence, never invented content.
 */
export function buildM8VoiceCorePresentation(core: unknown): M8VoiceCorePresentation {
    const value = (core && typeof core === 'object' ? core : {}) as Record<string, any>;
    const answer = typeof value.response?.answer === 'string' ? speakForVoice(value.response.answer) : '';
    if (value.kind === 'response') return { kind: 'response', authorizedText: answer || EMPTY_CORE_PRESENTATION };
    return { kind: 'error', authorizedText: EMPTY_CORE_PRESENTATION };
}

// This is deliberately kept in the generated client so the browser applies the
// same projection without receiving raw Core internals. Keep this
// implementation structurally equivalent to buildM8VoiceCorePresentation.
export const M8_VOICE_PRESENTATION_BROWSER_SOURCE = `
const speakForVoice=${speakForVoice.toString()};
const buildM8VoiceCorePresentation=(core)=>{
  const value=core&&typeof core==='object'?core:{};
  const answer=typeof value.response?.answer==='string'?speakForVoice(value.response.answer):'';
  const empty='${EMPTY_CORE_PRESENTATION}';
  if(value.kind==='response')return {kind:'response',authorizedText:answer||empty};
  return {kind:'error',authorizedText:empty};
};
`;
