export function getBackendHealthUrl(apiUrl: string) {
    const normalized = apiUrl.replace(/\/+$/, '');
    const apiBase = normalized.replace(/\/api$/i, '');
    return `${apiBase}/health`;
}
