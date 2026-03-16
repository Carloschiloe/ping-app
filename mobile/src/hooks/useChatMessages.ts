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
            console.warn('[ChatMessages] Sync failed:', e);
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
        
        if (serverMessages.length > 0) {
            const mediaSample = serverMessages.filter(m => m.text?.startsWith('[')).length;
            console.warn(`[DEBUG-HOOK] Conv: ${conversationId.substring(0,8)} | Msgs: ${serverMessages.length} | Media-ish: ${mediaSample}`);
        }

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
                    console.log('[ChatMessages] Network error detected, adding to offline queue');
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
                event: '*',
                schema: 'public',
                table: 'message_reactions'
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                console.warn('[DEBUG-REALTIME] Message UPDATE received. ID:', payload.new.id, 'Meta:', JSON.stringify(payload.new.meta));
                queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'commitments'
            }, (payload: any) => {
                console.warn('[DEBUG-REALTIME] Commitment CHANGE received:', payload.eventType, 'Status:', payload.new?.status);
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
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
