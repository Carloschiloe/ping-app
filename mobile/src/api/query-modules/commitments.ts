import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../client';
import { useAuth } from '../../context/AuthContext';

export const useReactToMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
            if (!user) return;
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('*')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('emoji', emoji)
                .single();

            if (existing) {
                await supabase.from('message_reactions').delete().eq('id', existing.id);
            } else {
                await supabase.from('message_reactions').insert({
                    message_id: messageId,
                    user_id: user.id,
                    emoji,
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
        }
    });
};

export const useCommitments = (status?: string) => {
    return useQuery({
        queryKey: ['commitments', status],
        queryFn: async () => {
            const endpoint = status ? `/commitments?status=${status}` : '/commitments';
            return apiClient.get(endpoint);
        }
    });
};

export const useCreateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitments', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useAcceptCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/accept`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useRejectCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string, reason: string }) =>
            apiClient.post(`/commitments/${id}/reject`, { reason }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        },
    });
};

export const usePostponeCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, newDate }: { id: string, newDate: string }) =>
            apiClient.post(`/commitments/${id}/postpone`, { newDate }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        },
    });
};

export const useUpdateCommitmentStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) =>
            apiClient.patch(`/commitments/${id}`, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useUpdateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string, data: any }) =>
            apiClient.patch(`/commitments/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useMarkCommitmentDone = () => {
    const { mutate, isPending } = useUpdateCommitmentStatus();
    return {
        mutate: (id: string) => mutate({ id, status: 'completed' }),
        isPending
    };
};

export const useDeleteCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.delete(`/commitments/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};

export const useGroupTasks = () => {
    return useQuery({
        queryKey: ['group-tasks'],
        queryFn: async () => {
            return apiClient.get('/commitments?is_group_task=true');
        },
    });
};

export const useConversationGroupTasks = (conversationId: string | null) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`group-tasks-${conversationId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commitments', filter: `group_conversation_id=eq.${conversationId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient]);

    return useQuery({
        queryKey: ['group-tasks-conv', conversationId, user?.id],
        queryFn: async () => {
            if (!conversationId) return [];
            return apiClient.get(`/commitments?conversationId=${conversationId}`);
        },
        enabled: !!conversationId,
    });
};
