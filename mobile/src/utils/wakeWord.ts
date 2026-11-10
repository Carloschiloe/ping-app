import AsyncStorage from '@react-native-async-storage/async-storage';

// "Hola Vorian": with the app open, saying it opens the live voice.
// Speech recognisers often hear the name as a similar word, so close
// spellings count too, but only right after a greeting or on its own.

const KEY = 'vorian.wake_word';
const NAME = '(?:vorian|borian|florian|dorian|morian|gorian|bo?rian|vorin|boriam|vorián)';
const WAKE_PATTERN = new RegExp(`(?:^|\\b)(?:hola|ola|oye|oe|hey|ey|ok|okey)\\s+${NAME}\\b|^${NAME}$`);

export function normalizeHeard(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isWakePhrase(text: unknown): boolean {
    if (typeof text !== 'string') return false;
    return WAKE_PATTERN.test(normalizeHeard(text));
}

export async function loadWakeWord(): Promise<boolean> {
    try { return (await AsyncStorage.getItem(KEY)) === 'true'; } catch { return false; }
}

export async function saveWakeWord(value: boolean): Promise<void> {
    try { await AsyncStorage.setItem(KEY, value ? 'true' : 'false'); } catch { /* stays as it was */ }
    wakeWordListeners.forEach((listener) => listener(value));
}

const wakeWordListeners = new Set<(on: boolean) => void>();
export function onWakeWordChange(listener: (on: boolean) => void): () => void {
    wakeWordListeners.add(listener);
    return () => { wakeWordListeners.delete(listener); };
}
