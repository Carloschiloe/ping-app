import { Expo } from 'expo-server-sdk';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const expo = new Expo();

interface NotificationWindow {
    label: string;
    title: string;
    offsetMinutes: number; // minutes before due_at to notify
}

const NOTIFICATION_WINDOWS: NotificationWindow[] = [
    { label: '30min', title: '⏰ En 30 minutos', offsetMinutes: 30 },
    { label: '5min', title: '🚨 En 5 minutos', offsetMinutes: 5 },
    { label: 'exact', title: '🔔 Ahora', offsetMinutes: 0 },
];

const sendPushBatch = async (commitments: any[], windowTitle: string) => {
    const messages = [];

    for (const c of commitments) {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('expo_push_token')
            .eq('id', c.owner_user_id)
            .single();

        const pushToken = profile?.expo_push_token;
        if (pushToken && Expo.isExpoPushToken(pushToken)) {
            messages.push({
                to: pushToken,
                sound: 'default' as const,
                title: `${windowTitle}: ${c.title}`,
                body: c.title,
                data: { commitmentId: c.id },
            });
        }
    }

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
        try {
            await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
            console.error('[Push] Error sending chunk:', err);
        }
    }
};

// Cron job — runs every minute
export const checkDueCommitments = async () => {
    try {
        const now = new Date();

        for (const window of NOTIFICATION_WINDOWS) {
            // The window target: the moment that is `offsetMinutes` from now
            const targetTime = new Date(now.getTime() + window.offsetMinutes * 60 * 1000);
            const startOfMinute = new Date(targetTime);
            startOfMinute.setSeconds(0, 0);
            const endOfMinute = new Date(targetTime);
            endOfMinute.setSeconds(59, 999);

            // Find pending commitments due in this window
            const { data: commitments, error } = await supabaseAdmin
                .from('commitments')
                .select('*')
                .eq('status', 'pending')
                .gte('due_at', startOfMinute.toISOString())
                .lte('due_at', endOfMinute.toISOString());

            if (error) throw error;
            if (!commitments || commitments.length === 0) continue;

            console.log(`🔔 [${window.label}] Sending ${commitments.length} reminder(s)`);
            await sendPushBatch(commitments, window.title);

            // Only mark as done on the exact-time notification
            if (window.offsetMinutes === 0) {
                for (const c of commitments) {
                    await supabaseAdmin
                        .from('commitments')
                        .update({ status: 'done' })
                        .eq('id', c.id);
                }
            }
        }
    } catch (err) {
        console.error('[Push] checkDueCommitments error:', err);
    }
};

/**
 * Phase 24: Standalone helper to send a single push notification to a token.
 */
export const sendPushNotification = async (pushToken: string, title: string, body: string) => {
    if (!Expo.isExpoPushToken(pushToken)) {
        console.warn('[Push] Invalid push token:', pushToken);
        return;
    }
    try {
        await expo.sendPushNotificationsAsync([{
            to: pushToken,
            sound: 'default',
            title,
            body,
        }]);
    } catch (err) {
        console.error('[Push] sendPushNotification error:', err);
    }
};
