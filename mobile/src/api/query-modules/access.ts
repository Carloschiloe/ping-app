// The person's free trial and plan, for the banner in Hoy.
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../client';

export type AccessStatus = 'trial' | 'trial_ending' | 'expired' | 'paid' | 'free_access' | 'suspended';

export interface Access {
    status: AccessStatus;
    trialEndsAt: string | null;
    daysLeft: number | null;
    enforced: boolean;
    locked: boolean;
}

export const ACCESS_KEY = ['access'];

export const useAccess = (enabled = true) => useQuery({
    queryKey: ACCESS_KEY,
    queryFn: async () => (await apiClient.get('/user/access')) as Access,
    enabled,
    staleTime: 5 * 60_000,
});
