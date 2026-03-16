import { supabaseAdmin } from '../lib/supabaseAdmin';
import { insertSystemMessage } from './message.service';

const getTodayDate = () => new Date().toISOString().slice(0, 10);

async function assertParticipant(userId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        throw new Error('Not a participant in this conversation');
    }
}

const OPERATION_REACTION_EMOJIS = {
    acknowledged: '👌',
    arrived: '📍',
    completed: '✅',
} as const;

async function addOperationReaction(messageId: string | null | undefined, userId: string, action: 'acknowledged' | 'arrived' | 'completed') {
    if (!messageId) return;

    const emoji = OPERATION_REACTION_EMOJIS[action];

    const { data: existing } = await supabaseAdmin
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

    if (existing?.id) return;

    await supabaseAdmin.from('message_reactions').insert({
        message_id: messageId,
        user_id: userId,
        emoji,
    });
}

async function getUserDisplayName(userId: string) {
    const { data } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();

    return data?.full_name || data?.email?.split('@')[0] || 'Alguien';
}

async function getOperationFocus(userId: string, conversationId: string) {
    const { data } = await supabaseAdmin
        .from('conversation_operation_focuses')
        .select('id, conversation_id, user_id, commitment_id, created_at, updated_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    return data || null;
}

async function getOperationProgress(commitmentId: string, userId: string) {
    const { data } = await supabaseAdmin
        .from('commitment_operation_progress')
        .select('*')
        .eq('commitment_id', commitmentId)
        .eq('user_id', userId)
        .maybeSingle();

    return data || null;
}

async function getTeamProgressPreview(conversationId: string) {
    const { data: focuses } = await supabaseAdmin
        .from('conversation_operation_focuses')
        .select('commitment_id, user_id, updated_at')
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false });

    const focusRows = focuses || [];
    if (focusRows.length === 0) return [];

    const commitmentIds = [...new Set(focusRows.map((item: any) => item.commitment_id))];
    const userIds = [...new Set(focusRows.map((item: any) => item.user_id))];

    const [{ data: commitments }, { data: profiles }, { data: progressRows }] = await Promise.all([
        supabaseAdmin.from('commitments').select('id, title, due_at').in('id', commitmentIds),
        supabaseAdmin.from('profiles').select('id, full_name, email, avatar_url').in('id', userIds),
        supabaseAdmin.from('commitment_operation_progress').select('commitment_id, user_id, status').in('commitment_id', commitmentIds).in('user_id', userIds),
    ]);

    const commitmentMap = new Map((commitments || []).map((item: any) => [item.id, item]));
    const profileMap = new Map((profiles || []).map((item: any) => [item.id, item]));
    const progressMap = new Map((progressRows || []).map((item: any) => [`${item.commitment_id}:${item.user_id}`, item]));

    return focusRows.map((item: any) => ({
        user_id: item.user_id,
        user_name: profileMap.get(item.user_id)?.full_name || profileMap.get(item.user_id)?.email?.split('@')[0] || 'Alguien',
        commitment_id: item.commitment_id,
        commitment_title: commitmentMap.get(item.commitment_id)?.title || 'Tarea',
        due_at: commitmentMap.get(item.commitment_id)?.due_at || null,
        status: progressMap.get(`${item.commitment_id}:${item.user_id}`)?.status || 'ready',
    }));
}

function mergeCommitmentWithProgress(commitment: any, progress: any) {
    if (!commitment) return null;
    if (!progress) return commitment;

    return {
        ...commitment,
        meta: {
            ...(commitment.meta || {}),
            operational: {
                ...((commitment.meta || {}).operational || {}),
                acknowledged_at: progress.acknowledged_at || null,
                arrived_at: progress.arrived_at || null,
                completed_at: progress.completed_at || null,
                arrived_location_message_id: progress.latest_location_message_id || null,
                completion_note: progress.completion_note || null,
                completion_outcome: progress.completion_outcome || null,
            },
        },
        operation_progress: progress,
    };
}

async function ensureChecklistRun(checklist: any, userId: string) {
    const today = getTodayDate();

    const { data: existingRun } = await supabaseAdmin
        .from('operation_checklist_runs')
        .select('id, run_date')
        .eq('checklist_id', checklist.id)
        .eq('run_date', today)
        .maybeSingle();

    if (existingRun) {
        const { data: runItems, error } = await supabaseAdmin
            .from('operation_checklist_run_items')
            .select('*, profiles:checked_by_user_id(id, full_name, email, avatar_url)')
            .eq('run_id', existingRun.id)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        return {
            id: existingRun.id,
            run_date: existingRun.run_date,
            items: runItems || [],
        };
    }

    const { data: run, error: runError } = await supabaseAdmin
        .from('operation_checklist_runs')
        .insert({
            checklist_id: checklist.id,
            conversation_id: checklist.conversation_id,
            run_date: today,
            created_by_user_id: userId,
        })
        .select('id, run_date')
        .single();

    if (runError) throw runError;

    const { data: templateItems, error: itemsError } = await supabaseAdmin
        .from('operation_checklist_items')
        .select('*')
        .eq('checklist_id', checklist.id)
        .order('sort_order', { ascending: true });

    if (itemsError) throw itemsError;

    if ((templateItems || []).length > 0) {
        const { error: cloneError } = await supabaseAdmin
            .from('operation_checklist_run_items')
            .insert(
                (templateItems || []).map((item: any) => ({
                    run_id: run.id,
                    template_item_id: item.id,
                    label: item.label,
                    sort_order: item.sort_order,
                }))
            );

        if (cloneError) throw cloneError;
    }

    const { data: runItems, error: runItemsError } = await supabaseAdmin
        .from('operation_checklist_run_items')
        .select('*, profiles:checked_by_user_id(id, full_name, email, avatar_url)')
        .eq('run_id', run.id)
        .order('sort_order', { ascending: true });

    if (runItemsError) throw runItemsError;

    return {
        id: run.id,
        run_date: run.run_date,
        items: runItems || [],
    };
}

async function getPinnedMessage(pinnedMessageId?: string | null) {
    if (!pinnedMessageId) return null;

    const { data } = await supabaseAdmin
        .from('messages')
        .select('*, profiles!sender_id(id, email, full_name, avatar_url)')
        .eq('id', pinnedMessageId)
        .maybeSingle();

    return data || null;
}

async function getCommitmentSummary(commitmentId?: string | null) {
    if (!commitmentId) return null;

    const { data } = await supabaseAdmin
        .from('commitments')
        .select(`
            *,
            owner:owner_user_id(id, full_name, email, avatar_url),
            assignee:assigned_to_user_id(id, full_name, email, avatar_url)
        `)
        .eq('id', commitmentId)
        .maybeSingle();

    return data || null;
}

async function getLatestLocation(conversationId: string) {
    const { data } = await supabaseAdmin
        .from('messages')
        .select('id, text, created_at, sender_id, meta, profiles!sender_id(id, email, full_name, avatar_url)')
        .eq('conversation_id', conversationId)
        .contains('meta', { messageType: 'location_share' })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return data || null;
}

export async function getConversationOperationState(userId: string, conversationId: string) {
    await assertParticipant(userId, conversationId);

    const { data: conversation, error } = await supabaseAdmin
        .from('conversations')
        .select('id, mode, pinned_message_id, active_commitment_id')
        .eq('id', conversationId)
        .single();

    if (error || !conversation) throw error || new Error('Conversation not found');

    const [pinnedMessage, operationFocus, checklists, latestShiftReport, latestLocation, teamProgressPreview] = await Promise.all([
        getPinnedMessage(conversation.pinned_message_id),
        getOperationFocus(userId, conversationId),
        (async () => {
            const { data } = await supabaseAdmin
                .from('operation_checklists')
                .select('id, conversation_id, title, category_label, responsible_user_id, responsible_role_label, frequency, created_at, updated_at')
                .eq('conversation_id', conversationId)
                .eq('is_active', true)
                .order('updated_at', { ascending: false });

            const enriched = await Promise.all((data || []).map(async (checklist: any) => ({
                ...checklist,
                run: await ensureChecklistRun(checklist, userId),
            })));

            return enriched;
        })(),
        (async () => {
            const { data } = await supabaseAdmin
                .from('shift_reports')
                .select('*, profiles:user_id(id, email, full_name, avatar_url)')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            return data || null;
        })(),
        getLatestLocation(conversationId),
        getTeamProgressPreview(conversationId),
    ]);

    const focusCommitmentId = operationFocus?.commitment_id || conversation.active_commitment_id || null;
    const rawFocusCommitment = await getCommitmentSummary(focusCommitmentId);
    const myProgress = focusCommitmentId ? await getOperationProgress(focusCommitmentId, userId) : null;
    const activeCommitment = mergeCommitmentWithProgress(rawFocusCommitment, myProgress);
    const activeChecklist = (checklists || []).find((item: any) => item.responsible_user_id === userId) || (checklists || [])[0] || null;

    return {
        conversation: {
            ...conversation,
            active_commitment_id: focusCommitmentId,
        },
        myFocus: operationFocus,
        myProgress,
        activeCommitment,
        pinnedMessage,
        checklists: checklists || [],
        activeChecklist,
        latestShiftReport,
        latestLocation,
        teamProgressPreview,
    };
}

export async function updateConversationMode(userId: string, conversationId: string, mode: 'chat' | 'operation') {
    await assertParticipant(userId, conversationId);

    if (mode === 'chat') {
        await supabaseAdmin
            .from('conversation_operation_focuses')
            .delete()
            .eq('conversation_id', conversationId);
    }

    const { data, error } = await supabaseAdmin
        .from('conversations')
        .update(mode === 'chat' ? { mode, active_commitment_id: null } : { mode })
        .eq('id', conversationId)
        .select('id, mode, pinned_message_id, active_commitment_id')
        .single();

    if (error) throw error;
    return data;
}

export async function setPinnedMessage(userId: string, conversationId: string, messageId: string | null) {
    await assertParticipant(userId, conversationId);

    if (messageId) {
        const { data: message, error } = await supabaseAdmin
            .from('messages')
            .select('id')
            .eq('id', messageId)
            .eq('conversation_id', conversationId)
            .maybeSingle();

        if (error || !message) throw new Error('Message not found in conversation');
    }

    const { data, error: updateError } = await supabaseAdmin
        .from('conversations')
        .update({ pinned_message_id: messageId })
        .eq('id', conversationId)
        .select('id, mode, pinned_message_id, active_commitment_id')
        .single();

    if (updateError) throw updateError;
    return data;
}

export async function setActiveCommitment(userId: string, conversationId: string, commitmentId: string | null) {
    await assertParticipant(userId, conversationId);

    if (commitmentId) {
        const { data: commitment, error } = await supabaseAdmin
            .from('commitments')
            .select('id, group_conversation_id, title, assigned_to_user_id')
            .eq('id', commitmentId)
            .eq('group_conversation_id', conversationId)
            .maybeSingle();

        if (error || !commitment) throw new Error('Commitment not found in this conversation');
        if (commitment.assigned_to_user_id && commitment.assigned_to_user_id !== userId) {
            throw new Error('Only the assigned user can put this task in progress');
        }
    }

    if (!commitmentId) {
        const { error: deleteError } = await supabaseAdmin
            .from('conversation_operation_focuses')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;
    } else {
        const { error: upsertError } = await supabaseAdmin
            .from('conversation_operation_focuses')
            .upsert({
                conversation_id: conversationId,
                user_id: userId,
                commitment_id: commitmentId,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'conversation_id,user_id' });

        if (upsertError) throw upsertError;
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .select('id, mode, pinned_message_id, active_commitment_id')
        .eq('id', conversationId)
        .single();

    if (conversationError) throw conversationError;
    return {
        ...conversation,
        active_commitment_id: commitmentId,
    };
}

export async function saveChecklistTemplate(
    userId: string,
    conversationId: string,
    title: string,
    items: string[],
    options: {
        checklistId?: string | null;
        categoryLabel?: string | null;
        responsibleUserId?: string | null;
        responsibleRoleLabel?: string | null;
        frequency?: 'manual' | 'daily' | 'shift';
    } = {}
) {
    await assertParticipant(userId, conversationId);

    const cleanedItems = items
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);

    if (cleanedItems.length === 0) {
        throw new Error('Checklist must contain at least one item');
    }

    let checklist: any = null;

    if (options.checklistId) {
        const { data: updatedChecklist, error: checklistError } = await supabaseAdmin
            .from('operation_checklists')
            .update({
                title,
                category_label: options.categoryLabel || null,
                responsible_user_id: options.responsibleUserId || null,
                responsible_role_label: options.responsibleRoleLabel || null,
                frequency: options.frequency || 'manual',
                updated_at: new Date().toISOString(),
            })
            .eq('id', options.checklistId)
            .eq('conversation_id', conversationId)
            .select('id, conversation_id, title, category_label, responsible_user_id, responsible_role_label, frequency, created_at, updated_at')
            .single();

        if (checklistError) throw checklistError;
        checklist = updatedChecklist;

        await supabaseAdmin
            .from('operation_checklist_items')
            .delete()
            .eq('checklist_id', checklist.id);
    } else {
        const { data: createdChecklist, error: checklistError } = await supabaseAdmin
            .from('operation_checklists')
            .insert({
                conversation_id: conversationId,
                title,
                created_by_user_id: userId,
                is_active: true,
                category_label: options.categoryLabel || null,
                responsible_user_id: options.responsibleUserId || null,
                responsible_role_label: options.responsibleRoleLabel || null,
                frequency: options.frequency || 'manual',
                updated_at: new Date().toISOString(),
            })
            .select('id, conversation_id, title, category_label, responsible_user_id, responsible_role_label, frequency, created_at, updated_at')
            .single();

        if (checklistError) throw checklistError;
        checklist = createdChecklist;
    }

    const { error: itemsError } = await supabaseAdmin.from('operation_checklist_items').insert(
        cleanedItems.map((label, index) => ({
            checklist_id: checklist.id,
            label,
            sort_order: index,
        }))
    );

    if (itemsError) throw itemsError;

    const run = await ensureChecklistRun(checklist, userId);
    return { ...checklist, run };
}

export async function toggleChecklistItem(userId: string, runItemId: string, result: 'good' | 'regular' | 'bad' | 'na' | null) {
    const { data: runItem, error: fetchError } = await supabaseAdmin
        .from('operation_checklist_run_items')
        .select('id, run_id')
        .eq('id', runItemId)
        .single();

    if (fetchError || !runItem) throw fetchError || new Error('Checklist item not found');

    const { data: run, error: runError } = await supabaseAdmin
        .from('operation_checklist_runs')
        .select('conversation_id')
        .eq('id', runItem.run_id)
        .single();

    if (runError || !run) throw runError || new Error('Checklist run not found');

    const conversationId = run.conversation_id;
    await assertParticipant(userId, conversationId);

    const payload = result
        ? {
            is_checked: true,
            result,
            checked_at: new Date().toISOString(),
            checked_by_user_id: userId,
        }
        : {
            is_checked: false,
            result: null,
            checked_at: null,
            checked_by_user_id: null,
        };

    const { data, error } = await supabaseAdmin
        .from('operation_checklist_run_items')
        .update(payload)
        .eq('id', runItemId)
        .select('*, profiles:checked_by_user_id(id, full_name, email, avatar_url)')
        .single();

    if (error) throw error;
    return data;
}

export async function createShiftReport(userId: string, conversationId: string, body: string, source: 'text' | 'audio' = 'text', meta: any = {}) {
    await assertParticipant(userId, conversationId);

    const { data, error } = await supabaseAdmin
        .from('shift_reports')
        .insert({
            conversation_id: conversationId,
            user_id: userId,
            body,
            source,
            meta,
        })
        .select('*, profiles:user_id(id, email, full_name, avatar_url)')
        .single();

    if (error) throw error;
    return data;
}

export async function registerCommitmentOperationAction(
    userId: string,
    commitmentId: string,
    action: 'acknowledged' | 'arrived' | 'completed',
    locationMessageId?: string | null,
    completionNote?: string | null,
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null
) {
    const { data: commitment, error: commitmentError } = await supabaseAdmin
        .from('commitments')
        .select('*')
        .eq('id', commitmentId)
        .single();

    if (commitmentError || !commitment) throw commitmentError || new Error('Commitment not found');

    if (commitment.group_conversation_id) {
        await assertParticipant(userId, commitment.group_conversation_id);
    }

    const { data: existingProgress } = await supabaseAdmin
        .from('commitment_operation_progress')
        .select('*')
        .eq('commitment_id', commitmentId)
        .eq('user_id', userId)
        .maybeSingle();

    const now = new Date().toISOString();
    const currentMeta = commitment.meta || {};
    const operational = currentMeta.operational || {};
    const nextOperational = { ...operational };
    const updates: any = {
        meta: {
            ...currentMeta,
        },
    };

    if (action === 'acknowledged') {
        nextOperational.acknowledged_at = now;
        nextOperational.acknowledged_by_user_id = userId;
        if (commitment.status === 'proposed' || commitment.status === 'pending') {
            updates.status = 'accepted';
            if (!commitment.assigned_to_user_id) {
                updates.assigned_to_user_id = userId;
            }
        }
    }

    if (action === 'arrived') {
        nextOperational.arrived_at = now;
        nextOperational.arrived_by_user_id = userId;
        if (locationMessageId) {
            nextOperational.arrived_location_message_id = locationMessageId;
        }
        if (commitment.status === 'proposed' || commitment.status === 'pending') {
            updates.status = 'accepted';
            if (!commitment.assigned_to_user_id) {
                updates.assigned_to_user_id = userId;
            }
        }
    }

    if (action === 'completed') {
        nextOperational.completed_at = now;
        nextOperational.completed_by_user_id = userId;
        nextOperational.completion_note = completionNote || null;
        nextOperational.completion_outcome = completionOutcome || 'resolved';
        updates.status = 'completed';
    }

    updates.meta.operational = nextOperational;

    const progressPayload: any = {
        commitment_id: commitmentId,
        user_id: userId,
        status: action === 'acknowledged' ? 'started' : action === 'arrived' ? 'arrived' : 'completed',
        acknowledged_at: action === 'acknowledged' ? now : existingProgress?.acknowledged_at || null,
        arrived_at: action === 'arrived' ? now : existingProgress?.arrived_at || null,
        completed_at: action === 'completed' ? now : existingProgress?.completed_at || null,
        latest_location_message_id: action === 'arrived' ? locationMessageId || existingProgress?.latest_location_message_id || null : existingProgress?.latest_location_message_id || null,
        completion_note: action === 'completed' ? completionNote || null : existingProgress?.completion_note || null,
        completion_outcome: action === 'completed' ? completionOutcome || 'resolved' : existingProgress?.completion_outcome || null,
        updated_at: now,
    };

    const { error: progressError } = await supabaseAdmin
        .from('commitment_operation_progress')
        .upsert(progressPayload, { onConflict: 'commitment_id,user_id' });

    if (progressError) throw progressError;

    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update(updates)
        .eq('id', commitmentId)
        .select(`
            *,
            owner:owner_user_id(id, full_name, email, avatar_url),
            assignee:assigned_to_user_id(id, full_name, email, avatar_url)
        `)
        .single();

    if (error) throw error;

    await addOperationReaction(commitment.message_id, userId, action);

    if (action === 'completed' && commitment.group_conversation_id) {
        await supabaseAdmin
            .from('conversation_operation_focuses')
            .delete()
            .eq('conversation_id', commitment.group_conversation_id)
            .eq('user_id', userId)
            .eq('commitment_id', commitment.id);

        const userName = await getUserDisplayName(userId);
        await insertSystemMessage(
            commitment.group_conversation_id,
            `${userName} termino "${commitment.title}"`,
            userId,
            {
                messageType: 'operation_completion',
                operationCompletion: {
                    commitment_id: commitment.id,
                    title: commitment.title,
                    completed_by_name: userName,
                    completed_at: now,
                    outcome: completionOutcome || 'resolved',
                    note: completionNote || null,
                },
            }
        );
    }

    return mergeCommitmentWithProgress(data, { ...existingProgress, ...progressPayload });
}
