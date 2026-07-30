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
