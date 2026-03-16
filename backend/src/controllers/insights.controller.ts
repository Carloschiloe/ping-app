import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const OPEN_STATUSES = ['pending', 'proposed', 'accepted', 'counter_proposal', 'in_progress'];
const PENDING_RESPONSE_STATUSES = ['pending', 'proposed', 'counter_proposal'];
const UPCOMING_STATUSES = ['accepted', 'in_progress'];

function buildConversationLabel(conversation: any) {
    if (conversation?.name) return conversation.name;
    return conversation?.is_group ? 'Grupo' : 'Chat';
}

function buildOperationalState(commitment: any) {
    const operational = commitment?.meta?.operational || {};

    if (operational.completed_at || commitment?.status === 'completed') return 'Terminado';
    if (operational.arrived_at) return 'En sitio';
    if (operational.acknowledged_at) return 'Entendido';
    if (commitment?.status === 'accepted' || commitment?.status === 'in_progress') return 'Aceptada';
    if (commitment?.status === 'counter_proposal') return 'Reagendar';
    if (commitment?.status === 'proposed' || commitment?.status === 'pending') return 'Pendiente';
    return 'Abierta';
}

function enrichCommitment(commitment: any, conversation: any) {
    return {
        ...commitment,
        conversation_id: conversation?.id || commitment.group_conversation_id || null,
        conversation_name: buildConversationLabel(conversation),
        conversation_mode: conversation?.mode || 'chat',
        conversation_avatar_url: conversation?.avatar_url || null,
        operational_state: buildOperationalState(commitment),
    };
}

export const getInsights = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { data: participations, error: participationsError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (participationsError) throw participationsError;

        const conversationIds = (participations || []).map((item) => item.conversation_id);
        if (conversationIds.length === 0) {
            res.status(200).json({
                inProgress: [],
                pendingResponse: [],
                upcoming: [],
                groupsSummary: [],
                counts: { inProgress: 0, pendingResponse: 0, upcoming: 0, groups: 0 },
            });
            return;
        }

        const { data: conversations, error: conversationsError } = await supabaseAdmin
            .from('conversations')
            .select('id, name, is_group, avatar_url, mode, active_commitment_id')
            .in('id', conversationIds);

        if (conversationsError) throw conversationsError;

        const conversationMap = new Map((conversations || []).map((conversation) => [conversation.id, conversation]));

        const { data: commitments, error: commitmentsError } = await supabaseAdmin
            .from('commitments')
            .select(`
                *,
                owner:owner_user_id(id, full_name, email, avatar_url),
                assignee:assigned_to_user_id(id, full_name, email, avatar_url)
            `)
            .in('group_conversation_id', conversationIds)
            .in('status', OPEN_STATUSES)
            .order('due_at', { ascending: true });

        if (commitmentsError) throw commitmentsError;

        const enrichedCommitments = (commitments || []).map((commitment) =>
            enrichCommitment(commitment, conversationMap.get(commitment.group_conversation_id))
        );

        const activeCommitmentIds = new Set(
            (conversations || [])
                .map((conversation) => conversation.active_commitment_id)
                .filter(Boolean)
        );

        const inProgress = enrichedCommitments.filter((commitment) => activeCommitmentIds.has(commitment.id));

        const pendingResponse = enrichedCommitments.filter((commitment) =>
            commitment.assigned_to_user_id === userId && PENDING_RESPONSE_STATUSES.includes(commitment.status)
        );

        const upcoming = enrichedCommitments.filter((commitment) => {
            if (activeCommitmentIds.has(commitment.id)) return false;
            if (!UPCOMING_STATUSES.includes(commitment.status)) return false;
            return commitment.assigned_to_user_id === userId || !commitment.assigned_to_user_id;
        });

        const groupsSummary = (conversations || [])
            .filter((conversation) => conversation.is_group)
            .map((conversation) => {
                const items = enrichedCommitments.filter((commitment) => commitment.group_conversation_id === conversation.id);
                const activeCommitment = items.find((commitment) => commitment.id === conversation.active_commitment_id) || null;
                const pendingForMe = items.filter((commitment) =>
                    commitment.assigned_to_user_id === userId && PENDING_RESPONSE_STATUSES.includes(commitment.status)
                ).length;

                return {
                    conversation_id: conversation.id,
                    conversation_name: buildConversationLabel(conversation),
                    conversation_avatar_url: conversation.avatar_url || null,
                    mode: conversation.mode || 'chat',
                    active_count: activeCommitment ? 1 : 0,
                    open_count: items.length,
                    pending_for_me: pendingForMe,
                    active_commitment: activeCommitment,
                };
            })
            .filter((group) => group.mode === 'operation' || group.open_count > 0)
            .sort((a, b) => {
                if (b.active_count !== a.active_count) return b.active_count - a.active_count;
                if (b.pending_for_me !== a.pending_for_me) return b.pending_for_me - a.pending_for_me;
                return b.open_count - a.open_count;
            });

        res.status(200).json({
            inProgress,
            pendingResponse,
            upcoming,
            groupsSummary,
            counts: {
                inProgress: inProgress.length,
                pendingResponse: pendingResponse.length,
                upcoming: upcoming.length,
                groups: groupsSummary.length,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
