import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const PENDING_RESPONSE_STATUSES = ['pending', 'proposed', 'counter_proposal'];
const UPCOMING_STATUSES = ['accepted', 'in_progress'];

function mapProgressState(item: any) {
    if (item?.completed_at || item?.status === 'completed') return 'Terminado';
    if (item?.arrived_at || item?.status === 'arrived') return 'En sitio';
    if (item?.acknowledged_at || item?.status === 'started') return 'Iniciada';
    if (item?.status === 'ready') return 'Lista';
    return 'Pendiente';
}

function conversationLabel(conversation: any) {
    return conversation?.name || (conversation?.is_group ? 'Grupo' : 'Chat');
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
                myFocuses: [],
                inProgress: [],
                pendingResponse: [],
                upcoming: [],
                groupsSummary: [],
                teamStatusByGroup: [],
                counts: { inProgress: 0, pendingResponse: 0, upcoming: 0, groups: 0 },
            });
            return;
        }

        const [conversationsResult, commitmentsResult, focusesResult, progressResult] = await Promise.all([
            supabaseAdmin
                .from('conversations')
                .select('id, name, is_group, avatar_url, mode')
                .in('id', conversationIds),
            supabaseAdmin
                .from('commitments')
                .select(`
                    *,
                    owner:owner_user_id(id, full_name, email, avatar_url),
                    assignee:assigned_to_user_id(id, full_name, email, avatar_url)
                `)
                .in('group_conversation_id', conversationIds)
                .in('status', ['pending', 'proposed', 'accepted', 'counter_proposal', 'in_progress', 'completed']),
            supabaseAdmin
                .from('conversation_operation_focuses')
                .select('conversation_id, user_id, commitment_id, updated_at')
                .in('conversation_id', conversationIds),
            supabaseAdmin
                .from('commitment_operation_progress')
                .select('commitment_id, user_id, status, acknowledged_at, arrived_at, completed_at, updated_at')
        ]);

        if (conversationsResult.error) throw conversationsResult.error;
        if (commitmentsResult.error) throw commitmentsResult.error;
        if (focusesResult.error) throw focusesResult.error;
        if (progressResult.error) throw progressResult.error;

        const conversations = conversationsResult.data || [];
        const commitments = commitmentsResult.data || [];
        const focuses = focusesResult.data || [];
        const progresses = progressResult.data || [];

        const conversationMap = new Map(conversations.map((item) => [item.id, item]));
        const progressByCommitmentUser = new Map(
            progresses.map((item: any) => [`${item.commitment_id}:${item.user_id}`, item])
        );

        const enrichCommitment = (commitment: any) => {
            const conversation = conversationMap.get(commitment.group_conversation_id);
            const progress = progressByCommitmentUser.get(`${commitment.id}:${commitment.assigned_to_user_id || userId}`) || null;
            return {
                ...commitment,
                conversation_id: commitment.group_conversation_id,
                conversation_name: conversationLabel(conversation),
                conversation_mode: conversation?.mode || 'chat',
                conversation_avatar_url: conversation?.avatar_url || null,
                operational_state: mapProgressState(progress),
            };
        };

        const myFocuses = focuses
            .filter((focus: any) => focus.user_id === userId)
            .map((focus: any) => {
                const commitment = commitments.find((item: any) => item.id === focus.commitment_id);
                return commitment ? enrichCommitment(commitment) : null;
            })
            .filter(Boolean);

        const inProgress = myFocuses;

        const pendingResponse = commitments
            .filter((commitment: any) => commitment.assigned_to_user_id === userId && PENDING_RESPONSE_STATUSES.includes(commitment.status))
            .map(enrichCommitment)
            .sort((a: any, b: any) => new Date(a.due_at || 0).getTime() - new Date(b.due_at || 0).getTime());

        const focusedIds = new Set(focuses.map((focus: any) => focus.commitment_id));
        const upcoming = commitments
            .filter((commitment: any) => {
                if (focusedIds.has(commitment.id)) return false;
                if (!UPCOMING_STATUSES.includes(commitment.status)) return false;
                return commitment.assigned_to_user_id === userId || !commitment.assigned_to_user_id;
            })
            .map(enrichCommitment)
            .sort((a: any, b: any) => new Date(a.due_at || 0).getTime() - new Date(b.due_at || 0).getTime());

        const teamStatusByGroup = conversations
            .filter((conversation: any) => conversation.is_group)
            .map((conversation: any) => {
                const groupFocuses = focuses.filter((focus: any) => focus.conversation_id === conversation.id);
                const preview = groupFocuses.map((focus: any) => {
                    const commitment = commitments.find((item: any) => item.id === focus.commitment_id);
                    const progress = progressByCommitmentUser.get(`${focus.commitment_id}:${focus.user_id}`) || null;
                    const profile = commitment?.assigned_to_user_id === focus.user_id
                        ? commitment?.assignee
                        : commitment?.owner;

                    return {
                        user_id: focus.user_id,
                        user_name: profile?.full_name || profile?.email?.split('@')[0] || 'Alguien',
                        commitment_id: focus.commitment_id,
                        commitment_title: commitment?.title || 'Tarea',
                        state: mapProgressState(progress),
                    };
                });

                const openCount = commitments.filter((item: any) => item.group_conversation_id === conversation.id && item.status !== 'rejected').length;
                const pendingForMe = commitments.filter((item: any) => item.group_conversation_id === conversation.id && item.assigned_to_user_id === userId && PENDING_RESPONSE_STATUSES.includes(item.status)).length;

                return {
                    conversation_id: conversation.id,
                    conversation_name: conversationLabel(conversation),
                    conversation_avatar_url: conversation.avatar_url || null,
                    mode: conversation.mode || 'chat',
                    active_count: preview.length,
                    open_count: openCount,
                    pending_for_me: pendingForMe,
                    team_preview: preview,
                };
            })
            .filter((group: any) => group.mode === 'operation' || group.open_count > 0)
            .sort((a: any, b: any) => b.active_count - a.active_count || b.pending_for_me - a.pending_for_me || b.open_count - a.open_count);

        res.status(200).json({
            myFocuses,
            inProgress,
            pendingResponse,
            upcoming,
            groupsSummary: teamStatusByGroup,
            teamStatusByGroup,
            counts: {
                inProgress: inProgress.length,
                pendingResponse: pendingResponse.length,
                upcoming: upcoming.length,
                groups: teamStatusByGroup.length,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
