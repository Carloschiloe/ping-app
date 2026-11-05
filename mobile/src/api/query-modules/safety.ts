// Account deletion, blocks, reports and feedback (Google Play and Ley 21.719).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

export type ReportReason = 'spam' | 'abuse' | 'inappropriate' | 'false' | 'other';

export interface BlockedPerson {
    id: string;
    full_name: string | null;
    blocked_at: string;
}

export interface ChatBlock {
    blockedByMe: boolean;
    blockedMe: boolean;
    otherUserId: string | null;
}

const BLOCKS_KEY = ['blocks'];
const chatBlockKey = (conversationId: string) => ['chat-block', conversationId];

export const useBlockedPeople = (enabled = true) => useQuery({
    queryKey: BLOCKS_KEY,
    queryFn: async () => ((await apiClient.get('/blocks')) as { blocks: BlockedPerson[] }).blocks,
    enabled,
});

export const useChatBlock = (conversationId: string | undefined, enabled = true) => useQuery({
    queryKey: chatBlockKey(conversationId || ''),
    queryFn: async () => (await apiClient.get(`/conversations/${conversationId}/block`)) as ChatBlock,
    enabled: enabled && !!conversationId,
    staleTime: 30_000,
});

export const useSetBlocked = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) => (blocked
            ? apiClient.post(`/blocks/${userId}`, {})
            : apiClient.delete(`/blocks/${userId}`)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
            queryClient.invalidateQueries({ queryKey: ['chat-block'] });
        },
    });
};

export const useReport = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            kind: 'user' | 'message' | 'assistant';
            reason: ReportReason;
            details?: string;
            reportedUserId?: string;
            conversationId?: string;
            messageId?: string;
            excerpt?: string;
            alsoBlock?: boolean;
        }) => apiClient.post('/reports', input),
        onSuccess: (_data, input) => {
            if (input.alsoBlock) {
                queryClient.invalidateQueries({ queryKey: BLOCKS_KEY });
                queryClient.invalidateQueries({ queryKey: ['chat-block'] });
            }
        },
    });
};

export const useSendFeedback = () => useMutation({
    mutationFn: (input: { kind: 'idea' | 'problem' | 'other'; message: string; appVersion?: string; platform?: string }) =>
        apiClient.post('/feedback', input),
});

export const useDeleteAccount = () => useMutation({
    mutationFn: () => apiClient.post('/user/account/delete', { confirm: 'ELIMINAR' }),
});
