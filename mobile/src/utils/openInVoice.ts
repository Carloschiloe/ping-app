import AsyncStorage from '@react-native-async-storage/async-storage';

// "Abrir directo en voz": when it is on, opening Vorian from scratch starts
// the live voice at once, so "Ok Google, abre Vorian" leaves the person
// talking with the assistant without touching the screen. Kept on this phone.

const KEY = 'vorian.open_in_voice';

export async function loadOpenInVoice(): Promise<boolean> {
    try {
        return (await AsyncStorage.getItem(KEY)) === 'true';
    } catch {
        return false;
    }
}

export async function saveOpenInVoice(value: boolean): Promise<void> {
    try {
        await AsyncStorage.setItem(KEY, value ? 'true' : 'false');
    } catch { /* stays as it was */ }
}

/** Only the first open of the app counts, not coming back to it later. */
let alreadyDecided = false;

export async function shouldOpenInVoiceOnLaunch(): Promise<boolean> {
    if (alreadyDecided) return false;
    alreadyDecided = true;
    return loadOpenInVoice();
}
