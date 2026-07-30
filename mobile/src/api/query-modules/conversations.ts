import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../client';
import { useAuth } from '../../context/AuthContext';
import { reconcileConfirmedMessage } from '../../utils/messageReconciliation';

function reconcileMessagePages(oldData: any, confirmed: any) {
    if (!oldData?.pages) return oldData;

    const allMessages = oldData.pages.flatMap((page: any) => page.messages);
    const reconciled = reconcileConfirmedMessage(allMessages, confirmed);
    const lengthDelta = reconciled.length - allMessages.length;
    let cursor = 0;

    return {
        ...oldData,
        pages: oldData.pages.map((page: any, index: number) => {
            const pageLength = Math.max(
                0,
                page.messages.length + (index === 0 ? lengthDelta : 0)
            );
            const nextPage = {
                ...page,
                messages: reconciled.slice(cursor, cursor + pageLength),
            };
            cursor += pageLength;
            return nextPage;
        }),
    };
}

export const useConversations = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        const channel = supabase
            .channel('conversations-list')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
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

    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`messages-${conversationId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
                const newMsg = payload.new;
                queryClient.setQueriesData({ queryKey: ['conversation-messages', conversationId] }, (oldData: any) => {
                    return reconcileMessagePages(oldData, newMsg);
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
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
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
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
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient, scrollToMessageId, user?.id]);

    return useInfiniteQuery({
        queryKey: ['conversation-messages', conversationId, scrollToMessageId],
        queryFn: async ({ pageParam }) => {
            const url = `/conversations/${conversationId}/messages`;
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
            const res = await apiClient.get(`/conversations/${conversationId}/media`);
            return res.messages || [];
        },
        enabled: !!conversationId,
    });
};

export const useSendConversationMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user, profile } = useAuth();

    return useMutation({
        mutationFn: (data: {
            text: string;
            reply_to_id?: string;
            mentioned_user_id?: string;
            client_message_id?: string;
            meta?: any;
            attachment?: {
                bucket: 'chat-media';
                objectPath: string;
                mimeType: string;
                fileName: string;
            };
        }) => {
            return apiClient.post(`/conversations/${conversationId}/messages`, data);
        },
        onMutate: async (data) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-messages', conversationId] });
            const previousQueries = queryClient.getQueriesData({ queryKey: ['conversation-messages', conversationId] });

            if (previousQueries && previousQueries.length > 0) {
                const optimisticMsg = {
                    id: `temp-${data.client_message_id || Date.now()}`,
                    client_message_id: data.client_message_id,
                    conversation_id: conversationId,
                    sender_id: user?.id,
                    text: data.text,
                    created_at: new Date().toISOString(),
                    status: 'sending',
                    meta: data.meta || {},
                    ...(data.attachment ? {
                        media_bucket: data.attachment.bucket,
                        media_object_path: data.attachment.objectPath,
                        metadata: {
                            ...(data.meta || {}),
                            attachment: {
                                mimeType: data.attachment.mimeType,
                                fileName: data.attachment.fileName,
                            },
                        },
                    } : {}),
                    reply_to_id: data.reply_to_id,
                    profiles: {
                        id: user?.id,
                        full_name: profile?.full_name,
                        avatar_url: profile?.avatar_url,
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
        onError: (_err, _newMessage, context: any) => {
            if (context?.previousQueries) {
                context.previousQueries.forEach(([key, data]: any) => {
                    queryClient.setQueryData(key, data);
                });
            }
        },
        onSuccess: (result: any) => {
            const confirmed = result?.message;
            if (!confirmed) return;
            queryClient.setQueriesData(
                { queryKey: ['conversation-messages', conversationId] },
                (oldData: any) => {
                    return reconcileMessagePages(oldData, confirmed);
                }
            );
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
    });
};

export const useUpdateMessageStatus = () => {
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
        mutationFn: (otherUserId: string) => apiClient.post('/conversations', { otherUserId }),
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
