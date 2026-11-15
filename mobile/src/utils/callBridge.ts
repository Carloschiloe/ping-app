export type CallBridgeStatus =
    | 'joining'
    | 'waiting'
    | 'accepted'
    | 'connected'
    | 'error';

export type CallBridgeMessage = {
    type: 'call-status';
    status: CallBridgeStatus;
};

// The web view compares this against the page's origin alone ("https://host",
// no path), so "https://host/*" never matched: any change of page inside it,
// like the live voice switching to its backup voice, was sent to Chrome
// (2026-11-15). The list names the origin; isCallPageUrl then requires that
// exact origin, so a look-alike host cannot load inside the app.
export function buildCallPageOriginWhitelist(apiUrl: string): string[] {
    return [new URL(apiUrl).origin];
}

export function isCallPageUrl(apiUrl: string, url: string): boolean {
    if (url === 'about:blank') return true;
    try { return new URL(url).origin === new URL(apiUrl).origin; } catch { return false; }
}

export function getAllowedCallPermissionResources(isVideo: boolean): string[] {
    return isVideo ? ['AUDIO_CAPTURE', 'VIDEO_CAPTURE'] : ['AUDIO_CAPTURE'];
}

export function buildCallPageUrl(
    apiUrl: string,
    params: {
        appId: string;
        token: string;
        channel: string;
        video: boolean;
        timestamp?: number;
    }
) {
    const baseUrl = apiUrl.replace(/\/+$/, '');
    const query = new URLSearchParams({
        appId: params.appId,
        token: params.token,
        channel: params.channel,
        video: String(params.video),
        t: String(params.timestamp ?? Date.now()),
    });

    return `${baseUrl}/call?${query.toString()}`;
}

export function parseCallBridgeMessage(raw: string): CallBridgeMessage | null {
    try {
        const value = JSON.parse(raw);
        if (
            value?.type === 'call-status'
            && ['joining', 'waiting', 'accepted', 'connected', 'error'].includes(value.status)
        ) {
            return value as CallBridgeMessage;
        }
    } catch {
        return null;
    }
    return null;
}
