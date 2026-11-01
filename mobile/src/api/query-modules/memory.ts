// M11 — what Ping remembers about the user, as shown and edited in Perfil.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

export interface RememberedFact {
    id: string;
    text: string;
    createdAt: string;
}

const MEMORY_FACTS_KEY = ['memory-facts'];

export const useRememberedFacts = (enabled = true) => {
    return useQuery({
        queryKey: MEMORY_FACTS_KEY,
        queryFn: async () => ((await apiClient.get('/memory/facts')) as { facts: RememberedFact[] }).facts,
        enabled,
    });
};

export const useForgetFact = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiClient.delete(`/memory/facts/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: MEMORY_FACTS_KEY });
        },
    });
};
