import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { publicPingSurface } from '../api/agentSurfaceAdapter';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { setVoiceShortcut } from '../../modules/vorian-alarm';
import { syncBriefingAlarm } from '../utils/briefingAlarm';

// Ways into the live voice from outside the app:
//  - ping://briefing: the summary alarm rang; Vorian says the day out loud.
//  - ping://voz: the "Hablar con Vorian" shortcut on the app icon.
// Also keeps the phone's summary alarm in step with Ajustes on every start.

export function voiceLinkKind(url: string | null | undefined): 'briefing' | 'voice' | null {
    if (!url) return null;
    const clean = url.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
    if (clean === 'ping://briefing') return 'briefing';
    if (clean === 'ping://voz') return 'voice';
    return null;
}

export function openVoiceFromLink(navigationRef: any, kind: 'briefing' | 'voice'): void {
    const go = (attempt: number) => {
        const nav = navigationRef?.current ?? navigationRef;
        if (!nav?.isReady?.()) {
            if (attempt < 25) setTimeout(() => go(attempt + 1), 200);
            return;
        }
        try {
            nav.navigate('Main', {
                screen: 'Chats',
                params: {
                    screen: 'PingAI',
                    params: kind === 'briefing'
                        ? { surface: publicPingSurface(), startWith: 'voice', briefingRequestAt: Date.now() }
                        : { surface: publicPingSurface(), startWith: 'voice', voiceAt: Date.now() },
                },
            });
        } catch { /* navigation not mounted any more */ }
    };
    go(0);
}

export function useVoiceLinks(navigationRef: any) {
    const { user } = useAuth();

    useEffect(() => {
        const handle = (url: string | null) => {
            const kind = voiceLinkKind(url);
            if (kind) openVoiceFromLink(navigationRef, kind);
        };
        void Linking.getInitialURL().then(handle, () => undefined);
        const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
        return () => subscription.remove();
    }, [navigationRef]);

    useEffect(() => {
        if (!user?.id) return;
        setVoiceShortcut();
        supabase
            .from('profiles')
            .select('full_name, assistant_daily_summary, assistant_summary_hour, assistant_summary_minute, assistant_summary_days')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (!data) return;
                syncBriefingAlarm({
                    enabled: data.assistant_daily_summary !== false,
                    hour: data.assistant_summary_hour ?? 8,
                    minute: data.assistant_summary_minute ?? 0,
                    days: Array.isArray(data.assistant_summary_days) ? data.assistant_summary_days : [0, 1, 2, 3, 4, 5, 6],
                    firstName: data.full_name?.trim().split(/\s+/)[0] ?? null,
                });
            }, () => undefined);
    }, [user?.id]);
}
