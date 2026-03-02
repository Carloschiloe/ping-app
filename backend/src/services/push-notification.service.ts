import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export const schedulePushNotification = async (
    pushToken: string,
    title: string,
    body: string,
    data: any = {}
) => {
    if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        return;
    }

    const messages = [{
        to: pushToken,
        sound: 'default' as 'default',
        title,
        body,
        data,
    }];

    try {
        const ticketChunk = await expo.sendPushNotificationsAsync(messages);
        console.log('Push notification scheduled (ticket):', ticketChunk);
        // In a real production environment, we should save tickets to check receipts later
    } catch (error) {
        console.error('Error sending push notification', error);
    }
};
