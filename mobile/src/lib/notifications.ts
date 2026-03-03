import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function scheduleCommitmentReminder(commitment: { id: string, title: string, due_at: string }) {
    if (Platform.OS === 'web') return;

    const triggerDate = new Date(commitment.due_at);
    // Schedule 30 minutes before
    const reminderDate = new Date(triggerDate.getTime() - 30 * 60000);

    // If the reminder time is in the past, don't schedule
    if (reminderDate.getTime() <= Date.now()) {
        return;
    }

    try {
        await Notifications.scheduleNotificationAsync({
            identifier: commitment.id,
            content: {
                title: '📌 Recordatorio de Compromiso',
                body: `En 30 minutos: "${commitment.title}"`,
                data: { commitmentId: commitment.id, screen: 'Hoy' },
                sound: true,
            },
            trigger: { date: reminderDate } as any,
        });
        console.log(`[Notifications] Scheduled reminder for ${commitment.id} at ${reminderDate.toISOString()}`);
    } catch (error) {
        console.warn('[Notifications] Error scheduling:', error);
    }
}

export async function cancelCommitmentReminder(id: string) {
    if (Platform.OS === 'web') return;
    try {
        await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
        /* ignore */
    }
}
