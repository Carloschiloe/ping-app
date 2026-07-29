export type AuthRedirectPayload = {
    accessToken: string | null;
    refreshToken: string | null;
    code: string | null;
    errorCode: string | null;
    type: string | null;
};

export function parseAuthRedirectUrl(url: string): AuthRedirectPayload | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const getValue = (key: string) => fragment.get(key) || parsed.searchParams.get(key);
    const payload: AuthRedirectPayload = {
        accessToken: getValue('access_token'),
        refreshToken: getValue('refresh_token'),
        code: getValue('code'),
        errorCode: getValue('error_code') || getValue('error'),
        type: getValue('type'),
    };

    if (!payload.accessToken && !payload.refreshToken && !payload.code && !payload.errorCode) {
        return null;
    }
    return payload;
}
