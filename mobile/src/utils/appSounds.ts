import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Small, quiet sounds while the app is open: sending, a message arriving in
// the open chat and a commitment done. One switch in Perfil turns them off.

export type AppSound = 'sent' | 'received' | 'done';

const STORAGE_KEY = 'ping.appSounds.v1';

const SOURCES: Record<AppSound, number> = {
    sent: require('../../assets/sounds/sent.wav'),
    received: require('../../assets/sounds/received.wav'),
    done: require('../../assets/sounds/done.wav'),
};

const VOLUME: Record<AppSound, number> = {
    sent: 0.35,
    received: 0.45,
    done: 0.45,
};

let enabled = true;
const players: Partial<Record<AppSound, AudioPlayer>> = {};

export async function loadAppSoundsPreference(): Promise<boolean> {
    try {
        enabled = (await AsyncStorage.getItem(STORAGE_KEY)) !== 'off';
    } catch {
        enabled = true;
    }
    return enabled;
}

export function appSoundsEnabled(): boolean {
    return enabled;
}

export async function setAppSoundsEnabled(value: boolean): Promise<void> {
    enabled = value;
    try {
        await AsyncStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
    } catch {
        // The choice still holds until the app closes.
    }
}

export function playAppSound(sound: AppSound): void {
    if (!enabled || AppState.currentState !== 'active') return;
    try {
        const player = players[sound] ?? (players[sound] = createAudioPlayer(SOURCES[sound]));
        player.volume = VOLUME[sound];
        void player.seekTo(0);
        player.play();
    } catch {
        // A sound is a nicety; never let it break a send.
    }
    if (sound === 'sent') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
}

// A message from someone else arrived while the chat is on screen. The first
// look at a chat, older pages and my own messages make no sound.
export function isNewIncomingMessage(previousNewestId: string | null, newest: any, myUserId: string | undefined): boolean {
    if (!previousNewestId || !newest?.id || newest.id === previousNewestId) return false;
    if (!newest.sender_id || newest.sender_id === myUserId) return false;
    if (newest.deleted_at) return false;
    return true;
}
