import cron from 'node-cron';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { generateMorningSummary, generateWeeklyReview } from './ai.service';
import { sendPushNotification } from './push.service';
import { format } from 'date-fns';
import { isOpenCommitmentStatus, normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { getOrCreateSelfConversationId } from './conversation.service';
import {
    AUTOMATION_DEFAULT_TIMEZONE,
    isMorningRoutineWindow,
    localDateKey,
    localDayName,
    resolveAutomationTimezone,
} from './automationTimezone.service';

let isMorningRoutineRunning = false;
let isWeeklyReviewRunning = false;

async function routineAlreadyDelivered(conversationId: string, routineKey: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('system_event_type', routineKey.startsWith('morning:') ? 'morning_summary' : 'weekly_review')
        .contains('metadata', { routine_key: routineKey })
        .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
}

/**
 * Phase 24: Ping Morning Routine
 * Runs every day at 8:00 AM (server time).
 * For each user with commitments due today, it:
 *  1. Generates a personalized AI morning message.
 *  2. Injects it into the user's personal "Mis Recordatorios" chat.
 *  3. Sends a push notification.
 */

export async function runMorningRoutine(now = new Date()) {
    if (isMorningRoutineRunning) {
        console.warn('[MorningRoutine] Skipped (previous run still in progress).');
        return;
    }
    isMorningRoutineRunning = true;
    const startedAt = Date.now();
    console.log('[MorningRoutine] 🌅 Starting morning routine...');

    try {
        const today = now;
        // Query a UTC envelope, then filter each commitment by the owner's
        // local calendar day below. This avoids using Render's server timezone.
        const startOfDay = new Date(today.getTime() - 36 * 60 * 60 * 1000);
        const endOfDay = new Date(today.getTime() + 36 * 60 * 60 * 1000);

        // 1. Get all open commitments for today with profile info in ONE query (Batching)
        const { data: allCommitments, error: fetchError } = await supabaseAdmin
            .from('commitments')
            .select(`
                title,
                due_at,
                owner_user_id, 
                profiles!inner(full_name, expo_push_token, timezone)
            `)
            // V2: los unicos estados abiertos son proposed/accepted/counter_proposal
            // (pending/in_progress eran legacy, V2 nunca los persiste).
            .in('status', ['proposed', 'accepted', 'counter_proposal'])
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

        // 2. Group commitments by user, keeping only that user's local day.
        const userMap: { 
            [userId: string]: { 
                name: string; 
                pushToken: string | null; 
                timezone: string;
                commitments: string[];
            } 
        } = {};

        for (const row of allCommitments) {
            const userId = row.owner_user_id;
            const profile = row.profiles as any;
            const timezone = resolveAutomationTimezone(profile?.timezone ?? AUTOMATION_DEFAULT_TIMEZONE);
            const dueAt = (row as any).due_at as string | null | undefined;
            if (dueAt && localDateKey(new Date(dueAt), timezone) !== localDateKey(today, timezone)) continue;
            if (!userMap[userId]) {
                userMap[userId] = {
                    name: profile?.full_name || 'Amigo',
                    pushToken: profile?.expo_push_token || null,
                    timezone,
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
                    const dayName = localDayName(today, userData.timezone);
                    const routineKey = `morning:${localDateKey(today, userData.timezone)}`;
                    const selfConversationId = await getOrCreateSelfConversationId(userId);
                    if (await routineAlreadyDelivered(selfConversationId, routineKey)) {
                        console.log(`[MorningRoutine] ↩️ Already delivered to ${userData.name} (${routineKey})`);
                        return;
                    }

                    // Generate AI morning message
                    const aiMessage = await generateMorningSummary(
                        userData.name,
                        dayName,
                        userData.commitments
                    );

                    // V2: todo mensaje requiere conversation_id valido (NOT NULL).
                    // El resumen matutino ahora se inserta en el self-chat real del
                    // usuario en vez de un mensaje "huerfano" con conversation_id null.
                    // Batch database operations for this user
                    const [msgResult] = await Promise.all([
                        // Inject into personal self-messages
                        supabaseAdmin.from('messages').insert({
                            sender_id: null,
                            content: aiMessage,
                            conversation_id: selfConversationId,
                            status: 'sent',
                            system_event_type: 'morning_summary',
                            metadata: { is_morning_summary: true, routine_key: routineKey }
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

        console.log(`[MorningRoutine] ✅ Morning routine completed for ${userIds.length} user(s).`);
    } finally {
        const durationMs = Date.now() - startedAt;
        console.log(`[MorningRoutine] Finished in ${durationMs}ms.`);
        isMorningRoutineRunning = false;
    }
}

/**
 * Phase 27: Weekly Review — every Friday at 6:00 PM
 */
export async function runWeeklyReview() {
    if (isWeeklyReviewRunning) {
        console.warn('[WeeklyReview] Skipped (previous run still in progress).');
        return;
    }
    isWeeklyReviewRunning = true;
    const startedAt = Date.now();
    console.log('[WeeklyReview] 📋 Starting weekly review...');

    try {
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
            if (normalizedStatus === 'resolved') {
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
                    const routineKey = `weekly:${format(now, 'yyyy-MM-dd')}`;
                    const selfConversationId = await getOrCreateSelfConversationId(userId);
                    if (await routineAlreadyDelivered(selfConversationId, routineKey)) {
                        console.log(`[WeeklyReview] ↩️ Already delivered to ${data.name} (${routineKey})`);
                        return;
                    }

                    const aiMessage = await generateWeeklyReview(data.name, data.completed, data.pending.length, data.pending);

                    // V2: mismo criterio que la rutina matutina — se usa el self-chat
                    // real del usuario en vez de conversation_id null.
                    const [msgResult] = await Promise.all([
                        supabaseAdmin.from('messages').insert({
                            sender_id: null,
                            content: aiMessage,
                            conversation_id: selfConversationId,
                            status: 'sent',
                            system_event_type: 'weekly_review',
                            metadata: { is_weekly_review: true, routine_key: routineKey }
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

        console.log(`[WeeklyReview] ✅ Weekly review completed for ${userIds.length} user(s).`);
    } finally {
        const durationMs = Date.now() - startedAt;
        console.log(`[WeeklyReview] Finished in ${durationMs}ms.`);
        isWeeklyReviewRunning = false;
    }
}

let morningScheduleSet = false;
let weeklyScheduleSet = false;

export function startMorningRoutineCron() {
    if (!morningScheduleSet) {
        cron.schedule('*/5 * * * *', () => {
            runMorningRoutineForEligibleUsers().catch(console.error);
        });
        morningScheduleSet = true;
        console.log('[MorningRoutine] 📅 Polling every 5 minutes for each user\'s local 08:00 window.');
    }

    if (!weeklyScheduleSet) {
        cron.schedule('0 18 * * 5', () => {
            runWeeklyReview().catch(console.error);
        }, {
            timezone: 'America/Santiago'
        });
        weeklyScheduleSet = true;
        console.log('[WeeklyReview] 📋 Cron job scheduled for Fridays at 6:00 PM (Santiago).');
    }
}

async function runMorningRoutineForEligibleUsers(): Promise<void> {
    const now = new Date();
    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('timezone');

    if (error) {
        // Until the profile-timezone migration is applied, fail closed and do
        // not send any background notification.
        console.error('[MorningRoutine] Could not read profile timezones; skipping tick:', error.message);
        return;
    }

    const hasEligibleUser = (profiles || []).some((profile: any) =>
        isMorningRoutineWindow(now, resolveAutomationTimezone(profile?.timezone))
    );
    if (!hasEligibleUser) return;
    await runMorningRoutine(now);
}
