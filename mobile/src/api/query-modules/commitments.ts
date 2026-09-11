import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../client';
import { useAuth } from '../../context/AuthContext';
import {
    acceptCommitmentRequest, respondToCommitmentProposalRequest, confirmCommitmentProposalRequest,
    withdrawCommitmentProposalRequest,
} from './commitmentConfirmRequests';

export { acceptCommitmentRequest, respondToCommitmentProposalRequest, confirmCommitmentProposalRequest, withdrawCommitmentProposalRequest };

export const useReactToMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        // V2: la columna real de message_reactions es `reaction` (antes
        // `emoji`). El parametro del hook se mantiene como `emoji` para no
        // tocar los componentes que lo llaman (ReactionsModal, MessageItem).
        mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) => {
            if (!user) return;
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('*')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('reaction', emoji)
                .single();

            if (existing) {
                await supabase.from('message_reactions').delete().eq('id', existing.id);
            } else {
                await supabase.from('message_reactions').insert({
                    message_id: messageId,
                    user_id: user.id,
                    reaction: emoji,
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
        }
    });
};

export const useCommitments = (status?: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`commitments-live-${user.id}-${status || 'all'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'commitments',
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
                queryClient.invalidateQueries({ queryKey: ['insights'] });
                queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'commitment_proposals',
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
                queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient, status, user?.id]);

    return useQuery({
        queryKey: ['commitments', status],
        queryFn: async () => {
            const endpoint = status ? `/commitments?status=${status}` : '/commitments';
            const [commitments, proposals] = await Promise.all([
                apiClient.get(endpoint),
                status && status !== 'proposed'
                    ? Promise.resolve([])
                    : apiClient.get('/commitment-proposals'),
            ]);
            return [...(commitments || []), ...(proposals || [])];
        },
        refetchOnMount: 'always',
        refetchOnReconnect: 'always',
        refetchInterval: 5_000,
        refetchIntervalInBackground: false,
    });
};

export const useCreateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitments', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useCreateSharedCommitmentProposal = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitment-proposals/shared', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

// M-1H v2 (hallazgo real a nivel de RPC, ver
// supabase/migrations/20260730123000_shared_commitment_agreements.sql):
// respond_to_commitment_proposal EXIGE una fila previa en
// commitment_proposal_responses para (proposal_id, actor_user_id) --
// "Actor is not required for this agreement" (403) si no existe. Esa fila
// SÓLO la crea create_shared_commitment_proposal_with_responses (proposals
// COMPARTIDAS). Una proposal SOLO (creada vía POST /commitment-proposals,
// el caso real "Entrenar") nunca tiene esa fila -- llamar /respond para ella
// sólo cambia el error de 404 a 403, nunca la confirma. Ver
// resolveCommitmentConfirmAction en utils/commitmentConfirmDispatch.ts para
// el criterio real de cuál endpoint usar. (Request function en
// commitmentConfirmRequests.ts, importada arriba.)
export const useRespondToCommitmentProposal = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: respondToCommitmentProposalRequest,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
    });
};

// M-1H v2 — el endpoint REAL para confirmar una proposal SOLO (sin
// participantes/respuestas registradas): POST /commitment-proposals/:id/confirm
// -> confirmProposal (commitmentProposal.service.ts) -> RPC
// confirm_commitment_proposal, cuyo único guard es "el actor es el owner de
// la proposal" (no depende de commitment_proposal_responses en absoluto).
// Materializa inmediatamente el commitment canónico (proposal_id = este id,
// status='accepted') y marca la proposal status='confirmed'. Esta función ya
// existía sin usar en el backend (confirmProposal) pero nunca tuvo
// contraparte en mobile -- por eso el caso solo ("Entrenar") no tenía NINGÚN
// camino de confirmación funcional antes de este fix. (Request function en
// commitmentConfirmRequests.ts, importada arriba.)
export const useConfirmCommitmentProposal = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: confirmCommitmentProposalRequest,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
    });
};

// PROPOSAL UX — retirar (proposer-only) una commitment_proposal propia
// todavía pending. Mismo endpoint/RPC ya auditado (reject_commitment_proposal_with_evidence),
// nunca reutiliza useCancelCommitment (ese es el flujo de un commitment
// canónico ya materializado, con su propio endpoint/tabla/RPC distintos).
export const useWithdrawCommitmentProposal = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: withdrawCommitmentProposalRequest,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
    });
};

export const useAcceptCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: acceptCommitmentRequest,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useRejectCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string, reason: string }) =>
            apiClient.post(`/commitments/${id}/reject`, { reason }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        },
    });
};

export const usePostponeCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, newDate }: { id: string, newDate: string }) =>
            apiClient.post(`/commitments/${id}/postpone`, { newDate }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        },
    });
};

export const useUpdateCommitmentStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) =>
            apiClient.patch(`/commitments/${id}`, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

export const useUpdateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string, data: any }) =>
            apiClient.patch(`/commitments/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};

// Alias de compatibilidad: el backend traduce status:'completed' a la
// transicion real 'resolve' (ver backend/src/services/commitment.service.ts
// mapRequestedStatusToAction). Preferir useResolveCommitment en UI nueva.
export const useMarkCommitmentDone = () => {
    const { mutate, isPending } = useResolveCommitment();
    return {
        mutate: ({ id, result }: { id: string; result: string }) => mutate({ id, result }),
        isPending
    };
};

function useCommitmentLifecycleInvalidation() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ['insights'] });
        queryClient.invalidateQueries({ queryKey: ['commitments'] });
        queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['group-tasks-conv'] });
        queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
    };
}

// Ciclo de vida V2 (ver backend/src/routes/index.ts): estas llamadas usan
// los endpoints dedicados directamente en vez de pasar por el alias de
// compatibilidad de PATCH /commitments/:id.
export const useResolveCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, result }: { id: string; result: string }) =>
            apiClient.post(`/commitments/${id}/resolve`, { result }),
        onSuccess: invalidate,
    });
};

export const useCancelCommitment = () => {
    const queryClient = useQueryClient();
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
            apiClient.post(`/commitments/${id}/cancel`, { reason: reason?.trim() || null }),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ['commitments'] });
            const previous = queryClient.getQueriesData<any[]>({ queryKey: ['commitments'] });
            const source = previous
                .flatMap(([, data]) => Array.isArray(data) ? data : [])
                .find((item: any) => item.id === id);
            const cancelled = source ? { ...source, status: 'cancelled' } : null;

            previous.forEach(([key, data]) => {
                if (!Array.isArray(data)) return;
                const requestedStatus = Array.isArray(key) ? key[1] : undefined;
                let next = data;
                if (!requestedStatus) {
                    next = data.map((item: any) =>
                        item.id === id ? { ...item, status: 'cancelled' } : item
                    );
                } else if (requestedStatus === 'accepted') {
                    next = data.filter((item: any) => item.id !== id);
                } else if (requestedStatus === 'cancelled' && cancelled) {
                    next = [
                        cancelled,
                        ...data.filter((item: any) => item.id !== id),
                    ];
                }
                queryClient.setQueryData(key, next);
            });

            return { previous };
        },
        onError: (_error, _variables, context) => {
            context?.previous.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
        },
        onSettled: invalidate,
    });
};

export const useReopenCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/reopen`, {}),
        onSuccess: invalidate,
    });
};

export const useMarkActionCompleted = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/action-completed`, {}),
        onSuccess: invalidate,
    });
};

export const useCounterProposeCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, proposedDueAt }: { id: string, proposedDueAt: string }) =>
            apiClient.post(`/commitments/${id}/counter-propose`, { proposedDueAt }),
        onSuccess: invalidate,
    });
};

export const useReassignCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, assigned_to_user_id, counterparty_contact_id }: { id: string, assigned_to_user_id?: string | null, counterparty_contact_id?: string | null }) =>
            apiClient.post(`/commitments/${id}/reassign`, { assigned_to_user_id, counterparty_contact_id }),
        onSuccess: invalidate,
    });
};

export const useScheduleFollowUp = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    return useMutation({
        mutationFn: async ({ id, followUpAt, nextAction, waitingOnUserId, waitingOnContactId }: { id: string, followUpAt: string, nextAction?: string | null, waitingOnUserId?: string | null, waitingOnContactId?: string | null }) =>
            apiClient.post(`/commitments/${id}/follow-up`, { followUpAt, nextAction, waitingOnUserId, waitingOnContactId }),
        onSuccess: invalidate,
    });
};

// Contactos externos (contraparte de un commitment sin cuenta en Ping).
export const useContacts = () => {
    return useQuery({
        queryKey: ['contacts'],
        queryFn: async () => apiClient.get('/contacts'),
    });
};

export const useCreateContact = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { display_name: string; phone?: string | null; email?: string | null }) =>
            apiClient.post('/contacts', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
        },
    });
};

export const useDeleteCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.delete(`/commitments/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
        },
    });
};

export const useGroupTasks = () => {
    return useQuery({
        queryKey: ['group-tasks'],
        queryFn: async () => {
            return apiClient.get('/commitments?is_group_task=true');
        },
    });
};

export const useConversationGroupTasks = (conversationId: string | null) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!conversationId) return;
        // V2: la columna real de commitments es conversation_id
        // (group_conversation_id nunca existio en el esquema V2 — un filtro
        // de Realtime de Supabase se evalua contra la columna de Postgres,
        // asi que con el nombre viejo este canal nunca disparaba).
        const channel = supabase
            .channel(`group-tasks-${conversationId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commitments', filter: `conversation_id=eq.${conversationId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['commitments'] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commitment_proposals', filter: `conversation_id=eq.${conversationId}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commitment_proposal_responses' }, () => {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
                queryClient.invalidateQueries({ queryKey: ['agreement-proposals'] });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient]);

    return useQuery({
        queryKey: ['group-tasks-conv', conversationId, user?.id],
        queryFn: async () => {
            if (!conversationId) return [];
            const [commitments, proposals] = await Promise.all([
                apiClient.get(`/commitments?conversationId=${conversationId}`),
                apiClient.get(`/commitment-proposals?conversationId=${conversationId}`),
            ]);
            return [...(commitments || []), ...(proposals || [])];
        },
        enabled: !!conversationId,
    });
};
