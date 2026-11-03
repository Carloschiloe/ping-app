import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../client';
import { invalidateCommitmentViews } from '../query-invalidation';
import { useAuth } from '../../context/AuthContext';
import {
    acceptCommitmentRequest, respondToCommitmentProposalRequest, confirmCommitmentProposalRequest,
    withdrawCommitmentProposalRequest,
} from './commitmentConfirmRequests';

export { acceptCommitmentRequest, respondToCommitmentProposalRequest, confirmCommitmentProposalRequest, withdrawCommitmentProposalRequest };

// Reactions go through the server, which checks the person is in the chat.
// The emoji shows up at once (optimistic) and is taken back if saving fails.
export const useReactToMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const queryKey = ['conversation-messages', conversationId];

    const toggleInCache = (messageId: string, emoji: string) => {
        queryClient.setQueriesData({ queryKey }, (data: any) => {
            if (!data?.pages || !user) return data;
            return {
                ...data,
                pages: data.pages.map((page: any) => ({
                    ...page,
                    messages: (page.messages || []).map((message: any) => {
                        if (message.id !== messageId) return message;
                        const reactions: any[] = message.message_reactions || [];
                        const mine = reactions.find((r) => r.user_id === user.id && (r.reaction ?? r.emoji) === emoji);
                        return {
                            ...message,
                            message_reactions: mine
                                ? reactions.filter((r) => r !== mine)
                                : [...reactions, { id: `local-${emoji}`, message_id: messageId, user_id: user.id, emoji }],
                        };
                    }),
                })),
            };
        });
    };

    return useMutation({
        mutationFn: async ({ messageId, emoji }: { messageId: string, emoji: string }) =>
            apiClient.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, { reaction: emoji }),
        onMutate: async ({ messageId, emoji }) => {
            await queryClient.cancelQueries({ queryKey });
            toggleInCache(messageId, emoji);
        },
        onError: (_error, { messageId, emoji }) => {
            toggleInCache(messageId, emoji);
            Alert.alert('No se guardó la reacción', 'Revisa tu conexión e inténtalo de nuevo.');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });
};


export const useCreateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitments', data),
        onSuccess: () => {
            invalidateCommitmentViews(queryClient);
        },
    });
};

export const useCreateSharedCommitmentProposal = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => apiClient.post('/commitment-proposals/shared', data),
        onSuccess: () => {
            invalidateCommitmentViews(queryClient, { includeInsights: false, includeAgreementProposals: true });
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
            invalidateCommitmentViews(queryClient, { includeAgreementProposals: true });
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
            invalidateCommitmentViews(queryClient, { includeAgreementProposals: true });
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
            invalidateCommitmentViews(queryClient, { includeAgreementProposals: true });
        },
    });
};

export const useAcceptCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: acceptCommitmentRequest,
        onSuccess: () => {
            invalidateCommitmentViews(queryClient);
        },
    });
};

export const useRejectCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string, reason: string }) =>
            apiClient.post(`/commitments/${id}/reject`, { reason }),
        onSuccess: () => {
            invalidateCommitmentViews(queryClient, { includeConversationMessages: false });
        },
    });
};



export const useUpdateCommitment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: string, data: any }) =>
            apiClient.patch(`/commitments/${id}`, data),
        onSuccess: () => {
            invalidateCommitmentViews(queryClient);
        },
    });
};


// PING — LIFECYCLE INVALIDATION OWNER: agreement-proposals was missing here
// while useAgentTurn (mobile/src/api/query-modules/agent.ts) already
// invalidates it on every Agent-driven lifecycle mutation -- the same
// commitment_proposals-affecting transitions (resolve/cancel/reopen/
// counter-propose/reassign) can change what Compromisos/Hoy's proposals
// section should show (e.g. reassign changes proposed_responsible_user_id,
// counter-propose changes latest_counterproposal_due_at), so a manual
// (non-Agent) mutation through this canonical owner must invalidate the
// same projection the Agent path already does. Adding it HERE (the single
// canonical owner) rather than duplicating it into each of the 7 call
// sites individually -- several already did that ad hoc (see
// useCreateSharedCommitmentProposal etc. above), which is exactly the
// one-off drift this owner exists to prevent.
function useCommitmentLifecycleInvalidation() {
    const queryClient = useQueryClient();
    return () => {
        invalidateCommitmentViews(queryClient, { includeAgreementProposals: true });
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

// PING — ARCHIVE UX AUDIT + IMPLEMENTATION: dueño canónico ya existía en
// backend (commitment.service.ts archiveCommitment -> RPC
// archive_commitment_with_evidence, sólo llena archived_at, status
// permanece igual -- ver backend/tests/commitmentService.test.ts) y ya
// estaba expuesto en DELETE /commitments/:id (deleteCommitment es alias de
// archiveCommitment), pero ningún componente mobile importaba este hook
// (useDeleteCommitment, antes con este mismo nombre y una invalidación
// obsoleta ['commitments'] -- la query real que usan Hoy/Compromisos es
// ['all-commitments-dashboard'], ver useCommitmentLifecycleInvalidation).
// Por eso NINGUNA UI ofrecía "Archivar": el endpoint/RPC/campo ya
// funcionaban de punta a punta, sólo faltaba el wiring. Renombrado a
// useArchiveCommitment (nombre de dominio real, nunca "delete" -- esto
// nunca borra la fila) y reutiliza la misma invalidación canónica que
// cancel/resolve/reopen.
export const useArchiveCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.delete(`/commitments/${id}`),
        onSuccess: () => {
            invalidate();
            // PING — ARCHIVE LIFECYCLE COMPLETION: la lista de archivados es
            // una query separada (['archived-commitments'], nunca mezclada
            // con ['all-commitments-dashboard']) -- debe refrescarse también
            // para que un archive recién hecho aparezca ahí sin necesitar un
            // pull-to-refresh manual.
            queryClient.invalidateQueries({ queryKey: ['archived-commitments'] });
        },
    });
};

// PING — ARCHIVE LIFECYCLE COMPLETION: retrieval explícita y separada para
// la vista Archivados -- GET /commitments/archived es un endpoint nuevo,
// nunca una variante de GET /commitments (que sigue excluyendo
// archived_at incondicionalmente, ver backend/commitment.service.ts
// getCommitments). Reutiliza el mismo shape de commitment que ya consumen
// CommitmentRow.tsx/CommitmentDetailSheet.tsx.
export const useArchivedCommitments = () => {
    return useQuery({
        queryKey: ['archived-commitments'],
        queryFn: async () => apiClient.get('/commitments/archived'),
    });
};

// PING — ARCHIVE LIFECYCLE COMPLETION: contraparte simétrica de
// useArchiveCommitment -- POST /commitments/:id/restore (RPC
// restore_commitment_with_evidence) limpia archived_at únicamente, el
// status canónico permanece exactamente igual (ver backend
// commitmentService.test.ts "restaurar un commitment archivado conserva su
// status"). Invalida AMBAS queries: la lista de archivados (el item ya no
// pertenece ahí) y el dashboard canónico (el item vuelve a aparecer en
// Pendientes/Encargados/Historial según su status real, sin necesitar
// ninguna transición adicional).
export const useRestoreCommitment = () => {
    const invalidate = useCommitmentLifecycleInvalidation();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => apiClient.post(`/commitments/${id}/restore`, {}),
        onSuccess: () => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['archived-commitments'] });
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
