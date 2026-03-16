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

async function getUserName(userId: string) {
    const { data } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .single();

    return data?.full_name || data?.email?.split('@')[0] || 'Alguien';
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
            .select('*')
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
        .select('*')
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
        .select('id, mode, pinned_message_id')
        .eq('id', conversationId)
        .single();

    if (error || !conversation) throw error || new Error('Conversation not found');

    const [pinnedMessage, activeChecklist, latestShiftReport, latestLocation] = await Promise.all([
        getPinnedMessage(conversation.pinned_message_id),
        (async () => {
            const { data: checklist } = await supabaseAdmin
                .from('operation_checklists')
                .select('id, conversation_id, title, created_at, updated_at')
                .eq('conversation_id', conversationId)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!checklist) return null;

            const run = await ensureChecklistRun(checklist, userId);
            return { ...checklist, run };
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
    ]);

    return {
        conversation,
        pinnedMessage,
        activeChecklist,
        latestShiftReport,
        latestLocation,
    };
}

export async function updateConversationMode(userId: string, conversationId: string, mode: 'chat' | 'operation') {
    await assertParticipant(userId, conversationId);

    const { data, error } = await supabaseAdmin
        .from('conversations')
        .update({ mode })
        .eq('id', conversationId)
        .select('id, mode, pinned_message_id')
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
        .select('id, mode, pinned_message_id')
        .single();

    if (updateError) throw updateError;
    return data;
}

export async function saveChecklistTemplate(userId: string, conversationId: string, title: string, items: string[]) {
    await assertParticipant(userId, conversationId);

    const cleanedItems = items
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12);

    if (cleanedItems.length === 0) {
        throw new Error('Checklist must contain at least one item');
    }

    await supabaseAdmin
        .from('operation_checklists')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('is_active', true);

    const { data: checklist, error: checklistError } = await supabaseAdmin
        .from('operation_checklists')
        .insert({
            conversation_id: conversationId,
            title,
            created_by_user_id: userId,
            is_active: true,
            updated_at: new Date().toISOString(),
        })
        .select('id, conversation_id, title, created_at, updated_at')
        .single();

    if (checklistError) throw checklistError;

    const { error: itemsError } = await supabaseAdmin
        .from('operation_checklist_items')
        .insert(
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

export async function toggleChecklistItem(userId: string, runItemId: string, isChecked: boolean) {
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

    const payload = isChecked
        ? {
            is_checked: true,
            checked_at: new Date().toISOString(),
            checked_by_user_id: userId,
        }
        : {
            is_checked: false,
            checked_at: null,
            checked_by_user_id: null,
        };

    const { data, error } = await supabaseAdmin
        .from('operation_checklist_run_items')
        .update(payload)
        .eq('id', runItemId)
        .select('*')
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
    locationMessageId?: string | null
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
        updates.status = 'completed';
    }

    updates.meta.operational = nextOperational;

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

    const userName = await getUserName(userId);
    if (commitment.group_conversation_id) {
        const actionLabel = action === 'acknowledged'
            ? 'marco "Entendido"'
            : action === 'arrived'
                ? 'marco "Llegue"'
                : 'marco "Terminado"';
        await insertSystemMessage(commitment.group_conversation_id, `🛠️ ${userName} ${actionLabel}: ${commitment.title}`, userId);
    }

    return data;
}
