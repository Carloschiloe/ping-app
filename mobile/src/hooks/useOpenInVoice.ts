import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { shouldOpenInVoiceOnLaunch } from '../utils/openInVoice';

/** A notice tapped this recently opened the app; it decides where to go instead. */
const NOTICE_LAUNCH_MS = 60_000;

// Starts the live voice when the app is opened from scratch and the person
// chose "Abrir directo en voz" in Ajustes.
export function useOpenInVoice(navigationRef: any) {
    useEffect(() => {
        let active = true;
        void (async () => {
            if (!(await shouldOpenInVoiceOnLaunch()) || !active) return;
            const launch = await Notifications.getLastNotificationResponseAsync().catch(() => null);
            if (launch && Date.now() - launch.notification.date < NOTICE_LAUNCH_MS) return;
            // Waits (up to about 5 seconds) for the screens to be ready.
            for (let attempt = 0; attempt < 25 && active; attempt += 1) {
                const nav = navigationRef?.current ?? navigationRef;
                if (nav?.isReady?.()) {
                    try {
                        nav.navigate('Main', { screen: 'Chats', params: { screen: 'PingAI', params: { surface: publicPingSurface(), startWith: 'voice' } } });
                    } catch { /* navigation not mounted any more */ }
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        })();
        return () => { active = false; };
    }, [navigationRef]);
}
