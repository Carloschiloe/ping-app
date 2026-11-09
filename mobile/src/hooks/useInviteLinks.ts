import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { apiClient } from '../api/client';
import { inviteTokenFromUrl } from '../utils/pingInvitation';
import type { RootStackParamList } from '../navigation/types';

// A tapped invitation can arrive before the person has signed in, or while
// they create their account. The token is kept until they are inside the app,
// then accepted once, and the chat with whoever invited them opens.

const STORAGE_KEY = 'vorian.pendingInvite';

export function useInviteLinks(ready: boolean, nav: NavigationContainerRefWithCurrent<RootStackParamList>) {
    const [pending, setPending] = useState<string | null>(null);

    useEffect(() => {
        const keep = (url: string | null) => {
            const token = inviteTokenFromUrl(url);
            if (!token) return;
            setPending(token);
            void AsyncStorage.setItem(STORAGE_KEY, token).catch(() => undefined);
        };
        void AsyncStorage.getItem(STORAGE_KEY).then((token) => { if (token) setPending((current) => current ?? token); }, () => undefined);
        void Linking.getInitialURL().then(keep, () => undefined);
        const subscription = Linking.addEventListener('url', ({ url }) => keep(url));
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        if (!ready || !pending) return;
        let alive = true;
        const token = pending;
        (async () => {
            try {
                const result = await apiClient.post('/invite-links/accept', { token });
                await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
                if (!alive) return;
                setPending(null);
                const open = () => nav.navigate('Main', {
                    screen: 'Chats',
                    params: { screen: 'Chat', params: { conversationId: result.conversationId, otherUser: result.otherUser } },
                } as any);
                if (nav.isReady()) open(); else setTimeout(open, 600);
            } catch (error: any) {
                // A link that can never work is dropped; a network failure is retried next time.
                const status = error?.status ?? error?.statusCode;
                if (status && status >= 400 && status < 500) {
                    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
                    if (alive) setPending(null);
                    Alert.alert('Invitación', error?.message || 'No se pudo abrir la invitación.');
                }
            }
        })();
        return () => { alive = false; };
    }, [ready, pending, nav]);
}
