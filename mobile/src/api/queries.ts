import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { apiClient } from './client';
import { useAuth } from '../context/AuthContext';

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

export const useAskPing = () => {
    return useMutation({
        mutationFn: (query: string) => apiClient.post('/ai/ask', { query }),
    });
};

// ─── Conversations ────────────────────────────────────────────────────

export const useConversations = () => {
    const queryClient = useQueryClient();

    // Realtime: refresh conversation list when any message is inserted
    useEffect(() => {
        const channel = supabase
            .channel('conversations-list')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                const newMsg = payload.new as any;
                // If we receive a message from someone else and it's just 'sent', mark it 'delivered'
                if (newMsg && newMsg.status === 'sent') {
                    const { data: { session } } = await supabase.auth.getSession();
                    const currentUserId = session?.user?.id;
                    const isMe = currentUserId && (newMsg.sender_id === currentUserId || newMsg.user_id === currentUserId);
                    if (!isMe && !newMsg.meta?.isSystem) {
                        try {
                            await apiClient.patch(`/messages/${newMsg.id}/status`, { status: 'delivered' });
                        } catch (e) {
                            console.error('[Delivered Receipt Error]', e);
                        }
                    }
                }
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
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

export const useConversationMessages = (conversationId: string, scrollToMessageId?: string) => {
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
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                () => { queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] }); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'message_reactions' },
                () => { queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] }); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient]);

    return useQuery({
        queryKey: ['conversation-messages', conversationId, scrollToMessageId],
        queryFn: () => apiClient.get(`/conversations/${conversationId}/messages${scrollToMessageId ? `?scrollToMessageId=${scrollToMessageId}` : ''}`),
        enabled: !!conversationId,
    });
};


export const useSendConversationMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { text: string; reply_to_id?: string }) => {
            console.log(`[Queries] Sending message: body=${JSON.stringify(data)}`);
            return apiClient.post(`/conversations/${conversationId}/messages`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};

export const useUpdateMessageStatus = (conversationId: string) => {
    return useMutation({
        mutationFn: async ({ messageId, status }: { messageId: string, status: string }) =>
            apiClient.patch(`/messages/${messageId}/status`, { status })
    });
};

export const useMarkConversationAsRead = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => apiClient.patch(`/conversations/${conversationId}/read`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
        }
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

// ─── Groups ──────────────────────────────────────────────────────────

export const useCreateGroup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string, participantIds: string[], avatarUrl?: string }) =>
            apiClient.post('/groups', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};

export const useAddGroupParticipants = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { newParticipantIds: string[] }) =>
            apiClient.post(`/groups/${conversationId}/participants`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        },
    });
};

export const useDeleteGroup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (conversationId: string) => apiClient.delete(`/groups/${conversationId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};

export const useUpdateGroup = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name?: string; avatar_url?: string }) =>
            apiClient.patch(`/groups/${conversationId}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};

// ─── User search & Profile ─────────────────────────────────────────────
export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { full_name?: string; avatar_url?: string }) =>
            apiClient.patch('/user/profile', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            // Profiles are usually fetched via Supabase directly or joined in other queries,
            // but we might want to invalidate any specific profile queries if we had them.
        },
    });
};

export const useUserSearch = (query: string) => {
    return useQuery({
        queryKey: ['user-search', query],
        queryFn: () => apiClient.get(`/users?q=${encodeURIComponent(query)}`),
        enabled: query.length >= 2,
    });
};

// ─── Commitments ──────────────────────────────────────────────────────

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

export const useMarkCommitmentDone = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.patch(`/commitments/${id}`, { status: 'completed' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
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
export const useCalendarAccounts = () => {
    return useQuery({
        queryKey: ['calendar-accounts'],
        queryFn: () => apiClient.get('/calendar/accounts'),
    });
};

export const useUpdateCalendarAccount = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { id: string; is_auto_sync_enabled: boolean }) =>
            apiClient.patch(`/calendar/accounts/${data.id}`, { is_auto_sync_enabled: data.is_auto_sync_enabled }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] });
        },
    });
};

export const useDisconnectCalendarAccount = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiClient.delete(`/calendar/accounts/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendar-accounts'] });
        },
    });
};
