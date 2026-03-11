import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Constants from 'expo-constants';

// Only set handler if notifications are supported
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
    } catch (e) {
        // Expo Go may not fully support this — safe to ignore
    }
}

export const usePushNotifications = (navigationRef?: any) => {
    const { user } = useAuth();
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
    const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
    const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

    useEffect(() => {
        if (!user) return;

        registerForPushNotificationsAsync().then(token => {
            setExpoPushToken(token);
            if (token) {
                apiClient.post('/push/token', { token }).catch(err => {
                    console.warn('Could not save push token:', err?.message);
                });
            }
        });

        try {
            notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
                console.log('Notification received:', notification);
            });
            responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
                const data = response.notification.request.content.data as any;
                console.log('Notification tapped:', data);

                // Handle incoming call: navigate to CallScreen
                if (data?.type === 'incoming_call' && data?.conversationId) {
                    const nav = navigationRef?.current || navigationRef;
                    if (nav?.navigate) {
                        nav.navigate('Call', {
                            conversationId: data.conversationId,
                            isVideo: data.callType === 'video',
                            remoteUser: { full_name: data.callerName },
                        });
                    }
                }
            });
        } catch (e) {
            // Expo Go partial support — safe to ignore
        }

        return () => {
            try {
                notificationListener.current?.remove();
                responseListener.current?.remove();
            } catch (e) { /* ignore */ }
        };
    }, [user]);

    return { expoPushToken };
};

async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (Platform.OS === 'android') {
        try {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
            });
        } catch (e) { /* ignore */ }
    }

    if (!Device.isDevice) {
        console.log('Push notifications require a physical device.');
        return undefined;
    }

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Push notification permission denied.');
            return undefined;
        }

        const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            '0baf032d-de1a-49e7-9181-a5897927fb11';

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        return token;
    } catch (e) {
        console.warn('Could not register for push notifications:', e);
        return undefined;
    }
}
