export type M8VoiceConfirmationState = 'required' | 'received';

/**
 * The Core/Voice boundary must never infer consent from a request for consent.
 * Missing or legacy state is deliberately treated as `required` (fail closed).
 */
export function resolveM8VoiceConfirmationState(value: unknown): M8VoiceConfirmationState {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return record.confirmationState === 'received' ? 'received' : 'required';
}

export function shouldAuthorizeM8VoicePlan(value: unknown): boolean {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return record.kind === 'plan' && resolveM8VoiceConfirmationState(record) === 'received';
}

/** Equivalent contract used inside the credential-free generated WebView client. */
export const M8_VOICE_CONFIRMATION_BROWSER_SOURCE = `
const resolveM8VoiceConfirmationState=(value)=>value&&typeof value==='object'&&value.confirmationState==='received'?'received':'required';
const shouldAuthorizeM8VoicePlan=(value)=>value&&value.kind==='plan'&&resolveM8VoiceConfirmationState(value)==='received';
`;
