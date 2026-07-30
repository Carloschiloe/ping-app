import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../client';
import { useAuth } from '../../context/AuthContext';

export const useReactToMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        // V2: la columna real de message_reactions es `reaction` (antes
        // `emoji`). El parametro del hook se mantiene como `emoji` para no
        // tocar los componentes que lo llaman (ReactionsModal, MessageItem).
        mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
            if (!user) return;
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('*')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('reaction', emoji)
                .single();

            if (existing) {
                await supabase.from('message_reactions').delete().eq('id', existing.id);
            } else {
                await supabase.from('message_reactions').insert({
                    message_id: messageId,
                    user_id: user.id,
                    reaction: emoji,
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

// Alias de compatibilidad: el backend traduce status:'completed' a la
// transicion real 'resolve' (ver backend/src/services/commitment.service.ts
// mapRequestedStatusToAction). Preferir useResolveCommitment en UI nueva.
export const useMarkCommitmentDone = () => {
    const { mutate, isPending } = useResolveCommitment();
    return {
        mutate: ({ id, result }: { id: string; result: string }) => mutate({ id, result }),
        isPending
    };
};

function useCommitmentLifecycleInvalidation() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['insights'] });
        queryClient.invalidateQueries({ queryKey: ['commitments'] });
        queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
    };
}

// Ciclo de vida V2 (ver backend/src/routes/index.ts): estas llamadas usan
// los endpoints dedicados directamente en vez de pasar por el alias de
// compatibilidad de PATCH /commitments/:id.
export const useResolveCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, result }: { id: string; result: string }) =>
            apiClient.post(`/commitments/${id}/resolve`, { result }),
        onSuccess: invalidate,
    });
};

export const useCancelCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
            apiClient.post(`/commitments/${id}/cancel`, { reason: reason?.trim() || null }),
        onSuccess: invalidate,
    });
};

export const useReopenCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/reopen`, {}),
        onSuccess: invalidate,
    });
};

export const useMarkActionCompleted = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/action-completed`, {}),
        onSuccess: invalidate,
    });
};

export const useCounterProposeCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, proposedDueAt }: { id: string, proposedDueAt: string }) =>
            apiClient.post(`/commitments/${id}/counter-propose`, { proposedDueAt }),
        onSuccess: invalidate,
    });
};

export const useReassignCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, assigned_to_user_id, counterparty_contact_id }: { id: string, assigned_to_user_id?: string | null, counterparty_contact_id?: string | null }) =>
            apiClient.post(`/commitments/${id}/reassign`, { assigned_to_user_id, counterparty_contact_id }),
        onSuccess: invalidate,
    });
};

export const useScheduleFollowUp = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, followUpAt, nextAction, waitingOnUserId, waitingOnContactId }: { id: string, followUpAt: string, nextAction?: string | null, waitingOnUserId?: string | null, waitingOnContactId?: string | null }) =>
            apiClient.post(`/commitments/${id}/follow-up`, { followUpAt, nextAction, waitingOnUserId, waitingOnContactId }),
        onSuccess: invalidate,
    });
};

// Contactos externos (contraparte de un commitment sin cuenta en Ping).
export const useContacts = () => {
    return useQuery({
        queryKey: ['contacts'],
        queryFn: async () => apiClient.get('/contacts'),
    });
};

export const useCreateContact = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { display_name: string; phone?: string | null; email?: string | null }) =>
            apiClient.post('/contacts', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
        },
    });
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
        // V2: la columna real de commitments es conversation_id
        // (group_conversation_id nunca existio en el esquema V2 — un filtro
        // de Realtime de Supabase se evalua contra la columna de Postgres,
        // asi que con el nombre viejo este canal nunca disparaba).
        const channel = supabase
            .channel(`group-tasks-${conversationId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commitments', filter: `conversation_id=eq.${conversationId}` }, () => {
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
