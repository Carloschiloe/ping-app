export type M8VoiceCoreKind = 'response' | 'error';

export interface M8VoiceCorePresentation {
    kind: M8VoiceCoreKind;
    authorizedText: string;
}

export const EMPTY_CORE_PRESENTATION = 'Ping Core no entregó contenido suficiente para responder.';

/**
 * Voice speaks exactly the assistant's answer. Anything else (an error body,
 * an empty answer) becomes an honest fixed sentence, never invented content.
 */
export function buildM8VoiceCorePresentation(core: unknown): M8VoiceCorePresentation {
    const value = (core && typeof core === 'object' ? core : {}) as Record<string, any>;
    const answer = typeof value.response?.answer === 'string' ? value.response.answer.trim() : '';
    if (value.kind === 'response') return { kind: 'response', authorizedText: answer || EMPTY_CORE_PRESENTATION };
    return { kind: 'error', authorizedText: EMPTY_CORE_PRESENTATION };
}

// This is deliberately kept in the generated client so the browser applies the
// same projection without receiving raw Core internals. Keep this
// implementation structurally equivalent to buildM8VoiceCorePresentation.
export const M8_VOICE_PRESENTATION_BROWSER_SOURCE = `
const buildM8VoiceCorePresentation=(core)=>{
  const value=core&&typeof core==='object'?core:{};
  const answer=typeof value.response?.answer==='string'?value.response.answer.trim():'';
  const empty='${EMPTY_CORE_PRESENTATION}';
  if(value.kind==='response')return {kind:'response',authorizedText:answer||empty};
  return {kind:'error',authorizedText:empty};
};
`;
