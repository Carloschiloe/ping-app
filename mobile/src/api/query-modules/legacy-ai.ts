import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

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
