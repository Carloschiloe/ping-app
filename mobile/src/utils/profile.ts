export function normalizeDisplayName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

export function getDisplayNameValidationError(value: string): string | null {
    const normalized = normalizeDisplayName(value);
    if (normalized.length < 2) return 'Ingresa un nombre de al menos 2 caracteres.';
    if (normalized.length > 100) return 'El nombre no puede superar los 100 caracteres.';
    if (/[\u0000-\u001f\u007f]/.test(normalized)) return 'El nombre contiene caracteres no permitidos.';
    return null;
}

export function normalizeOptionalPhone(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let normalized = trimmed.replace(/[^\d+]/g, '');
    if (!normalized.startsWith('+')) {
        normalized = `+56${normalized.replace(/^0/, '')}`;
    }
    return normalized;
}
