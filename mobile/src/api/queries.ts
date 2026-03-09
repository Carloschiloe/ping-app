import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
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
                        // Use a background call without await to avoid blocking the realtime thread
                        setTimeout(() => {
                            apiClient.patch(`/messages/${newMsg.id}/status`, { status: 'delivered' })
                                .catch(() => { /* Silently fail background updates */ });
                        }, 500); // Small delay to let DB settle
                    }
                }
                // Debounce invalidation slightly to avoid spamming if multiple messages arrive
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
    const { user } = useAuth();

    // Realtime: instantly append new messages or update status/reactions
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`messages-${conversationId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                (payload) => {
                    const newMsg = payload.new;
                    queryClient.setQueriesData({ queryKey: ['conversation-messages', conversationId] }, (oldData: any) => {
                        if (!oldData) return oldData;
                        // Avoid duplication if already added by optimistic update
                        const allMessages = oldData.pages.flatMap((page: any) => page.messages);

                        // Look for an optimistic message that matches this new one
                        // Match criteria: temporary ID, same sender, and same text
                        const isMe = newMsg.sender_id === user?.id || newMsg.user_id === user?.id;
                        const optimisticMatch = allMessages.find((m: any) =>
                            m.id.startsWith('temp-') &&
                            (m.sender_id === newMsg.sender_id || m.user_id === newMsg.user_id) &&
                            m.text === newMsg.text
                        );

                        const newPages = [...oldData.pages];
                        if (optimisticMatch) {
                            // Replace the optimistic message with the real one to keep position and avoid double render
                            newPages[0] = {
                                ...newPages[0],
                                messages: newPages[0].messages.map((m: any) => m.id === optimisticMatch.id ? newMsg : m)
                            };
                        } else {
                            // Only add if not already present by ID (standard check)
                            if (allMessages.find((m: any) => m.id === newMsg.id)) return oldData;

                            newPages[0] = {
                                ...newPages[0],
                                messages: [newMsg, ...newPages[0].messages]
                            };
                        }
                        return { ...oldData, pages: newPages };
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                (payload) => {
                    const updatedMsg = payload.new;
                    queryClient.setQueriesData({ queryKey: ['conversation-messages', conversationId] }, (oldData: any) => {
                        if (!oldData) return oldData;
                        return {
                            ...oldData,
                            pages: oldData.pages.map((page: any) => ({
                                ...page,
                                messages: page.messages.map((m: any) => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)
                            }))
                        };
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
                (payload) => {
                    const deletedId = payload.old.id;
                    queryClient.setQueriesData({ queryKey: ['conversation-messages', conversationId] }, (oldData: any) => {
                        if (!oldData) return oldData;
                        return {
                            ...oldData,
                            pages: oldData.pages.map((page: any) => ({
                                ...page,
                                messages: page.messages.filter((m: any) => m.id !== deletedId)
                            }))
                        };
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'message_reactions' },
                () => {
                    // Reactions are complex to update manually, invalidate for consistency
                    queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient, scrollToMessageId]);

    return useInfiniteQuery({
        queryKey: ['conversation-messages', conversationId, scrollToMessageId],
        queryFn: async ({ pageParam }) => {
            let url = `/conversations/${conversationId}/messages`;
            const params = new URLSearchParams();
            if (scrollToMessageId) params.append('scrollToMessageId', scrollToMessageId);
            if (pageParam) params.append('before', pageParam as string);

            const queryString = params.toString();
            return apiClient.get(url + (queryString ? `?${queryString}` : ''));
        },
        initialPageParam: null,
        getNextPageParam: (lastPage: any) => {
            if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
            return lastPage.messages[lastPage.messages.length - 1].created_at;
        },
        enabled: !!conversationId,
    });
};


export const useSendConversationMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: (data: { text: string; reply_to_id?: string; mentioned_user_id?: string }) => {
            return apiClient.post(`/conversations/${conversationId}/messages`, data);
        },
        onMutate: async (newMessage) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['conversation-messages', conversationId] });

            // Snapshot the previous values for all variations of this conversation's message list
            const previousQueries = queryClient.getQueriesData({ queryKey: ['conversation-messages', conversationId] });

            // Optimistically update to the new value
            if (previousQueries && previousQueries.length > 0) {
                const optimisticMsg = {
                    id: `temp-${Date.now()}`,
                    conversation_id: conversationId,
                    sender_id: user?.id,
                    user_id: user?.id,
                    text: newMessage.text,
                    created_at: new Date().toISOString(),
                    status: 'sending',
                    profiles: {
                        id: user?.id,
                        full_name: user?.user_metadata?.full_name,
                        avatar_url: user?.user_metadata?.avatar_url,
                        email: user?.email,
                    }
                };

                queryClient.setQueriesData({ queryKey: ['conversation-messages', conversationId] }, (old: any) => {
                    if (!old) return old;
                    const newPages = [...old.pages];
                    newPages[0] = {
                        ...newPages[0],
                        messages: [optimisticMsg, ...newPages[0].messages]
                    };
                    return { ...old, pages: newPages };
                });
            }

            return { previousQueries };
        },
        onError: (err, newMessage, context: any) => {
            if (context?.previousQueries) {
                context.previousQueries.forEach(([key, data]: any) => {
                    queryClient.setQueryData(key, data);
                });
            }
        },
        onSettled: () => {
            // Only invalidate after successful mutation to ensure server and client are in sync, 
            // but use a slight delay or non-blocking approach if needed.
            // For now, let's just make it more targeted.
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

export const useCreateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitments', data),
        onSuccess: () => {
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
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        },
    });
};

export const useRejectCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string, reason: string }) =>
            apiClient.post(`/commitments/${id}/reject`, { reason }),
        onSuccess: () => {
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

// ─── Phase 26: Group Tasks ────────────────────────────────────────────

export const useGroupTasks = () => {
    return useQuery({
        queryKey: ['group-tasks'],
        queryFn: async () => {
            return apiClient.get('/commitments?is_group_task=true');
        },
    });
};

/**
 * Returns all group commitments in a specific conversation.
 */
export const useConversationGroupTasks = (conversationId: string | null) => {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['group-tasks-conv', conversationId, user?.id],
        queryFn: async () => {
            if (!conversationId) return [];
            return apiClient.get(`/commitments?conversationId=${conversationId}`);
        },
        enabled: !!conversationId,
    });
};
