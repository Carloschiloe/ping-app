import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertCanReferenceProfiles, assertConversationParticipant } from '../utils/authz';
import { safeErrorLog } from '../utils/safeError';

// Account deletion, blocking, reports and feedback: what Google Play asks of
// a chat app with AI replies, and the right to erase of Chile's Ley 21.719.

const PROFILE_FILES_BUCKET = 'chat-media';

async function removeProfileFiles(userId: string): Promise<void> {
    for (const folder of ['avatar', 'cover']) {
        const prefix = `profiles/${userId}/${folder}`;
        const { data, error } = await supabaseAdmin.storage.from(PROFILE_FILES_BUCKET).list(prefix, { limit: 100 });
        if (error) throw error;
        const paths = (data || []).map((file) => `${prefix}/${file.name}`);
        if (paths.length === 0) continue;
        const { error: removeError } = await supabaseAdmin.storage.from(PROFILE_FILES_BUCKET).remove(paths);
        if (removeError) throw removeError;
    }
}

// Erases the person's own data in one transaction, then their photos and
// their sign-in. Safe to call again if a later step failed.
export async function deleteAccount(userId: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc('delete_user_account', { p_user: userId });
    if (error) throw new AppError('Unable to delete account data', 500);

    try {
        await removeProfileFiles(userId);
    } catch (storageError) {
        // The profile no longer points at these files; a leftover is
        // unreachable, so the sign-in removal still goes ahead.
        console.error('[Account] profile files cleanup failed:', safeErrorLog(storageError));
    }

    // Soft delete keeps the auth row for the shared history's foreign keys
    // while removing the person's identities, so the number can sign up again.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId, true);
    if (authError) throw new AppError('Unable to delete sign-in', 500);
}

// --- Blocks -----------------------------------------------------------------

function isMissingTable(error: { code?: string }): boolean {
    return error.code === 'PGRST205' || error.code === '42P01';
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new AppError('You cannot block yourself', 400);
    await assertCanReferenceProfiles(blockerId, [blockedId]);
    const { error } = await supabaseAdmin
        .from('user_blocks')
        .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
    if (error) throw new AppError('Unable to block', 500);
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from('user_blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);
    if (error) throw new AppError('Unable to unblock', 500);
}

export async function listBlocked(blockerId: string) {
    const { data, error } = await supabaseAdmin
        .from('user_blocks')
        .select('blocked_id, created_at, profiles:blocked_id(id, full_name)')
        .eq('blocker_id', blockerId)
        .order('created_at', { ascending: false });
    if (error) throw new AppError('Unable to load blocks', 500);
    return (data || []).map((row: any) => ({
        id: row.blocked_id,
        full_name: row.profiles?.full_name ?? null,
        blocked_at: row.created_at,
    }));
}

// In a direct chat, either side's block stops messages and calls. Groups are
// not affected: a block is between two people, not a whole group.
export async function directChatBlock(userId: string, conversationId: string): Promise<{ blockedByMe: boolean; blockedMe: boolean; otherUserId: string | null }> {
    const none = { blockedByMe: false, blockedMe: false, otherUserId: null };
    // Almost nobody has a block: one cheap look keeps every send fast.
    const { data: anyBlock, error: anyError } = await supabaseAdmin
        .from('user_blocks')
        .select('blocker_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
        .limit(1);
    // Before the blocks table exists nobody can have a block: chats keep
    // working instead of failing every send during a deploy.
    if (anyError && isMissingTable(anyError)) return none;
    if (anyError) throw new AppError('Unable to check chat', 500);
    if (!anyBlock?.length) return none;

    const { data: conversation, error } = await supabaseAdmin
        .from('conversations')
        .select('conversation_type')
        .eq('id', conversationId)
        .maybeSingle();
    if (error) throw new AppError('Unable to check chat', 500);
    if (!conversation || conversation.conversation_type !== 'direct') return none;

    const { data: others, error: participantsError } = await supabaseAdmin
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', userId);
    if (participantsError) throw new AppError('Unable to check chat', 500);
    const otherUserId = others?.length === 1 ? others[0].user_id : null;
    if (!otherUserId) return none;

    const { data: blocks, error: blocksError } = await supabaseAdmin
        .from('user_blocks')
        .select('blocker_id')
        .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`);
    if (blocksError) throw new AppError('Unable to check chat', 500);
    return {
        blockedByMe: (blocks || []).some((b: any) => b.blocker_id === userId),
        blockedMe: (blocks || []).some((b: any) => b.blocker_id === otherUserId),
        otherUserId,
    };
}

export async function assertDirectChatNotBlocked(userId: string, conversationId: string): Promise<void> {
    const block = await directChatBlock(userId, conversationId);
    if (block.blockedByMe || block.blockedMe) {
        throw new AppError('This chat is blocked', 403);
    }
}

// --- Reports ----------------------------------------------------------------

export type ReportInput = {
    kind: 'user' | 'message' | 'assistant';
    reason: 'spam' | 'abuse' | 'inappropriate' | 'false' | 'other';
    details?: string | null;
    reportedUserId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    excerpt?: string | null;
    alsoBlock?: boolean;
};

export async function createReport(reporterId: string, input: ReportInput): Promise<{ id: string }> {
    let reportedUserId = input.reportedUserId ?? null;
    let excerpt = input.kind === 'assistant' ? (input.excerpt ?? null) : null;

    if (input.kind === 'message') {
        if (!input.conversationId || !input.messageId) throw new AppError('conversationId and messageId are required', 400);
        await assertConversationParticipant(reporterId, input.conversationId);
        const { data: message, error } = await supabaseAdmin
            .from('messages')
            .select('id, sender_id, content')
            .eq('id', input.messageId)
            .eq('conversation_id', input.conversationId)
            .maybeSingle();
        if (error) throw new AppError('Unable to load message', 500);
        if (!message) throw new AppError('Message not found', 404);
        reportedUserId = message.sender_id ?? null;
        // A copy of the words keeps the report reviewable after a deletion.
        excerpt = typeof message.content === 'string' ? message.content.slice(0, 2000) : null;
    } else if (input.kind === 'user') {
        if (!reportedUserId) throw new AppError('reportedUserId is required', 400);
        await assertCanReferenceProfiles(reporterId, [reportedUserId]);
    } else if (input.conversationId) {
        await assertConversationParticipant(reporterId, input.conversationId);
    }

    if (reportedUserId === reporterId) throw new AppError('You cannot report yourself', 400);

    const { data, error } = await supabaseAdmin
        .from('content_reports')
        .insert({
            reporter_id: reporterId,
            kind: input.kind,
            reason: input.reason,
            details: input.details?.trim() || null,
            reported_user_id: reportedUserId,
            conversation_id: input.conversationId ?? null,
            message_id: input.messageId ?? null,
            excerpt: excerpt?.slice(0, 2000) || null,
        })
        .select('id')
        .single();
    if (error || !data) throw new AppError('Unable to save report', 500);

    if (input.alsoBlock && reportedUserId && input.kind !== 'assistant') {
        await blockUser(reporterId, reportedUserId);
    }
    return { id: data.id };
}

// --- Feedback ---------------------------------------------------------------

export async function createFeedback(userId: string, input: { kind: 'idea' | 'problem' | 'other'; message: string; appVersion?: string | null; platform?: string | null }): Promise<{ id: string }> {
    const { data, error } = await supabaseAdmin
        .from('app_feedback')
        .insert({
            user_id: userId,
            kind: input.kind,
            message: input.message.trim(),
            app_version: input.appVersion ?? null,
            platform: input.platform ?? null,
        })
        .select('id')
        .single();
    if (error || !data) throw new AppError('Unable to save feedback', 500);
    return { id: data.id };
}

// --- Data export (portability, Ley 21.719) ----------------------------------

const EXPORT_LIMIT = 5000;

async function rows(query: PromiseLike<{ data: any; error: any }>, what: string): Promise<any[]> {
    const { data, error } = await query;
    if (error) throw new AppError(`Unable to export ${what}`, 500);
    return data || [];
}

// A copy of what the person put into Ping, in a common format. Other
// people's messages are not included: they belong to them.
export async function exportAccountData(userId: string) {
    const [profile, messages, commitments, memory, contacts, calendars, blocks, feedback, reports] = await Promise.all([
        rows(supabaseAdmin.from('profiles')
            .select('email, full_name, phone, privacy_read_receipts, privacy_last_seen, created_at')
            .eq('id', userId).limit(1), 'profile'),
        rows(supabaseAdmin.from('messages')
            .select('id, conversation_id, content, created_at')
            .eq('sender_id', userId).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(EXPORT_LIMIT), 'messages'),
        rows(supabaseAdmin.from('commitments')
            .select('id, title, description, status, due_at, created_at, conversation_id')
            .or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
            .order('created_at', { ascending: false }).limit(EXPORT_LIMIT), 'commitments'),
        rows(supabaseAdmin.from('memory_records')
            .select('canonical_text, observed_at')
            .eq('owner_user_id', userId).eq('status', 'active')
            .order('observed_at', { ascending: false }).limit(EXPORT_LIMIT), 'memory'),
        rows(supabaseAdmin.from('contacts')
            .select('display_name, phone, email, created_at')
            .eq('owner_user_id', userId).limit(EXPORT_LIMIT), 'contacts'),
        rows(supabaseAdmin.from('user_calendar_accounts')
            .select('provider, email, created_at')
            .eq('user_id', userId), 'calendars'),
        rows(supabaseAdmin.from('user_blocks')
            .select('blocked_id, created_at')
            .eq('blocker_id', userId), 'blocks'),
        rows(supabaseAdmin.from('app_feedback')
            .select('kind, message, created_at')
            .eq('user_id', userId), 'feedback'),
        rows(supabaseAdmin.from('content_reports')
            .select('kind, reason, details, created_at')
            .eq('reporter_id', userId), 'reports'),
    ]);

    return {
        exported_at: new Date().toISOString(),
        responsible: 'Marvex · contacto@marvex.cl',
        profile: profile[0] ?? null,
        messages_sent: messages,
        commitments,
        what_ping_remembers: memory.map((row) => ({ text: row.canonical_text, saved_at: row.observed_at })),
        saved_contacts: contacts,
        connected_calendars: calendars,
        blocked_people: blocks,
        feedback_sent: feedback,
        reports_sent: reports,
    };
}
