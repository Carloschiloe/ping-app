import axios from 'axios';

interface PushMessage {
    to: string | string[];
    title: string;
    body: string;
    data?: any;
    sound?: 'default' | null;
}

export class NotificationService {
    private static EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

    /**
     * Send a single or multiple push notifications via Expo
     */
    static async sendPushNotifications(messages: PushMessage | PushMessage[]) {
        try {
            const response = await axios.post(this.EXPO_PUSH_URL, messages, {
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });

            return response.data;
        } catch (error) {
            console.error('Error sending Expo push notification:', error);
            throw error;
        }
    }
}
