// Who is using the microphone right now (the live voice, a call). Listening
// for "Hola Vorian" steps aside while any of them is.

const users = new Set<string>();
const listeners = new Set<(busy: boolean) => void>();

export function setMicBusy(who: string, busy: boolean): void {
    const before = users.size > 0;
    if (busy) users.add(who); else users.delete(who);
    const after = users.size > 0;
    if (before !== after) listeners.forEach((listener) => listener(after));
}

export const isMicBusy = () => users.size > 0;

export function onMicBusyChange(listener: (busy: boolean) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
