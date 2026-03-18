import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { supabaseAdmin } from '../lib/supabaseAdmin';

interface PushMessage {
    to: string | string[];
    title: string;
    body: string;
    data?: any;
    sound?: 'default' | null;
}

const expo = new Expo();

async function clearInvalidToken(token: string) {
    await supabaseAdmin
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('expo_push_token', token);
}

function normalizeMessages(messages: PushMessage | PushMessage[]): ExpoPushMessage[] {
    const normalized = Array.isArray(messages) ? messages : [messages];
    const results: ExpoPushMessage[] = [];

    normalized.forEach((message) => {
        const targets = Array.isArray(message.to) ? message.to : [message.to];
        targets.forEach((token) => {
            if (!Expo.isExpoPushToken(token)) {
                console.warn('[push] Invalid Expo push token skipped');
                return;
            }

            results.push({
                to: token,
                title: message.title,
                body: message.body,
                data: message.data,
                sound: message.sound === undefined ? 'default' : message.sound,
            });
        });
    });

    return results;
}

async function handleTickets(messages: ExpoPushMessage[], tickets: ExpoPushTicket[]) {
    await Promise.all(
        tickets.map(async (ticket, index) => {
            if (ticket.status !== 'error') return;

            const details = (ticket as any).details;
            if (details?.error === 'DeviceNotRegistered') {
                const token = Array.isArray(messages[index].to) ? messages[index].to[0] : messages[index].to;
                if (typeof token === 'string') {
                    await clearInvalidToken(token);
                }
            }
        })
    );
}

export class NotificationService {
    static async sendPushNotifications(messages: PushMessage | PushMessage[]) {
        const preparedMessages = normalizeMessages(messages);
        if (preparedMessages.length === 0) {
            return { data: [], skipped: true };
        }

        const tickets: ExpoPushTicket[] = [];

        try {
            const chunks = expo.chunkPushNotifications(preparedMessages);
            for (const chunk of chunks) {
                const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...chunkTickets);
            }

            await handleTickets(preparedMessages, tickets);
            return { data: tickets };
        } catch (error) {
            console.error('[push] Error sending Expo push notification', error);
            throw error;
        }
    }
}
