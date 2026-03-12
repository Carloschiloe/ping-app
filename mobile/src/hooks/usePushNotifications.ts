import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Constants from 'expo-constants';

// Show alert + sound always, even while app is in foreground
if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

const doNavigate = (navigationRef: any, data: any) => {
    if (!data?.conversationId) return;

    const nav = navigationRef?.current ?? navigationRef;
    if (!nav) {
        console.warn('[CallNav] navigationRef is null');
        return;
    }

    console.log('[CallNav] Navigating to IncomingCall with:', data.conversationId);

    // Small delay to ensure navigator is mounted
    setTimeout(() => {
        try {
            nav.navigate('IncomingCall', {
                conversationId: data.conversationId,
                callType: data.callType || 'voice',
                callerName: data.callerName || 'Alguien',
                callerAvatar: data.callerAvatar || null,
                callId: data.callId || null,
            });
        } catch (e: any) {
            console.error('[CallNav] navigate error:', e.message);
        }
    }, 300);
};

export const usePushNotifications = (navigationRef?: any) => {
    const { user } = useAuth();
    const notifRef = useRef<Notifications.Subscription | undefined>(undefined);
    const responseRef = useRef<Notifications.Subscription | undefined>(undefined);

    useEffect(() => {
        if (!user) return;

        // Register push token
        registerPushToken().then(token => {
            if (token) {
                console.log('[Push] Registered token:', token.slice(0, 30) + '...');
                apiClient.post('/push/token', { token }).catch(e =>
                    console.warn('[Push] Token save failed:', e?.message)
                );
            }
        });

        // FOREGROUND: navigate immediately when call notification arrives
        notifRef.current = Notifications.addNotificationReceivedListener(notification => {
            const data = notification.request.content.data as any;
            console.log('[Push] Foreground notification type:', data?.type);
            if (data?.type === 'incoming_call') {
                doNavigate(navigationRef, data);
            }
        });

        // BACKGROUND/KILLED: user tapped the notification banner
        responseRef.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as any;
            console.log('[Push] Notification tapped, type:', data?.type);
            if (data?.type === 'incoming_call') {
                doNavigate(navigationRef, data);
            }
        });

        return () => {
            notifRef.current?.remove();
            responseRef.current?.remove();
        };
    }, [user?.id]);
};

async function registerPushToken(): Promise<string | undefined> {
    if (!Device.isDevice) return undefined;

    if (Platform.OS === 'android') {
        // High-priority channel for calls
        await Notifications.setNotificationChannelAsync('calls', {
            name: 'Llamadas entrantes',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
            vibrationPattern: [0, 500, 200, 500, 200, 500],
            enableLights: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        }).catch(() => { });
        // Keep default channel too
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.HIGH,
        }).catch(() => { });
    }

    // Configure Action Categories for Incoming Calls (iOS & Android)
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
        }
    ]).catch(() => { });

    const { status: existing } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined' as const }));
    const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync().catch(() => ({ status: 'denied' as const }))).status;

    if (finalStatus !== 'granted') {
        console.warn('[Push] Permission denied');
        return undefined;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? '0baf032d-de1a-49e7-9181-a5897927fb11';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
}
