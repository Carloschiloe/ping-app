import { useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
    useConversationMessages, 
    useSendConversationMessage, 
    useReactToMessage, 
    useMarkConversationAsRead 
} from '../api/queries';
import { useOfflineSync, PendingMessage } from './useOfflineSync';
import { apiClient } from '../api/client';

export function useChatMessages(conversationId: string, user: any, isFocused: boolean) {
    const queryClient = useQueryClient();

    // Sync Sender: tries to send a queued message via API
    const syncSender = useCallback(async (msg: PendingMessage) => {
        try {
            await apiClient.post(`/conversations/${msg.conversationId}/messages`, {
                text: msg.text,
                meta: msg.meta,
                // Add any other fields needed
            });
            return true;
        } catch (e) {
            console.warn('[ChatMessages] Sync failed', e);
            return false;
        }
    }, []);

    const { isConnected, queue, addToQueue } = useOfflineSync(syncSender);

    const {
        data: infiniteData,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useConversationMessages(conversationId);

    const { mutate: mutateSend, isPending: isSendingMutation } = useSendConversationMessage(conversationId);
    const { mutate: reactToMessage } = useReactToMessage(conversationId);
    const { mutate: markAsRead } = useMarkConversationAsRead(conversationId);

    const messages = useMemo(() => {
        const serverMessages = infiniteData?.pages.flatMap(page => page.messages) || [];
        
        // Filter queue messages for THIS conversation
        const pendingForThisConv = queue
            .filter(q => q.conversationId === conversationId)
            .map(q => ({
                id: q.id,
                conversation_id: q.conversationId,
                sender_id: user?.id,
                text: q.text,
                created_at: q.createdAt,
                status: 'pending_offline', // Special UI status
                meta: q.meta,
                profiles: {
                    full_name: user?.user_metadata?.full_name,
                    avatar_url: user?.user_metadata?.avatar_url,
                }
            }));

        // Merge and sort: pending first (they are the newest)
        return [...pendingForThisConv, ...serverMessages];
    }, [infiniteData, queue, conversationId, user]);

    // Enhanced Send Message
    const sendMessage = useCallback((data: any) => {
        mutateSend(data, {
            onError: (err: any) => {
                const errorMessage = err?.message || '';
                const isNetworkError = 
                    errorMessage.includes('Network') || 
                    errorMessage.includes('Failed to fetch') || 
                    errorMessage.includes('timeout') ||
                    !isConnected;

                if (isNetworkError) {
                    addToQueue({
                        id: `offline-${Date.now()}`,
                        conversationId,
                        userId: user?.id,
                        text: data.text,
                        meta: data.meta
                    });
                }
            }
        });
    }, [mutateSend, isConnected, addToQueue, conversationId, user]);

    // Realtime subscriptions
    useEffect(() => {
        if (!conversationId) return;

        const realtimeChannel = supabase
            .channel(`realtime-${conversationId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversations',
                filter: `id=eq.${conversationId}`
            }, (payload: any) => {
                const nextActiveCommitmentId = payload.new?.active_commitment_id || null;

                queryClient.setQueriesData({ queryKey: ['conversations'] }, (old: any) => {
                    if (!old?.conversations || !Array.isArray(old.conversations)) return old;

                    return {
                        ...old,
                        conversations: old.conversations.map((conversation: any) =>
                            conversation.id === conversationId
                                ? {
                                    ...conversation,
                                    mode: payload.new?.mode || conversation.mode,
                                    pinnedMessageId: payload.new?.pinned_message_id ?? conversation.pinnedMessageId,
                                    activeCommitmentId: nextActiveCommitmentId,
                                }
                                : conversation
                        ),
                    };
                });

                queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                    if (!old) return old;

                    const taskQueries = queryClient.getQueriesData({ queryKey: ['group-tasks-conv', conversationId] });
                    const groupTasks = taskQueries.flatMap(([, data]: any) => Array.isArray(data) ? data : []);
                    const nextActiveCommitment = nextActiveCommitmentId
                        ? groupTasks.find((task: any) => task.id === nextActiveCommitmentId) || old.activeCommitment
                        : null;

                    return {
                        ...old,
                        conversation: {
                            ...old.conversation,
                            mode: payload.new?.mode || old.conversation?.mode,
                            pinned_message_id: payload.new?.pinned_message_id ?? old.conversation?.pinned_message_id,
                            active_commitment_id: nextActiveCommitmentId,
                        },
                        activeCommitment: nextActiveCommitment,
                    };
                });

            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'conversation_operation_focuses',
                filter: `conversation_id=eq.${conversationId}`
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['insights'] });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'commitment_operation_progress'
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['insights'] });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'commitments'
            }, (payload: any) => {
                const currentPayload = payload.new || payload.old;
                if (currentPayload?.group_conversation_id === conversationId) {
                    queryClient.setQueriesData({ queryKey: ['group-tasks-conv', conversationId] }, (old: any) => {
                        if (!Array.isArray(old)) return old;
                        const exists = old.some((task: any) => task.id === currentPayload.id);
                        if (!exists && payload.eventType === 'INSERT' && payload.new) {
                            return [payload.new, ...old];
                        }

                        if (payload.eventType === 'DELETE') {
                            return old.filter((task: any) => task.id !== currentPayload.id);
                        }

                        return old.map((task: any) => task.id === currentPayload.id ? { ...task, ...payload.new, meta: payload.new?.meta ?? task.meta } : task);
                    });

                    queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                        if (!old?.activeCommitment || old.activeCommitment.id !== currentPayload.id) return old;
                        if (payload.eventType === 'DELETE') {
                            return { ...old, activeCommitment: null };
                        }
                        return {
                            ...old,
                            activeCommitment: {
                                ...old.activeCommitment,
                                ...payload.new,
                                meta: payload.new?.meta ?? old.activeCommitment.meta,
                            },
                        };
                    });
                }
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
                queryClient.invalidateQueries({ queryKey: ['insights'] });
            })
            .subscribe();

        return () => {
            realtimeChannel.unsubscribe();
        };
    }, [conversationId, queryClient]);

    // Mark as read logic
    useEffect(() => {
        if (!messages || messages.length === 0 || !user || !isFocused) return;

        const hasUnread = messages.some((msg: any) => {
            const isSystem = msg.meta?.isSystem;
            const isMe = msg.sender_id === user.id;
            return !isMe && !isSystem && msg.status !== 'read';
        });

        if (hasUnread) {
            markAsRead(undefined);
        }
    }, [messages, user, isFocused, markAsRead]);

    return {
        messages,
        isLoading,
        isSending: isSendingMutation || queue.some(q => q.conversationId === conversationId),
        isConnected, 
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        sendMessage,
        reactToMessage,
        markAsRead
    };
}
