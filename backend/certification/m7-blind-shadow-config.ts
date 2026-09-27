const DEFAULT_BLIND_MAX_COMPLETION_TOKENS = 1024;

export function getBlindMaxCompletionTokens(environment: NodeJS.ProcessEnv = process.env): number {
    const raw = environment.M7_BLIND_MAX_COMPLETION_TOKENS?.trim();
    if (!raw) return DEFAULT_BLIND_MAX_COMPLETION_TOKENS;

    if (!/^\d+$/.test(raw)) {
        throw new Error('M7_BLIND_MAX_COMPLETION_TOKENS must be an integer');
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > 4096) {
        throw new Error('M7_BLIND_MAX_COMPLETION_TOKENS must be between 1 and 4096');
    }
    return value;
}

export const BLIND_MAX_COMPLETION_TOKENS_DEFAULT = DEFAULT_BLIND_MAX_COMPLETION_TOKENS;
