import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { generateMorningSummary, generateWeeklyReview } from './ai.service';
import { sendPushNotification } from './push.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { isOpenCommitmentStatus, normalizeCommitmentStatus } from '../utils/commitmentStatus';

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

    // 1. Get all open commitments for today with profile info in ONE query (Batching)
    const { data: allCommitments, error: fetchError } = await supabaseAdmin
        .from('commitments')
        .select(`
            title, 
            owner_user_id, 
            profiles!inner(full_name, expo_push_token)
        `)
        .in('status', ['proposed', 'pending', 'accepted', 'in_progress', 'counter_proposal'])
        .gte('due_at', startOfDay.toISOString())
        .lte('due_at', endOfDay.toISOString());

    if (fetchError) {
        console.error('[MorningRoutine] Error fetching commitments:', fetchError);
        return;
    }

    if (!allCommitments || allCommitments.length === 0) {
        console.log('[MorningRoutine] No commitments for today.');
        return;
    }

    // 2. Group commitments by user in memory
    const userMap: { 
        [userId: string]: { 
            name: string; 
            pushToken: string | null; 
            commitments: string[] 
        } 
    } = {};

    for (const row of allCommitments) {
        const userId = row.owner_user_id;
        if (!userMap[userId]) {
            const profile = row.profiles as any;
            userMap[userId] = {
                name: profile?.full_name || 'Amigo',
                pushToken: profile?.expo_push_token || null,
                commitments: []
            };
        }
        if (userMap[userId].commitments.length < 5) {
            userMap[userId].commitments.push(row.title);
        }
    }

    // 3. Process users in parallel with a concurrency limit (Chunking)
    const userIds = Object.keys(userMap);
    const CHUNK_SIZE = 5; // Process 5 users at a time

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (userId) => {
            const userData = userMap[userId];
            try {
                const dayName = format(today, 'EEEE d \'de\' MMMM', { locale: es });

                // Generate AI morning message
                const aiMessage = await generateMorningSummary(
                    userData.name,
                    dayName,
                    userData.commitments
                );

                // Batch database operations for this user
                const [msgResult, pushResult] = await Promise.all([
                    // Inject into personal self-messages
                    supabaseAdmin.from('messages').insert({
                        sender_id: null,
                        user_id: userId,
                        text: aiMessage,
                        conversation_id: null,
                        status: 'sent',
                        meta: { is_morning_summary: true }
                    }),
                    // Send Push Notification if token exists
                    userData.pushToken ? sendPushNotification(
                        userData.pushToken,
                        '🌅 Buenos días desde Ping',
                        `Tienes ${userData.commitments.length} compromiso(s) para hoy. Toca para ver tu resumen.`
                    ) : Promise.resolve(null)
                ]);

                if (msgResult.error) throw msgResult.error;
                
                console.log(`[MorningRoutine] ✅ Sent morning summary to ${userData.name} (${userId})`);
            } catch (err) {
                console.error(`[MorningRoutine] ❌ Error for user ${userId}:`, err);
            }
        }));
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

    // Get all commitments for the week with profile info (Batch query)
    const { data: allCommitments, error: fetchError } = await supabaseAdmin
        .from('commitments')
        .select('owner_user_id, status, title, profiles!inner(full_name, expo_push_token)')
        .gte('created_at', weekAgo.toISOString())
        .lte('created_at', now.toISOString());

    if (fetchError) {
        console.error('[WeeklyReview] Error fetching commitments:', fetchError);
        return;
    }

    if (!allCommitments || allCommitments.length === 0) {
        console.log('[WeeklyReview] No commitments this week.');
        return;
    }

    // Group by user
    const userMap: { 
        [userId: string]: { 
            name: string; 
            pushToken: string | null; 
            completed: number; 
            pending: string[] 
        } 
    } = {};

    for (const c of allCommitments) {
        const userId = c.owner_user_id;
        if (!userMap[userId]) {
            const profile = c.profiles as any;
            userMap[userId] = { 
                name: profile?.full_name || 'Amigo', 
                pushToken: profile?.expo_push_token || null, 
                completed: 0, 
                pending: [] 
            };
        }
        const normalizedStatus = normalizeCommitmentStatus(c.status);
        if (normalizedStatus === 'completed') {
            userMap[userId].completed++;
        } else if (isOpenCommitmentStatus(normalizedStatus)) {
            if (userMap[userId].pending.length < 10) {
                userMap[userId].pending.push(c.title);
            }
        }
    }

    // Process users in parallel batches
    const userIds = Object.keys(userMap);
    const CHUNK_SIZE = 5;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (userId) => {
            const data = userMap[userId];
            try {
                const aiMessage = await generateWeeklyReview(data.name, data.completed, data.pending.length, data.pending);
                
                const [msgResult] = await Promise.all([
                    supabaseAdmin.from('messages').insert({
                        sender_id: null, 
                        user_id: userId, 
                        text: aiMessage, 
                        conversation_id: null, 
                        status: 'sent',
                        meta: { is_weekly_review: true }
                    }),
                    data.pushToken ? sendPushNotification(
                        data.pushToken, 
                        '📋 Tu resumen semanal de Ping', 
                        `Esta semana: ${data.completed} completado(s), ${data.pending.length} pendiente(s).`
                    ) : Promise.resolve(null)
                ]);

                if (msgResult.error) throw msgResult.error;

                console.log(`[WeeklyReview] ✅ Sent weekly review to ${data.name}`);
            } catch (err) {
                console.error(`[WeeklyReview] ❌ Error for ${userId}:`, err);
            }
        }));
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
