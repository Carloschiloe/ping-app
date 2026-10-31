// The transcription model receives a short steering prompt. On silence or
// noise it can return that prompt (sometimes prefixed, e.g. "contexto:")
// instead of the user's words. Such text is not user input and must never
// reach Ping Core as a turn: the client drops it and the server rejects it.
export const M8_VOICE_TRANSCRIPTION_PROMPT =
    'Transcribe en español de Chile. Conserva nombres propios, fechas, horas y números; no traduzcas ni agregues palabras.';

// Distinctive fragments of the prompt. Matching any one of them is enough;
// an ordinary utterance does not contain these instructions verbatim.
const PROMPT_ECHO_FRAGMENTS = [
    'transcribe en espanol de chile',
    'conserva nombres propios',
    'no traduzcas ni agregues palabras',
];

function normalizeForEcho(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function isM8VoiceTranscriptionPromptEcho(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const normalized = normalizeForEcho(value);
    return PROMPT_ECHO_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

// Structurally equivalent browser copy for the generated live-voice client.
export const M8_VOICE_TRANSCRIPTION_ECHO_BROWSER_SOURCE = `
const isM8VoiceTranscriptionPromptEcho=(value)=>{
  if(typeof value!=='string')return false;
  const normalized=value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ');
  return ${JSON.stringify(PROMPT_ECHO_FRAGMENTS)}.some(fragment=>normalized.includes(fragment));
};
`;
