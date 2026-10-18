import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { buildCaptureRequest, type CaptureRequest } from '../../types/capture';

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
        mutationFn: async (input: CaptureRequest | string) => {
            const request = typeof input === 'string'
                ? buildCaptureRequest(input, 'quick_capture')
                : input;

            return apiClient.post('/messages', {
                text: request.text,
                client_message_id: request.clientMessageId,
                meta: request.meta,
            });
        },
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

export const useAIHealth = () => {
    return useQuery({
        queryKey: ['ai-health'],
        queryFn: () => apiClient.get('/ai/health'),
        retry: 1,
        staleTime: 30_000,
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
