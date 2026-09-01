import { createConversationWithParticipants } from './conversationApplication.service';

export const getOrCreateSelfConversationId = async (userId: string): Promise<string> => {
    return createConversationWithParticipants({
        creatorUserId: userId,
        type: 'direct',
        participantUserIds: [userId],
        reuseExisting: true,
    });
};

export const getOrCreateDirectConversationId = async (
    userId: string,
    otherUserId: string,
): Promise<string> => {
    return createConversationWithParticipants({
        creatorUserId: userId,
        type: 'direct',
        participantUserIds: [userId, otherUserId],
        reuseExisting: true,
    });
};
