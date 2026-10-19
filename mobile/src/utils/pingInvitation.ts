export const PING_APP_INVITE_URL = 'ping:///invite';
export const PING_PUBLIC_INVITE_URL = 'https://ping-app-con3.onrender.com/invite';

/**
 * Expo Go exposes an exp:// URL, but an invitation is a product link, not a
 * development-runtime link. Always normalize development URLs to Ping's
 * installed-app scheme while preserving a standalone Ping URL as generated.
 */
export function normalizePingInviteUrl(runtimeUrl: string): string {
    return /^(exp|exps):\/\//i.test(runtimeUrl) ? PING_APP_INVITE_URL : runtimeUrl;
}
