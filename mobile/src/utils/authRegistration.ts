export const DEFAULT_SIGNUP_COOLDOWN_SECONDS = 60;

type AuthErrorLike = {
    name?: unknown;
    status?: unknown;
    code?: unknown;
    message?: unknown;
};

export function parseSignupRetryAfterSeconds(error: unknown): number | null {
    const candidate = (error || {}) as AuthErrorLike;
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const match = message.match(/after\s+(\d+)\s+seconds?/i);

    if (match) {
        return Math.max(1, Number.parseInt(match[1], 10));
    }

    return candidate.status === 429 ? DEFAULT_SIGNUP_COOLDOWN_SECONDS : null;
}

export function getSafeAuthErrorDetails(error: unknown) {
    const candidate = (error || {}) as AuthErrorLike;
    return {
        name: typeof candidate.name === 'string' ? candidate.name : 'UnknownAuthError',
        status: typeof candidate.status === 'number' ? candidate.status : null,
        code: typeof candidate.code === 'string' ? candidate.code : null,
        retryAfterSeconds: parseSignupRetryAfterSeconds(error),
    };
}

export function getSignupCooldownMessage(signupSubmitted: boolean, seconds: number): string {
    if (signupSubmitted) {
        return `Correo de verificación enviado. Podrás solicitar otro en ${seconds} segundos.`;
    }
    return `Por seguridad, podrás volver a intentarlo en ${seconds} segundos.`;
}

export function createRequestGate() {
    let inFlight = false;

    return {
        tryStart() {
            if (inFlight) return false;
            inFlight = true;
            return true;
        },
        finish() {
            inFlight = false;
        },
        isInFlight() {
            return inFlight;
        },
    };
}
