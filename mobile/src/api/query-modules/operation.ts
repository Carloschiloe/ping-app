import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { normalizeCommitmentStatus } from '../../utils/commitmentStatus';

export const useConversationOperationState = (conversationId: string | null) => {
    return useQuery({
        queryKey: ['conversation-operation-state', conversationId],
        queryFn: async () => {
            if (!conversationId) return null;
            return apiClient.get(`/conversations/${conversationId}/operation-state`);
        },
        enabled: !!conversationId,
    });
};

export const useUpdateConversationMode = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (mode: 'chat' | 'operation') => apiClient.patch(`/conversations/${conversationId}/mode`, { mode }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useSetPinnedMessage = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (messageId: string | null) => apiClient.patch(`/conversations/${conversationId}/pin`, { messageId }),
        onMutate: async (messageId) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);
            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => old ? {
                ...old,
                conversation: {
                    ...old.conversation,
                    pinned_message_id: messageId,
                },
                pinnedMessage: messageId ? old.pinnedMessage : null,
            } : old);
            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useSetActiveOperationCommitment = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (commitmentId: string | null) => apiClient.patch(`/conversations/${conversationId}/active-commitment`, { commitmentId }),
        onMutate: async (commitmentId) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);
            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;
                const groupTaskQueries = queryClient.getQueriesData({ queryKey: ['group-tasks-conv', conversationId] });
                const groupTasks = groupTaskQueries.flatMap(([, data]: any) => Array.isArray(data) ? data : []);
                const activeCommitment = commitmentId
                    ? groupTasks.find((task: any) => task.id === commitmentId) || old.activeCommitment
                    : null;

                return {
                    ...old,
                    conversation: {
                        ...old.conversation,
                        active_commitment_id: commitmentId,
                    },
                    myFocus: commitmentId ? { ...(old.myFocus || {}), conversation_id: conversationId, commitment_id: commitmentId } : null,
                    activeCommitment,
                };
            });
            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        },
    });
};

export const useSaveOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: { checklistId?: string | null; title: string; items: Array<string | { label: string; responseType?: 'condition' | 'severity' | 'yes_no' | 'text' }>; categoryLabel?: string | null; responsibleUserId?: string | null; responsibleRoleLabel?: string | null; frequency?: 'manual' | 'daily' | 'shift' }) => apiClient.post(`/conversations/${conversationId}/checklists`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useDuplicateOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.post(`/conversations/${conversationId}/checklists/${checklistId}/duplicate`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useArchiveOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.patch(`/conversations/${conversationId}/checklists/${checklistId}/archive`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useRestoreOperationChecklist = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (checklistId: string) => apiClient.patch(`/conversations/${conversationId}/checklists/${checklistId}/restore`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

export const useToggleOperationChecklistItem = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, result }: { id: string; result: 'good' | 'regular' | 'bad' | 'na' | 'high' | 'medium' | 'low' | 'yes' | 'no' | null }) =>
            apiClient.patch(`/operation-checklist-run-items/${id}/toggle`, { result }),
        onMutate: async ({ id, result }) => {
            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previous = queryClient.getQueryData(['conversation-operation-state', conversationId]);

            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;

                const updateChecklist = (checklist: any) => {
                    if (!checklist?.run?.items) return checklist;
                    return {
                        ...checklist,
                        run: {
                            ...checklist.run,
                            items: checklist.run.items.map((item: any) =>
                                item.id === id
                                    ? {
                                        ...item,
                                        is_checked: !!result,
                                        result,
                                        checked_at: result ? new Date().toISOString() : null,
                                        profiles: result ? item.profiles || { full_name: 'Tú' } : null,
                                    }
                                    : item
                            ),
                        },
                    };
                };

                return {
                    ...old,
                    activeChecklist: updateChecklist(old.activeChecklist),
                    checklists: Array.isArray(old.checklists) ? old.checklists.map(updateChecklist) : old.checklists,
                };
            });

            return { previous };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(['conversation-operation-state', conversationId], context.previous);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', conversationId] });
        },
    });
};

function applyOperationActionToCommitment(
    commitment: any,
    action: 'acknowledged' | 'arrived' | 'completed',
    completionNote?: string | null,
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null
) {
    if (!commitment) return commitment;

    const now = new Date().toISOString();
    const meta = { ...(commitment.meta || {}) };
    const operational = { ...(meta.operational || {}) };

    if (action === 'acknowledged') {
        operational.acknowledged_at = now;
        if (normalizeCommitmentStatus(commitment.status) === 'proposed') {
            commitment = { ...commitment, status: 'accepted' };
        }
    }

    if (action === 'arrived') {
        operational.arrived_at = now;
        if (normalizeCommitmentStatus(commitment.status) === 'proposed') {
            commitment = { ...commitment, status: 'accepted' };
        }
    }

    if (action === 'completed') {
        operational.completed_at = now;
        operational.completion_note = completionNote || null;
        operational.completion_outcome = completionOutcome || 'resolved';
        commitment = { ...commitment, status: 'completed' };
    }

    return {
        ...commitment,
        meta: {
            ...meta,
            operational,
        },
    };
}

function updateGroupTaskCaches(
    queryClient: any,
    conversationId: string,
    commitmentId: string,
    action: 'acknowledged' | 'arrived' | 'completed',
    completionNote?: string | null,
    completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null
) {
    const taskQueries = queryClient.getQueriesData({ queryKey: ['group-tasks-conv', conversationId] });

    taskQueries.forEach(([key, data]: any) => {
        if (!Array.isArray(data)) return;
        queryClient.setQueryData(
            key,
            data.map((task: any) => task.id === commitmentId
                ? applyOperationActionToCommitment(task, action, completionNote, completionOutcome)
                : task)
        );
    });
}

export const useCommitmentOperationAction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, action, location_message_id, conversationId, completion_note, completion_outcome }: { id: string; action: 'acknowledged' | 'arrived' | 'completed'; location_message_id?: string | null; conversationId?: string; completion_note?: string | null; completion_outcome?: 'resolved' | 'pending_followup' | 'needs_review' | null }) =>
            apiClient.post(`/commitments/${id}/operation-action`, { action, location_message_id, conversationId, completion_note, completion_outcome }),
        onMutate: async (variables) => {
            const { conversationId, id, action, completion_note, completion_outcome } = variables;
            if (!conversationId) return {};

            await queryClient.cancelQueries({ queryKey: ['conversation-operation-state', conversationId] });
            const previousOperationState = queryClient.getQueryData(['conversation-operation-state', conversationId]);

            updateGroupTaskCaches(queryClient, conversationId, id, action, completion_note, completion_outcome);

            queryClient.setQueryData(['conversation-operation-state', conversationId], (old: any) => {
                if (!old) return old;
                if (!old.activeCommitment || old.activeCommitment.id !== id) return old;

                return {
                    ...old,
                    conversation: {
                        ...old.conversation,
                        active_commitment_id: action === 'completed' ? null : old.conversation?.active_commitment_id,
                    },
                    myFocus: action === 'completed' ? null : old.myFocus,
                    activeCommitment: action === 'completed'
                        ? null
                        : applyOperationActionToCommitment(old.activeCommitment, action, completion_note, completion_outcome),
                };
            });

            return { previousOperationState };
        },
        onError: (_error, variables, context: any) => {
            if (variables.conversationId && context?.previousOperationState) {
                queryClient.setQueryData(['conversation-operation-state', variables.conversationId], context.previousOperationState);
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', variables.conversationId] });
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['insights'] });
            queryClient.invalidateQueries({ queryKey: ['commitments'] });
            queryClient.invalidateQueries({ queryKey: ['all-commitments-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['group-tasks'] });
            if (variables.conversationId) {
                queryClient.invalidateQueries({ queryKey: ['group-tasks-conv', variables.conversationId] });
                queryClient.invalidateQueries({ queryKey: ['conversation-operation-state', variables.conversationId] });
            }
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
        },
    });
};
