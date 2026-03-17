import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

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
