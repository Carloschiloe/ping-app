import { AppError } from './AppError';

const SENSITIVE_TEXT_PATTERNS: Array<[RegExp, string]> = [
    [/Bearer\s+[^\s]+/gi, 'Bearer [redacted]'],
    [/sk-[A-Za-z0-9_-]+/g, '[redacted]'],
    [/(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]'],
    [/https?:\/\/[^\s]+/gi, '[url redacted]'],
];

export function redactSensitiveText(value: unknown, maxLength = 500): string {
    let text = typeof value === 'string' ? value : String(value ?? 'Unknown error');
    for (const [pattern, replacement] of SENSITIVE_TEXT_PATTERNS) {
        text = text.replace(pattern, replacement);
    }
    return text.slice(0, maxLength);
}

export function publicErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AppError && error.isOperational && error.statusCode < 500) {
        return error.message;
    }
    return fallback;
}

export function safeErrorLog(error: unknown): Record<string, unknown> {
    const value = error as Record<string, unknown> | null;
    return {
        name: typeof value?.name === 'string' ? value.name.slice(0, 80) : 'UnknownError',
        code: typeof value?.code === 'string' ? value.code.slice(0, 80) : undefined,
        status: typeof value?.status === 'number' ? value.status : undefined,
        message: redactSensitiveText(value?.message),
    };
}
