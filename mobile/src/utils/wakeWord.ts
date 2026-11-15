import AsyncStorage from '@react-native-async-storage/async-storage';

// "Hola Vorian": with the app open, saying it opens the live voice.
// Speech recognisers often hear the name as a similar word, so close
// spellings count too, but only right after a greeting or on its own.

const KEY = 'vorian.wake_word';
// "luna": a phone heard "Hola Vorian" as "Hola Luna" (2026-11-14).
const NAME = '(?:vorian|borian|florian|forian|dorian|morian|gorian|lorian|torian|orian|bo?rian|vorin|boriam|boria|luna)';
// The name said on its own counts too, but "luna" alone is just a word.
const WAKE_PATTERN = new RegExp(`(?:^|\\b)(?:hola|ola|oye|oe|hey|ey|ok|okey)\\s*${NAME}\\b|^(?!luna$)${NAME}$`);

/** Words the phone's listener is told to expect, so it favours the name. */
export const WAKE_HINTS = ['Vorian', 'Hola Vorian', 'Oye Vorian'];

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
