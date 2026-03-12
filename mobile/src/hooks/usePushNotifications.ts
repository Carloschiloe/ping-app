import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// Show alerts even when app is in foreground
if (Platform.OS !== 'web') {
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    } catch (e) { /* Expo Go safe */ }
}

/** Navigate to IncomingCall screen from anywhere (root-level screen) */
const navigateToIncomingCall = (nav: any, data: any) => {
    if (!nav || !data?.conversationId) return;
    try {
        nav.navigate('IncomingCall', {
            conversationId: data.conversationId,
            callType: data.callType || 'voice',
            callerName: data.callerName || 'Alguien',
        });
    } catch (e) {
        console.warn('[CallNav] navigate failed:', e);
    }
};

export const usePushNotifications = (navigationRef?: any) => {
    const { user } = useAuth();
    const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
    const responseListener = useRef<Notifications.Subscription | undefined>(undefined);
    const realtimeRef = useRef<any>(null);

    useEffect(() => {
        if (!user) return;

        // Register push token
        registerForPushNotificationsAsync().then(token => {
            if (token) {
                apiClient.post('/push/token', { token }).catch(err =>
                    console.warn('[Push] Could not save token:', err?.message)
                );
            }
        });

        // ── Notification listeners ──────────────────────────────
        try {
            // Foreground: notification received while app is open → navigate immediately
            notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
                const data = notification.request.content.data as any;
                console.log('[Push] Received:', data?.type);
                if (data?.type === 'incoming_call') {
                    const nav = navigationRef?.current ?? navigationRef;
                    navigateToIncomingCall(nav, data);
                }
            });

            // Background/killed: user tapped the notification banner
            responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
                const data = response.notification.request.content.data as any;
                console.log('[Push] Tapped:', data?.type);
                if (data?.type === 'incoming_call') {
                    const nav = navigationRef?.current ?? navigationRef;
                    navigateToIncomingCall(nav, data);
                }
            });
        } catch (e) { /* Expo Go safe */ }

        // ── Supabase Realtime primary signal (works when app is open) ────
        // Each user subscribes to their own personal call channel
        const callChannel = supabase.channel(`calls:user:${user.id}`, {
            config: { broadcast: { self: false } },
        });

        callChannel
            .on('broadcast', { event: 'incoming_call' }, ({ payload }: any) => {
                console.log('[Realtime] Incoming call:', payload);
                const nav = navigationRef?.current ?? navigationRef;
                navigateToIncomingCall(nav, payload);
            })
            .subscribe(status => {
                console.log('[Realtime] Call channel status:', status);
            });

        realtimeRef.current = callChannel;

        return () => {
            try {
                notificationListener.current?.remove();
                responseListener.current?.remove();
                realtimeRef.current?.unsubscribe();
            } catch (e) { /* ignore */ }
        };
    }, [user]);
};

async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (Platform.OS === 'android') {
        try {
            await Notifications.setNotificationChannelAsync('calls', {
                name: 'Llamadas',
                importance: Notifications.AndroidImportance.MAX,
                sound: 'default',
                vibrationPattern: [0, 500, 200, 500],
                enableLights: true,
            });
        } catch (e) { /* ignore */ }
    }

    if (!Device.isDevice) {
        console.log('[Push] Physical device required');
        return undefined;
    }

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') return undefined;

        const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            '0baf032d-de1a-49e7-9181-a5897927fb11';

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('[Push] Token:', token);
        return token;
    } catch (e) {
        console.warn('[Push] Registration error:', e);
        return undefined;
    }
}
