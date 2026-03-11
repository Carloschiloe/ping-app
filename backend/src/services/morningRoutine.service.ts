import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { generateMorningSummary, generateWeeklyReview } from './ai.service';
import { sendPushNotification } from './push.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Phase 24: Ping Morning Routine
 * Runs every day at 8:00 AM (server time).
 * For each user with commitments due today, it:
 *  1. Generates a personalized AI morning message.
 *  2. Injects it into the user's personal "Mis Recordatorios" chat.
 *  3. Sends a push notification.
 */

async function runMorningRoutine() {
    console.log('[MorningRoutine] 🌅 Starting morning routine...');

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Get all users who have pending commitments due today
    const { data: users, error: usersError } = await supabaseAdmin
        .from('commitments')
        .select('owner_user_id, profiles!inner(full_name, expo_push_token)')
        .eq('status', 'pending')
        .gte('due_at', startOfDay.toISOString())
        .lte('due_at', endOfDay.toISOString());

    if (usersError) {
        console.error('[MorningRoutine] Error fetching users:', usersError);
        return;
    }

    // Group commitments by user
    const userMap: { [userId: string]: { name: string; pushToken: string | null; commitments: string[] } } = {};
    for (const row of users || []) {
        const userId = row.owner_user_id;
        if (!userMap[userId]) {
            const profile = row.profiles as any;
            userMap[userId] = {
                name: profile?.full_name || 'Amigo',
                pushToken: profile?.expo_push_token || null,
                commitments: []
            };
        }
    }

    // 2. For each user, get their commitments titles
    for (const userId of Object.keys(userMap)) {
        const { data: commitments } = await supabaseAdmin
            .from('commitments')
            .select('title')
            .eq('owner_user_id', userId)
            .eq('status', 'pending')
            .gte('due_at', startOfDay.toISOString())
            .lte('due_at', endOfDay.toISOString())
            .limit(5);

        if (!commitments || commitments.length === 0) continue;
        userMap[userId].commitments = commitments.map((c: any) => c.title);
    }

    // 3. For each user, generate the AI message and inject it
    for (const [userId, userData] of Object.entries(userMap)) {
        if (userData.commitments.length === 0) continue;

        try {
            const dayName = format(today, 'EEEE d \'de\' MMMM', { locale: es });

            // Generate AI morning message
            const aiMessage = await generateMorningSummary(
                userData.name,
                dayName,
                userData.commitments
            );

            // Inject into personal self-messages (conversation_id null = Mis Recordatorios)
            await supabaseAdmin.from('messages').insert({
                sender_id: null,
                user_id: userId,
                text: aiMessage,
                conversation_id: null,
                status: 'sent',
                meta: { is_morning_summary: true }
            });

            // 4. Send Push Notification
            if (userData.pushToken) {
                await sendPushNotification(
                    userData.pushToken,
                    '🌅 Buenos días desde Ping',
                    `Tienes ${userData.commitments.length} compromiso(s) para hoy. Toca para ver tu resumen.`
                );
            }

            console.log(`[MorningRoutine] ✅ Sent morning summary to ${userData.name} (${userId})`);
        } catch (err) {
            console.error(`[MorningRoutine] ❌ Error for user ${userId}:`, err);
        }
    }

    console.log('[MorningRoutine] ✅ Morning routine completed.');
}

/**
 * Phase 27: Weekly Review — every Friday at 6:00 PM
 */
async function runWeeklyReview() {
    console.log('[WeeklyReview] 📋 Starting weekly review...');

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all unique users with commitments this week
    const { data: allCommitments } = await supabaseAdmin
        .from('commitments')
        .select('owner_user_id, status, title, profiles!inner(full_name, expo_push_token)')
        .gte('created_at', weekAgo.toISOString())
        .lte('created_at', now.toISOString());

    if (!allCommitments || allCommitments.length === 0) {
        console.log('[WeeklyReview] No commitments this week.');
        return;
    }

    // Group by user
    const userMap: { [userId: string]: { name: string; pushToken: string | null; completed: number; pending: string[] } } = {};
    for (const c of allCommitments) {
        const userId = c.owner_user_id;
        if (!userMap[userId]) {
            const profile = c.profiles as any;
            userMap[userId] = { name: profile?.full_name || 'Amigo', pushToken: profile?.expo_push_token || null, completed: 0, pending: [] };
        }
        if (c.status === 'done') {
            userMap[userId].completed++;
        } else {
            userMap[userId].pending.push(c.title);
        }
    }

    for (const [userId, data] of Object.entries(userMap)) {
        try {
            const aiMessage = await generateWeeklyReview(data.name, data.completed, data.pending.length, data.pending);
            await supabaseAdmin.from('messages').insert({
                sender_id: null, user_id: userId, text: aiMessage, conversation_id: null, status: 'sent',
                meta: { is_weekly_review: true }
            });
            if (data.pushToken) {
                await sendPushNotification(data.pushToken, '📋 Tu resumen semanal de Ping', `Esta semana: ${data.completed} completado(s), ${data.pending.length} pendiente(s).`);
            }
            console.log(`[WeeklyReview] ✅ Sent weekly review to ${data.name}`);
        } catch (err) {
            console.error(`[WeeklyReview] ❌ Error for ${userId}:`, err);
        }
    }

    console.log('[WeeklyReview] ✅ Weekly review completed.');
}

export function startMorningRoutineCron() {
    // Run every day at 8:00 AM (server/UTC time - adjust as needed)
    cron.schedule('0 8 * * *', () => {
        runMorningRoutine().catch(console.error);
    }, {
        timezone: 'America/Santiago' // Chilean timezone
    });
    console.log('[MorningRoutine] 📅 Cron job scheduled for 8:00 AM (Santiago).');

    // Phase 27: Weekly review every Friday at 6:00 PM (Santiago)
    cron.schedule('0 18 * * 5', () => {
        runWeeklyReview().catch(console.error);
    }, {
        timezone: 'America/Santiago'
    });
    console.log('[WeeklyReview] 📋 Cron job scheduled for Fridays at 6:00 PM (Santiago).');
}
