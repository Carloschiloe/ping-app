import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { invalidateCommitmentViews } from '../api/query-invalidation';

// The server sends a direct signal to everyone involved as soon as a
// commitment or proposal is created, answered or changed. Refreshing on that
// signal makes it show up on the other phone at once, instead of waiting for
// the next periodic refresh (up to a minute).
export function useCommitmentSync() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`sync:user:${user.id}`)
            .on('broadcast', { event: 'commitments_changed' }, ({ payload }) => {
                const conversationId = typeof payload?.conversationId === 'string' ? payload.conversationId : null;
                invalidateCommitmentViews(queryClient, {
                    includeAgreementProposals: true,
                    conversationId,
                });
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, queryClient]);
}
