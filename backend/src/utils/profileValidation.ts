import { AppError } from './AppError';

export function normalizeFullNameInput(value: unknown): string {
    if (typeof value !== 'string') {
        throw new AppError('El nombre debe ser texto', 400);
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length < 2) {
        throw new AppError('El nombre debe tener al menos 2 caracteres', 400);
    }
    if (normalized.length > 100) {
        throw new AppError('El nombre no puede superar los 100 caracteres', 400);
    }
    if (/[\u0000-\u001f\u007f]/.test(normalized)) {
        throw new AppError('El nombre contiene caracteres no permitidos', 400);
    }
    return normalized;
}

export function normalizePhoneInput(value: unknown): string | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') {
        throw new AppError('El teléfono debe ser texto', 400);
    }

    const normalized = value.trim().replace(/[^\d+]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new AppError('El teléfono debe usar formato internacional', 400);
    }
    return normalized;
}
