export type M8VoiceCoreKind = 'response' | 'plan' | 'clarification' | 'unsupported' | 'error';
import { resolveM8VoiceConfirmationState } from './m8VoiceConfirmationContract.service';

export interface M8VoiceCorePresentation {
    kind: M8VoiceCoreKind;
    authorizedText: string;
    confirmationRequired: boolean;
    confirmationLabel?: string;
    cancelLabel?: string;
}

export const EMPTY_CORE_PRESENTATION = 'Ping Core no entregó contenido suficiente para responder.';

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function firstText(...values: unknown[]): string {
    for (const value of values) {
        const candidate = text(value);
        if (candidate) return candidate;
    }
    return '';
}

export function buildM8VoiceCorePresentation(core: unknown): M8VoiceCorePresentation {
    const value = (core && typeof core === 'object' ? core : {}) as Record<string, any>;
    const kind: M8VoiceCoreKind = value.kind === 'plan'
        ? 'plan'
        : value.kind === 'clarification'
            ? 'clarification'
            : value.kind === 'response'
                ? 'response'
                : value.kind === 'unsupported'
                    ? 'unsupported'
                    : 'error';

    if (kind === 'response') {
        return {
            kind,
            authorizedText: firstText(value.response?.answer, value.answer) || EMPTY_CORE_PRESENTATION,
            confirmationRequired: false,
        };
    }

    if (kind === 'clarification') {
        const questions = Array.isArray(value.questions)
            ? value.questions.map((question: any) => text(question?.question)).filter(Boolean)
            : [];
        return {
            kind,
            authorizedText: firstText(questions.join(' '), value.partialResponse?.answer) || EMPTY_CORE_PRESENTATION,
            confirmationRequired: false,
        };
    }

    if (kind === 'plan') {
        const presentation = value.presentation && typeof value.presentation === 'object' ? value.presentation : {};
        const confirmationState = resolveM8VoiceConfirmationState(value);
        return {
            kind,
            authorizedText: firstText(presentation.summary, presentation.headline, presentation.effectDescription) || EMPTY_CORE_PRESENTATION,
            confirmationRequired: confirmationState !== 'received' && presentation.requiresExplicitConfirmation === true,
            confirmationLabel: firstText(presentation.confirmationLabel) || undefined,
            cancelLabel: firstText(presentation.cancelLabel) || undefined,
        };
    }

    if (kind === 'unsupported') {
        return {
            kind,
            authorizedText: text(value.reason) || EMPTY_CORE_PRESENTATION,
            confirmationRequired: false,
        };
    }

    return { kind: 'error', authorizedText: EMPTY_CORE_PRESENTATION, confirmationRequired: false };
}

// This is deliberately kept in the generated client so the browser applies the
// same Core-owned projection without receiving raw Core internals. Keep this
// implementation structurally equivalent to buildM8VoiceCorePresentation.
export const M8_VOICE_PRESENTATION_BROWSER_SOURCE = `
const buildM8VoiceCorePresentation=(core)=>{
  const text=value=>typeof value==='string'?value.trim():'';
  const firstText=(...values)=>{for(const value of values){const candidate=text(value);if(candidate)return candidate}return ''};
  const value=core&&typeof core==='object'?core:{};
  const kind=value.kind==='plan'?'plan':value.kind==='clarification'?'clarification':value.kind==='response'?'response':value.kind==='unsupported'?'unsupported':'error';
  const empty='${EMPTY_CORE_PRESENTATION}';
  if(kind==='response')return {kind,authorizedText:firstText(value.response?.answer,value.answer)||empty,confirmationRequired:false};
  if(kind==='clarification'){const questions=Array.isArray(value.questions)?value.questions.map(question=>text(question?.question)).filter(Boolean):[];return {kind,authorizedText:firstText(questions.join(' '),value.partialResponse?.answer)||empty,confirmationRequired:false};}
  if(kind==='plan'){const presentation=value.presentation&&typeof value.presentation==='object'?value.presentation:{};const confirmationState=resolveM8VoiceConfirmationState(value);return {kind,authorizedText:firstText(presentation.summary,presentation.headline,presentation.effectDescription)||empty,confirmationRequired:confirmationState!=='received'&&presentation.requiresExplicitConfirmation===true,confirmationLabel:firstText(presentation.confirmationLabel)||undefined,cancelLabel:firstText(presentation.cancelLabel)||undefined};}
  if(kind==='unsupported')return {kind,authorizedText:text(value.reason)||empty,confirmationRequired:false};
  return {kind:'error',authorizedText:empty,confirmationRequired:false};
};
`;
