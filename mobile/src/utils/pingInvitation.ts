export const PING_PUBLIC_INVITE_URL = 'https://vorian.app/invite';

// ping:///invite?token=… from the page's button, ping://invite?token=… when
// Android opens it through an intent, or the https link itself.
const INVITE_URL = /^(?:ping:\/\/\/?|https:\/\/vorian\.app\/)invite(?:\/|\?(?:.*&)?token=)([A-Za-z0-9_-]{48})(?:[&#?].*)?$/;

export function inviteTokenFromUrl(url: string | null | undefined): string | null {
    const match = INVITE_URL.exec((url ?? '').trim());
    return match ? match[1] : null;
}

export function inviteMessage(contactName: string, url: string): string {
    return [
        `Hola ${contactName}, te invito a conversar conmigo en Vorian.`,
        'Abre este enlace y quedaremos conectados:',
        url,
    ].join('\n\n');
}
