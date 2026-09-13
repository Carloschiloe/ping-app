// PING — AGENT RESPONSE LANGUAGE CONSISTENCY.
//
// Single canonical owner of "which language should this user-visible Agent
// prose be in" — reused by every layer that produces such prose
// (agentResponseSynthesizer.service.ts for the read/query path,
// agentPlanner.service.ts for the write/planning path). Never duplicated:
// before this file existed, detectTemplateLanguage() lived privately inside
// agentResponseSynthesizer.service.ts, and the planning path had NO
// language awareness at all -- its one non-Spanish fallback message
// (objectiveType 'unsupported' -> failureMessage) was hardcoded English
// regardless of the user's actual language, the exact physical failure
// this file fixes. Moving the detector here (and having the synthesizer
// re-export it, so its own call sites and internal comments stay literally
// unchanged) means every future write-path/read-path prose site reuses the
// SAME detection, never a second local copy that could drift.
//
// Signal priority (sección 13, hardened M-1G.1): the real device locale
// (BCP-47, e.g. "es-CL"/"en-US"), already sent by mobile on every request,
// is primary. A regex-based signal on the utterance itself is only the
// fallback when no locale is present/recognized -- real staging evidence
// (M-1G-S2, "Crea un compromiso para llamar a Alejandra por favor") showed
// a Spanish sentence with no interrogative word triggers no regex signal
// and falls to a fixed English default despite locale="es-CL" already being
// available. Never a hardcoded country -- only the language subtag of the
// locale, works for any "es-*"/"en-*".
const ENGLISH_SIGNAL = /\b(what|who|when|where|did|does|the|and|with|about)\b/i;
const SPANISH_SIGNAL = /[áéíóúñ¿¡]|(\b(qué|quien|quién|cuando|cuándo|con|sobre|el|la|los|las)\b)/i;

export type AgentLanguage = 'es' | 'en';

export function detectAgentLanguage(input: string, locale?: string): AgentLanguage {
    const localeLang = locale?.split('-')[0]?.toLowerCase();
    if (localeLang === 'es') return 'es';
    if (localeLang === 'en') return 'en';

    const hasSpanish = SPANISH_SIGNAL.test(input);
    const hasEnglish = ENGLISH_SIGNAL.test(input);
    if (hasSpanish && !hasEnglish) return 'es';
    if (hasEnglish && !hasSpanish) return 'en';
    return hasSpanish ? 'es' : 'en'; // tie or no signal at all, and locale absent/unrecognized -> Spanish only as the last tie-breaker, never a fixed server-side English default
}
