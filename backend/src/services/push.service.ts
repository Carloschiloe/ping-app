import { Expo } from 'expo-server-sdk';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const expo = new Expo();

export const sendPushNotifications = async (commitments: any[]) => {
    const messages = [];

    for (let c of commitments) {
        // Fetch user profile push token
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
                title: '📌 PING - Recordatorio',
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
        } catch (error) {
            console.error('Error sending push chunk:', error);
        }
    }
};

// Check for commitments due exactly down to the minute
export const checkDueCommitments = async () => {
    try {
        const now = new Date();
        const startOfMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0);
        const endOfMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 59);

        const { data: pendingCommitments, error } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('status', 'pending')
            .gte('due_at', startOfMinute.toISOString())
            .lte('due_at', endOfMinute.toISOString());

        if (error) throw error;

        if (pendingCommitments && pendingCommitments.length > 0) {
            console.log(`🔔 Found ${pendingCommitments.length} commitments due now. Sending pushes...`);
            await sendPushNotifications(pendingCommitments);

            // Mark as done after sending
            for (let c of pendingCommitments) {
                await supabaseAdmin.from('commitments').update({ status: 'done' }).eq('id', c.id);
            }
        }
    } catch (err) {
        console.error('Error in checkDueCommitments cron:', err);
    }
};
