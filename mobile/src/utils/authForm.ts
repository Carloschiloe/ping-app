export type AuthMode = 'login' | 'signup' | 'recovery';

export function normalizeAuthEmail(value: string): string {
    return value.trim().toLowerCase();
}

export function getAuthEmailValidationError(email: string): string | null {
    const normalizedEmail = normalizeAuthEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ? null
        : 'Ingresa un correo electrónico válido.';
}

export function getAuthCredentialsValidationError(
    email: string,
    password: string,
    mode: AuthMode
): string | null {
    const emailError = getAuthEmailValidationError(email);
    if (emailError) return emailError;
    if (!password) {
        return 'Ingresa tu contraseña.';
    }
    if (mode === 'signup' && password.length < 6) {
        return 'La contraseña debe tener al menos 6 caracteres.';
    }
    return null;
}

export function getAuthErrorMessage(error: unknown, mode: AuthMode): string {
    const candidate = (error || {}) as { code?: unknown };
    const code = typeof candidate.code === 'string' ? candidate.code : '';

    if (code === 'email_not_confirmed') {
        return 'Primero verifica tu correo. Si no lo encuentras, revisa spam.';
    }
    if (code === 'invalid_credentials') {
        return 'El correo o la contraseña no son correctos.';
    }
    if (code === 'weak_password') {
        return 'Elige una contraseña más segura.';
    }
    if (mode === 'recovery') {
        return 'No pudimos enviar el correo de recuperación. Espera un momento e inténtalo nuevamente.';
    }
    return mode === 'login'
        ? 'No pudimos iniciar sesión. Revisa tus datos e inténtalo nuevamente.'
        : 'No pudimos crear la cuenta. Revisa tus datos e inténtalo nuevamente.';
}

export function getPasswordUpdateValidationError(password: string, confirmation: string): string | null {
    if (password.length < 6) return 'La nueva contraseña debe tener al menos 6 caracteres.';
    if (password !== confirmation) return 'Las contraseñas no coinciden.';
    return null;
}
