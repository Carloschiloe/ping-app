import type { QueryClient, QueryKey } from '@tanstack/react-query';

type CommitmentViewInvalidationOptions = {
    includeInsights?: boolean;
    includeAgreementProposals?: boolean;
    includeConversationMessages?: boolean;
    includeGroupTasks?: boolean;
    includeConversationGroupTasks?: boolean;
    includeAgentTurns?: boolean;
    conversationId?: string | null;
};

/** Keeps commitment-related projections in sync after lifecycle mutations. */
export function invalidateCommitmentViews(
    queryClient: QueryClient,
    options: CommitmentViewInvalidationOptions = {},
): void {
    const {
        includeInsights = true,
        includeAgreementProposals = false,
        includeConversationMessages = true,
        includeGroupTasks = true,
        includeConversationGroupTasks = true,
        includeAgentTurns = false,
        conversationId = null,
    } = options;

    const queryKeys: QueryKey[] = [];
    if (includeInsights) queryKeys.push(['insights']);
    queryKeys.push(['commitments'], ['all-commitments-dashboard']);
    if (includeGroupTasks) queryKeys.push(['group-tasks']);
    if (includeConversationGroupTasks) {
        queryKeys.push(conversationId ? ['group-tasks-conv', conversationId] : ['group-tasks-conv']);
    }
    if (includeConversationMessages) queryKeys.push(['conversation-messages']);
    if (includeAgreementProposals) queryKeys.push(['agreement-proposals']);
    if (includeAgentTurns) queryKeys.push(['agent-conversation-turns']);

    queryKeys.forEach(queryKey => {
        void queryClient.invalidateQueries({ queryKey });
    });
}
