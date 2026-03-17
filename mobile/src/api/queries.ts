import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { apiClient } from './client';
import { useAuth } from '../context/AuthContext';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';

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
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (query: string) => apiClient.post('/ai/ask', { query }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-history'] });
        }
    });
};

export function useInsights() {
    return useQuery({
        queryKey: ['insights'],
        queryFn: async () => {
            const data = await apiClient.get('/insights');
            return data;
        },
        refetchOnWindowFocus: true,
    });
}

export const useAIHistory = () => {
    return useQuery({
        queryKey: ['ai-history'],
        queryFn: () => apiClient.get('/ai/history'),
    });
};

export const useClearAIHistory = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => apiClient.delete('/ai/history'),
        onSuccess: () => {
            queryClient.setQueryData(['ai-history'], { messages: [] });
        }
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
                        const isMe = newMsg.sender_id === user?.id;
                        const optimisticMatch = allMessages.find((m: any) =>
                            m.id.startsWith('temp-') &&
                            m.sender_id === newMsg.sender_id &&
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

export const useConversationMedia = (conversationId: string) => {
    return useQuery({
        queryKey: ['conversation-media', conversationId],
        queryFn: async () => {
            try {
                console.warn(`[DEBUG-QUERY] Fetching media for ${conversationId}`);
                const res = await apiClient.get(`/conversations/${conversationId}/media`);
                console.warn(`[DEBUG-QUERY] Media received: ${res.messages?.length || 0}`);
                return res.messages || [];
            } catch (err: any) {
                console.error(`[DEBUG-QUERY] ERROR fetching media:`, err?.message || err);
                throw err;
            }
        },
        enabled: !!conversationId,
    });
};


export const useSendConversationMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: (data: { text: string; reply_to_id?: string; mentioned_user_id?: string; meta?: any }) => {
            return apiClient.post(`/conversations/${conversationId}/messages`, data);
        },
        onMutate: async (data) => {
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
                    text: data.text,
                    created_at: new Date().toISOString(),
                    status: 'sending', // Local UI status
                    meta: data.meta || {},
                    reply_to_id: data.reply_to_id,
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
        mutationFn: async (overrideConversationId?: string) => apiClient.patch(`/conversations/${overrideConversationId || conversationId}/read`, {}),
        onSuccess: (_data, overrideConversationId) => {
            const targetConversationId = overrideConversationId || conversationId;
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            if (targetConversationId) {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', targetConversationId] });
            }
        }
    });
};

export const usePingConversation = () => {
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/conversations/${id}/ping`, {}),
    });
};

export const useToggleArchive = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.patch(`/conversations/${id}/archive`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

export const useConversationOperationState = (conversationId: string | null) => {
    return useQuery({
        queryKey: ['conversation-operation-state', conversationId],
        queryFn: async () => {
            if (!conversationId) return null;
            return apiClient.get(`/conversations/${conversationId}/operation-state`);
        },
        enabled: !!conversationId,
    });
};

export const useGroupParticipants = (conversationId: string | null) => {
    return useQuery({
        queryKey: ['group-participants', conversationId],
        queryFn: async () => {
            if (!conversationId) return [];
            const response = await apiClient.get(`/conversations/${conversationId}/participants`);
            return response.data || [];
        },
        enabled: !!conversationId,
    });
};

export const useUpdateConversationMode = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (mode: 'chat' | 'operation') => apiClient.patch(`/conversations/${conversationId}/mode`, { mode }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useSetPinnedMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: string | null) => apiClient.patch(`/conversations/${conversationId}/pin`, { messageId }),
        onMutate: async (messageId) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);
            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => old ? {
                ...old,
                conversation: {
                    ...old.conversation,
                    pinned_message_id: messageId,
                },
                pinnedMessage: messageId ? old.pinnedMessage : null,
            } : old);
            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useSetActiveOperationCommitment = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (commitmentId: string | null) => apiClient.patch(`/conversations/${conversationId}/active-commitment`, { commitmentId }),
        onMutate: async (commitmentId) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);
            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;
                const groupTaskQueries = queryClient.getQueriesData({ queryKey: ['group-tasks-conv', conversationId] });
                const groupTasks = groupTaskQueries.flatMap(([, data]: any) => Array.isArray(data) ? data : []);
                const activeCommitment = commitmentId
                    ? groupTasks.find((task: any) => task.id === commitmentId) || old.activeCommitment
                    : null;

                return {
                    ...old,
                    conversation: {
                        ...old.conversation,
                        active_commitment_id: commitmentId,
                    },
                    myFocus: commitmentId ? { ...(old.myFocus || {}), conversation_id: conversationId, commitment_id: commitmentId } : null,
                    activeCommitment,
                };
            });
            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
    });
};

export const useSaveOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { checklistId?: string | null; title: string; items: Array<string | { label: string; responseType?: 'condition' | 'severity' | 'yes_no' | 'text' }>; categoryLabel?: string | null; responsibleUserId?: string | null; responsibleRoleLabel?: string | null; frequency?: 'manual' | 'daily' | 'shift' }) => apiClient.post(`/conversations/${conversationId}/checklists`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useDuplicateOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.post(`/conversations/${conversationId}/checklists/${checklistId}/duplicate`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useArchiveOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.patch(`/conversations/${conversationId}/checklists/${checklistId}/archive`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useRestoreOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.patch(`/conversations/${conversationId}/checklists/${checklistId}/restore`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useToggleOperationChecklistItem = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, result }: { id: string; result: 'good' | 'regular' | 'bad' | 'na' | 'high' | 'medium' | 'low' | 'yes' | 'no' | null }) =>
            apiClient.patch(`/operation-checklist-run-items/${id}/toggle`, { result }),
        onMutate: async ({ id, result }) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);

            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;

                const updateChecklist = (checklist: any) => {
                    if (!checklist?.run?.items) return checklist;
                    return {
                        ...checklist,
                        run: {
                            ...checklist.run,
                            items: checklist.run.items.map((item: any) =>
                                item.id === id
                                    ? {
                                        ...item,
                                        is_checked: !!result,
                                        result,
                                        checked_at: result ? new Date().toISOString() : null,
                                        profiles: result ? item.profiles || { full_name: 'Tú' } : null,
                                    }
                                    : item
                            ),
                        },
                    };
                };

                return {
                    ...old,
                    activeChecklist: updateChecklist(old.activeChecklist),
                    checklists: Array.isArray(old.checklists) ? old.checklists.map(updateChecklist) : old.checklists,
                };
            });

            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useCreateShiftReport = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { body: string; source?: 'text' | 'audio'; meta?: any }) =>
            apiClient.post(`/conversations/${conversationId}/shift-reports`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
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
            queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] });
        },
    });
};

export const useUpdateGroupParticipantRole = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: 'member' | 'admin' }) =>
            apiClient.patch(`/groups/${conversationId}/participants/${userId}/role`, { role }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] });
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

function applyOperationActionToCommitment(
    commitment: any,
    action: 'acknowledged' | 'arrived' | 'completed',
    completionNote?: string | null,
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null
) {
    if (!commitment) return commitment;

    const now = new Date().toISOString();
    const meta = { ...(commitment.meta || {}) };
    const operational = { ...(meta.operational || {}) };

    if (action === 'acknowledged') {
        operational.acknowledged_at = now;
        if (normalizeCommitmentStatus(commitment.status) === 'proposed') {
            commitment = { ...commitment, status: 'accepted' };
        }
    }

    if (action === 'arrived') {
        operational.arrived_at = now;
        if (normalizeCommitmentStatus(commitment.status) === 'proposed') {
            commitment = { ...commitment, status: 'accepted' };
        }
    }

    if (action === 'completed') {
        operational.completed_at = now;
        operational.completion_note = completionNote || null;
        operational.completion_outcome = completionOutcome || 'resolved';
        commitment = { ...commitment, status: 'completed' };
    }

    return {
        ...commitment,
        meta: {
            ...meta,
            operational,
        },
    };
}

function updateGroupTaskCaches(
    queryClient: any,
    conversationId: string,
    commitmentId: string,
    action: 'acknowledged' | 'arrived' | 'completed',
    completionNote?: string | null,
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null
) {
    const taskQueries = queryClient.getQueriesData({ queryKey: ['group-tasks-conv', conversationId] });

    taskQueries.forEach(([key, data]: any) => {
        if (!Array.isArray(data)) return;
        queryClient.setQueryData(
            key,
            data.map((task: any) => task.id === commitmentId
                ? applyOperationActionToCommitment(task, action, completionNote, completionOutcome)
                : task)
        );
    });
}

export const useCommitmentOperationAction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, action, location_message_id, conversationId, completion_note, completion_outcome }: { id: string; action: 'acknowledged' | 'arrived' | 'completed'; location_message_id?: string | null; conversationId?: string; completion_note?: string | null; completion_outcome?: 'resolved' | 'pending_followup' | 'needs_review' | null }) =>
            apiClient.post(`/commitments/${id}/operation-action`, { action, location_message_id, conversationId, completion_note, completion_outcome }),
        onMutate: async (variables) => {
            const { conversationId, id, action, completion_note, completion_outcome } = variables;
            if (!conversationId) return {};

            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previousOperationState = queryClient.getQueryData(['conversation-operation-state', conversationId]);

            updateGroupTaskCaches(queryClient, conversationId, id, action, completion_note, completion_outcome);

            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;
                if (!old.activeCommitment || old.activeCommitment.id !== id) return old;

                return {
                    ...old,
                    conversation: {
                        ...old.conversation,
                        active_commitment_id: action === 'completed' ? null : old.conversation?.active_commitment_id,
                    },
                    myFocus: action === 'completed' ? null : old.myFocus,
                    activeCommitment: action === 'completed'
                        ? null
                        : applyOperationActionToCommitment(old.activeCommitment, action, completion_note, completion_outcome),
                };
            });

            return { previousOperationState };
        },
        onError: (_error, variables, context: any) => {
            if (variables.conversationId && context?.previousOperationState) {
                queryClient.setQueryData(['conversation-operation-state', variables.conversationId], context.previousOperationState);
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', variables.conversationId] });
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            if (variables.conversationId) {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', variables.conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', variables.conversationId] });
            }
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
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
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`group-tasks-${conversationId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'commitments', filter: `group_conversation_id=eq.${conversationId}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                    // Also invalidate general commitments to keep Insights updated
                    queryClient.invalidateQueries({ queryKey: ['commitments'] });
                }
            )
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
export const useDeleteMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: string) => apiClient.delete(`/messages/${messageId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversation-media', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};
