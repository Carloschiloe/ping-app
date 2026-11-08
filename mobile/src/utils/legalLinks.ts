import * as WebBrowser from 'expo-web-browser';
import { API_URL } from '../api/client';

// The privacy policy, terms and account-deletion page live on Ping's own
// server, at the same public addresses given to Google Play.
export const LEGAL_BASE_URL = API_URL.replace(/\/api\/?$/, '');

export const LEGAL_PAGES = {
    privacy: '/privacidad',
    terms: '/terminos',
    deleteAccount: '/cuenta/eliminar',
} as const;

export const LEGAL_CONTACT = 'contacto@marvex.cl';

export function legalUrl(page: keyof typeof LEGAL_PAGES): string {
    return `${LEGAL_BASE_URL}${LEGAL_PAGES[page]}`;
}

export function openLegal(page: keyof typeof LEGAL_PAGES): void {
    WebBrowser.openBrowserAsync(legalUrl(page)).catch(() => undefined);
}
