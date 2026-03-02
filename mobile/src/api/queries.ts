import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { apiClient } from './client';

// ─── Self-chat (legacy) ───────────────────────────────────────────────

export const useMessages = () => {
    return useQuery({
        queryKey: ['messages'],
        queryFn: async () => {
            const res = await apiClient.get('/messages');
            return res.messages || [];
        }
    });
};

export const useSendMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (text: string) => apiClient.post('/messages', { text }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};

// ─── Conversations ────────────────────────────────────────────────────

export const useConversations = () => {
    const queryClient = useQueryClient();

    // Realtime: refresh conversation list when any message is inserted
    useEffect(() => {
        const channel = supabase
            .channel('conversations-list')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [queryClient]);

    return useQuery({
        queryKey: ['conversations'],
        queryFn: () => apiClient.get('/conversations'),
    });
};

export const useConversationMessages = (conversationId: string) => {
    const queryClient = useQueryClient();

    // Realtime: instantly append new messages in this conversation
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`messages-${conversationId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                () => { queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] }); }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                () => { queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] }); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient]);

    return useQuery({
        queryKey: ['conversation-messages', conversationId],
        queryFn: () => apiClient.get(`/conversations/${conversationId}/messages`),
        enabled: !!conversationId,
    });
};


export const useSendConversationMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (text: string) =>
            apiClient.post(`/conversations/${conversationId}/messages`, { text }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};

export const useCreateConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (otherUserId: string) =>
            apiClient.post('/conversations', { otherUserId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};

export const useGetOrCreateSelfConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => apiClient.post('/conversations/self', {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};


// ─── User search ──────────────────────────────────────────────────────

export const useUserSearch = (query: string) => {
    return useQuery({
        queryKey: ['user-search', query],
        queryFn: () => apiClient.get(`/users?q=${encodeURIComponent(query)}`),
        enabled: query.length >= 2,
    });
};

// ─── Commitments ──────────────────────────────────────────────────────

export const useCommitments = (status?: string) => {
    return useQuery({
        queryKey: ['commitments', status],
        queryFn: async () => {
            const endpoint = status ? `/commitments?status=${status}` : '/commitments';
            return apiClient.get(endpoint);
        }
    });
};

export const useMarkCommitmentDone = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.patch(`/commitments/${id}`, { status: 'done' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};
