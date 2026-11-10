import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { isMicBusy, onMicBusyChange } from '../utils/micBusy';
import { isWakePhrase, loadWakeWord, onWakeWordChange } from '../utils/wakeWord';

// While the app is open and on screen, and the person turned it on in
// Ajustes, the phone listens for "Hola Vorian" (on the phone itself when it
// can) and opens the live voice. It never listens with the app closed or in
// the background, and steps aside while the voice or a call uses the mic.

const RESTART_MS = 600;
const BACKOFF_MS = 4000;

export function useWakeWord(navigationRef: any) {
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        let enabled = false;
        let listening = false;
        let disposed = false;
        let restartTimer: ReturnType<typeof setTimeout> | null = null;
        let appActive = AppState.currentState === 'active';
        let failures = 0;

        const eligible = () => !disposed && enabled && appActive && !isMicBusy();

        const stop = () => {
            if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
            if (!listening) return;
            listening = false;
            try { ExpoSpeechRecognitionModule.abort(); } catch { /* already stopped */ }
        };

        const start = async () => {
            if (!eligible() || listening) return;
            try {
                const permission = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
                if (!permission.granted || !eligible() || listening) return;
                const onDevice = (() => { try { return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(); } catch { return false; } })();
                listening = true;
                ExpoSpeechRecognitionModule.start({
                    lang: 'es-CL',
                    interimResults: true,
                    continuous: true,
                    requiresOnDeviceRecognition: onDevice,
                    addsPunctuation: false,
                    androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
                });
            } catch {
                listening = false;
                scheduleRestart(BACKOFF_MS);
            }
        };

        const scheduleRestart = (delay: number) => {
            if (restartTimer || !eligible()) return;
            restartTimer = setTimeout(() => { restartTimer = null; void start(); }, delay);
        };

        const openVoice = () => {
            stop();
            // A moment for the recogniser to let go of the microphone before the voice takes it.
            setTimeout(() => {
                const nav = navigationRef?.current ?? navigationRef;
                try {
                    nav?.navigate('Main', { screen: 'Chats', params: { screen: 'PingAI', params: { surface: publicPingSurface(), startWith: 'voice', voiceAt: Date.now() } } });
                } catch { /* navigation not ready */ }
            }, 400);
        };

        const subscriptions = [
            ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
                failures = 0;
                const heard = (event?.results ?? []).map((r: any) => r?.transcript ?? '').join(' ');
                if (isWakePhrase(heard)) openVoice();
            }),
            ExpoSpeechRecognitionModule.addListener('end', () => {
                listening = false;
                scheduleRestart(RESTART_MS);
            }),
            ExpoSpeechRecognitionModule.addListener('error', () => {
                listening = false;
                failures += 1;
                // Repeated failures (no recogniser, no network) back off instead of looping.
                scheduleRestart(failures > 3 ? BACKOFF_MS * 4 : BACKOFF_MS);
            }),
        ];

        const refresh = () => { if (eligible()) void start(); else stop(); };

        const appStateSub = AppState.addEventListener('change', (state) => { appActive = state === 'active'; refresh(); });
        const offBusy = onMicBusyChange(() => refresh());
        const offSetting = onWakeWordChange((on) => { enabled = on; refresh(); });
        void loadWakeWord().then((on) => { enabled = on; refresh(); });

        return () => {
            disposed = true;
            stop();
            subscriptions.forEach((s) => s.remove());
            appStateSub.remove();
            offBusy();
            offSetting();
        };
    }, [navigationRef]);
}
