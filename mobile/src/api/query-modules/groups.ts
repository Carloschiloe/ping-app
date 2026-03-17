import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

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

export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { full_name?: string; avatar_url?: string }) =>
            apiClient.patch('/user/profile', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
