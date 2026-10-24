import { Expo } from 'expo-server-sdk';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
    claimNotificationDelivery,
    completeNotificationDelivery,
    failNotificationDelivery,
} from './notificationDeliveryLedger.service';

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

const fetchPushTokens = async (userIds: string[]) => {
    if (userIds.length === 0) return new Map<string, string>();

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', userIds);

    if (error) {
        console.error('[Push] Failed to fetch push tokens:', error);
        return new Map<string, string>();
    }

    const tokenMap = new Map<string, string>();
    for (const profile of data || []) {
        if (profile?.expo_push_token && Expo.isExpoPushToken(profile.expo_push_token)) {
            tokenMap.set(profile.id, profile.expo_push_token);
        }
    }
    return tokenMap;
};

const sendPushBatch = async (commitments: any[], window: NotificationWindow) => {
    const messages = [];
    const uniqueUserIds = Array.from(new Set(commitments.map((c) => c.owner_user_id).filter(Boolean)));
    const tokenMap = await fetchPushTokens(uniqueUserIds);
    const claimedDeliveries: Array<{ deliveryKey: string }> = [];

    for (const c of commitments) {
        const pushToken = tokenMap.get(c.owner_user_id);
        if (!pushToken || !c?.id || !c?.owner_user_id || !c?.due_at) continue;

        const claim = await claimNotificationDelivery({
            ownerUserId: c.owner_user_id,
            commitmentId: c.id,
            notificationKind: 'commitment_due',
            windowLabel: window.label,
            dueAt: c.due_at,
        });
        if (!claim.claimed) continue;

        claimedDeliveries.push({ deliveryKey: claim.deliveryKey });
        messages.push({
            to: pushToken,
            sound: 'default' as const,
            title: `${window.title}: ${c.title}`,
            body: c.title,
            data: { commitmentId: c.id },
        });
    }

    if (messages.length === 0) return;

    try {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            await expo.sendPushNotificationsAsync(chunk);
        }
        await Promise.all(claimedDeliveries.map(({ deliveryKey }) => completeNotificationDelivery(deliveryKey)));
    } catch (err) {
        await Promise.all(claimedDeliveries.map(({ deliveryKey }) =>
            failNotificationDelivery(deliveryKey, err instanceof Error ? err.message : 'push_send_failed')
                .catch((ledgerError) => console.error('[Push] Failed to record delivery failure:', ledgerError))));
        throw err;
    }
};

// Cron job — runs every minute
export const checkDueCommitments = async () => {
    const startedAt = Date.now();
    let totalCommitments = 0;
    try {
        const now = new Date();

        for (const window of NOTIFICATION_WINDOWS) {
            // The window target: the moment that is `offsetMinutes` from now
            const targetTime = new Date(now.getTime() + window.offsetMinutes * 60 * 1000);
            const startOfMinute = new Date(targetTime);
            startOfMinute.setSeconds(0, 0);
            const endOfMinute = new Date(targetTime);
            endOfMinute.setSeconds(59, 999);

            // Find accepted commitments due in this window
            const { data: commitments, error } = await supabaseAdmin
                .from('commitments')
                .select('id, title, owner_user_id, due_at')
                .in('status', ['accepted', 'in_progress'])
                .gte('due_at', startOfMinute.toISOString())
                .lte('due_at', endOfMinute.toISOString());

            if (error) throw error;
            if (!commitments || commitments.length === 0) continue;

            totalCommitments += commitments.length;
            console.info(`🔔 [${window.label}] Sending ${commitments.length} reminder(s)`);
            await sendPushBatch(commitments, window);

        }
    } catch (err) {
        console.error('[Push] checkDueCommitments error:', err);
    } finally {
        const durationMs = Date.now() - startedAt;
        console.info(`[Push] checkDueCommitments finished in ${durationMs}ms (commitments: ${totalCommitments}).`);
    }
};

/**
 * Phase 24: Standalone helper to send a single push notification to a token.
 */
export const sendPushNotification = async (pushToken: string, title: string, body: string) => {
    if (!Expo.isExpoPushToken(pushToken)) {
        console.warn('[Push] Invalid push token rejected');
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
