import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

function isExpoGo() {
    return Constants.appOwnership === 'expo';
}

const doNavigate = (navigationRef: any, data: any) => {
    if (!data?.conversationId) return;

    const nav = navigationRef?.current ?? navigationRef;
    if (!nav) return;

    setTimeout(() => {
        try {
            nav.navigate('IncomingCall', {
                conversationId: data.conversationId,
                callType: data.callType || 'voice',
                callerName: data.callerName || 'Alguien',
                callerAvatar: data.callerAvatar || null,
                callId: data.callId || null,
            });
        } catch {
            // Navigation may no longer be mounted.
        }
    }, 300);
};

export const usePushNotifications = (navigationRef?: any) => {
    const { user } = useAuth();
    const subscriptions = useRef<any[]>([]);
    const lastIncomingCallId = useRef<string | null>(null);

    useEffect(() => {
        let active = true;
        if (!user) return;

        const handleIncomingCall = (data: any) => {
            const dedupeId = data?.callId || `${data?.conversationId}:${data?.callType}`;
            if (dedupeId && lastIncomingCallId.current === dedupeId) return;
            lastIncomingCallId.current = dedupeId;
            doNavigate(navigationRef, data);
        };

        // Foreground calls must work in Expo Go too. Supabase Realtime is the
        // in-app signal; remote push is an additional capability for native builds.
        const realtimeChannel = supabase
            .channel(`calls:user:${user.id}`)
            .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
                handleIncomingCall(payload);
            })
            .subscribe();

        const configure = async () => {
            // Expo Go SDK 53+ cannot register remote Android push tokens.
            // Skipping the native module here avoids a red error screen while
            // preserving push registration in development/internal builds.
            if (!user || Platform.OS === 'web' || isExpoGo()) return;

            const Notifications = await import('expo-notifications');
            if (!active) return;

            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: false,
                    shouldShowBanner: true,
                    shouldShowList: true,
                }),
            });

            const token = await registerPushToken(Notifications);
            if (!active) return;
            if (token) {
                apiClient.post('/push/token', { token }).catch((error) =>
                    console.warn('[Push] Token save failed', {
                        message: error instanceof Error ? error.message : 'unknown',
                    })
                );
            }

            subscriptions.current = [
                Notifications.addNotificationReceivedListener((notification) => {
                    const data = notification.request.content.data as any;
                    if (data?.type === 'incoming_call') handleIncomingCall(data);
                }),
                Notifications.addNotificationResponseReceivedListener((response) => {
                    const data = response.notification.request.content.data as any;
                    if (data?.type === 'incoming_call') handleIncomingCall(data);
                }),
            ];
        };

        configure().catch((error) => {
            console.warn('[Push] Configuration unavailable', {
                message: error instanceof Error ? error.message : 'unknown',
            });
        });

        return () => {
            active = false;
            supabase.removeChannel(realtimeChannel);
            subscriptions.current.forEach((subscription) => subscription?.remove?.());
            subscriptions.current = [];
        };
    }, [navigationRef, user]);
};

async function registerPushToken(
    Notifications: typeof import('expo-notifications')
): Promise<string | undefined> {
    if (!Device.isDevice) return undefined;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('calls', {
            name: 'Llamadas entrantes',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
            vibrationPattern: [0, 500, 200, 500, 200, 500],
            enableLights: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        await Notifications.setNotificationChannelAsync('default', {
            name: 'General',
            importance: Notifications.AndroidImportance.HIGH,
        });
    }

    await Notifications.setNotificationCategoryAsync('incoming_call', [
        {
            identifier: 'accept',
            buttonTitle: 'Contestar',
            options: { opensAppToForeground: true },
        },
        {
            identifier: 'reject',
            buttonTitle: 'Rechazar',
            options: { isDestructive: true, opensAppToForeground: false },
        },
    ]);

    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') return undefined;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
        ?? '0baf032d-de1a-49e7-9181-a5897927fb11';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
}
