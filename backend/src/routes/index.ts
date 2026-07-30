import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as messageController from '../controllers/message.controller';
import * as commitmentController from '../controllers/commitment.controller';
import * as searchController from '../controllers/search.controller';
import * as pushController from '../controllers/push.controller';
import * as conversationController from '../controllers/conversation.controller';
import * as userController from '../controllers/user.controller';
import * as groupController from '../controllers/group.controller';
import * as aiController from '../controllers/ai.controller';
import * as insightsController from '../controllers/insights.controller';
import * as calendarController from '../controllers/calendar.controller';
import * as agoraController from '../controllers/agora.controller';
import * as operationController from '../controllers/operation.controller';
import * as contactController from '../controllers/contact.controller';
import * as privateFileController from '../controllers/privateFile.controller';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { validateRequest } from '../middleware/validate';
import * as groupSchema from '../schemas/group.schema';
import * as commitmentSchema from '../schemas/commitment.schema';
import * as messageSchema from '../schemas/message.schema';
import * as operationSchema from '../schemas/operation.schema';
import * as contactSchema from '../schemas/contact.schema';
import * as privateFileSchema from '../schemas/privateFile.schema';
import * as conversationInvitationSchema from '../schemas/conversationInvitation.schema';
import {
    requireFeature,
    requirePrivateFileFeature,
} from '../middleware/featureGate';

export const router = Router();
const operationEnabled = requireFeature('ENABLE_OPERATION_MODULE');
const calendarEnabled = requireFeature('ENABLE_CALENDAR_INTEGRATION');
const callsEnabled = requireFeature('ENABLE_CALLS');
const privateFileReadsEnabled = requirePrivateFileFeature('ENABLE_PRIVATE_FILE_READS');
const privateFileUploadsEnabled = requirePrivateFileFeature('ENABLE_PRIVATE_FILE_UPLOADS');
const privateAvatarUploadsEnabled = requirePrivateFileFeature('ENABLE_PRIVATE_AVATAR_UPLOADS');
const privateMessageUploadsEnabled = requirePrivateFileFeature('ENABLE_PRIVATE_MESSAGE_UPLOADS');

// Health
router.get('/health', async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('profiles').select('count', { count: 'exact', head: true });
        if (error) throw error;
        res.json({
            ok: true,
            db_status: 'connected',
            commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
            deployment_marker: 'staging-auto-deploy-v1',
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ ok: false, error: 'Database connection failed' });
    }
});

// Push
router.post('/push/token', requireAuth, pushController.saveToken);

// Users
router.get('/users', requireAuth, userController.search);
router.post('/users/sync-contacts', requireAuth, userController.syncContacts);
router.patch('/user/profile', requireAuth, userController.updateProfile);


// Conversations
router.post('/conversations/self', requireAuth, conversationController.createSelf);
router.post('/conversations', requireAuth, conversationController.createOrFind);
router.post(
    '/conversation-invitations',
    requireAuth,
    validateRequest(conversationInvitationSchema.createInvitationSchema),
    conversationController.createInvitation
);
router.post(
    '/conversation-invitations/accept',
    requireAuth,
    validateRequest(conversationInvitationSchema.acceptInvitationSchema),
    conversationController.acceptInvitation
);

router.get('/conversations', requireAuth, conversationController.list);
router.get('/conversations/:id/messages', requireAuth, conversationController.getMessages);
router.get('/conversations/:id/media', requireAuth, conversationController.getConversationMedia);
router.post('/conversations/:id/messages', requireAuth, validateRequest(messageSchema.sendMessageSchema), conversationController.sendMessage);
router.get('/conversations/:id/participants', requireAuth, groupController.getParticipants);
router.get('/conversations/:id/operation-state', requireAuth, operationEnabled, operationController.getConversationOperationState);
router.patch('/conversations/:id/mode', requireAuth, operationEnabled, validateRequest(operationSchema.updateConversationModeSchema), operationController.updateConversationMode);
router.patch('/conversations/:id/pin', requireAuth, operationEnabled, validateRequest(operationSchema.setPinnedMessageSchema), operationController.setPinnedMessage);
router.patch('/conversations/:id/active-commitment', requireAuth, operationEnabled, validateRequest(operationSchema.setActiveCommitmentSchema), operationController.setActiveCommitment);
router.post('/conversations/:id/checklists', requireAuth, operationEnabled, validateRequest(operationSchema.saveChecklistSchema), operationController.saveChecklistTemplate);
router.post('/conversations/:id/checklists/:checklistId/duplicate', requireAuth, operationEnabled, validateRequest(operationSchema.checklistActionSchema), operationController.duplicateChecklistTemplate);
router.patch('/conversations/:id/checklists/:checklistId/archive', requireAuth, operationEnabled, validateRequest(operationSchema.checklistActionSchema), operationController.archiveChecklistTemplate);
router.patch('/conversations/:id/checklists/:checklistId/restore', requireAuth, operationEnabled, validateRequest(operationSchema.checklistActionSchema), operationController.restoreChecklistTemplate);
router.post('/conversations/:id/shift-reports', requireAuth, operationEnabled, validateRequest(operationSchema.createShiftReportSchema), operationController.createShiftReport);
router.patch('/conversations/:id/read', requireAuth, conversationController.markAsRead);
router.patch('/conversations/:id/archive', requireAuth, conversationController.toggleArchive);
router.post('/conversations/:id/ping', requireAuth, conversationController.pingConversation);

// Groups
router.post('/groups', requireAuth, validateRequest(groupSchema.createGroupSchema), groupController.createGroup);
router.patch('/groups/:id', requireAuth, validateRequest(groupSchema.updateGroupSchema), groupController.updateGroup);
router.post('/groups/:id/participants', requireAuth, validateRequest(groupSchema.addParticipantsSchema), groupController.addParticipants);
router.patch('/groups/:id/participants/:userId/role', requireAuth, validateRequest(groupSchema.updateParticipantRoleSchema), groupController.updateParticipantRole);
router.delete('/groups/:id', requireAuth, validateRequest(groupSchema.deleteGroupSchema), groupController.deleteGroup);

// Legacy self-chat message routes (kept for backward compatibility)
router.post('/messages', requireAuth, messageController.createMessage);
router.get('/messages', requireAuth, messageController.getMessages);
router.patch('/messages/:id/status', requireAuth, messageController.updateMessageStatus);
router.delete('/messages/:id', requireAuth, messageController.deleteMessage);

// Commitments
router.get('/commitments/check-conflict', requireAuth, commitmentController.checkConflict);
router.get('/commitments', requireAuth, commitmentController.getCommitments);
router.post('/commitments', requireAuth, validateRequest(commitmentSchema.createCommitmentSchema), commitmentController.createCommitment);
router.post('/commitment-proposals', requireAuth, validateRequest(commitmentSchema.createCommitmentSchema), commitmentController.createProposal);
router.post('/commitment-proposals/:id/confirm', requireAuth, validateRequest(commitmentSchema.proposalDecisionSchema), commitmentController.confirmProposal);
router.post('/commitment-proposals/:id/reject', requireAuth, validateRequest(commitmentSchema.proposalDecisionSchema), commitmentController.rejectProposal);
router.post('/commitments/:id/accept', requireAuth, commitmentController.acceptCommitment);
router.post('/commitments/:id/reject', requireAuth, validateRequest(commitmentSchema.rejectCommitmentSchema), commitmentController.rejectCommitment);
router.post('/commitments/:id/postpone', requireAuth, validateRequest(commitmentSchema.postponeCommitmentSchema), commitmentController.postponeCommitment);
router.post('/commitments/:id/counter-propose', requireAuth, validateRequest(commitmentSchema.counterProposeCommitmentSchema), commitmentController.counterProposeCommitment);
router.post('/commitments/:id/action-completed', requireAuth, commitmentController.markActionCompleted);
router.post('/commitments/:id/resolve', requireAuth, validateRequest(commitmentSchema.resolveCommitmentSchema), commitmentController.resolveCommitment);
router.post('/commitments/:id/cancel', requireAuth, commitmentController.cancelCommitment);
router.post('/commitments/:id/reopen', requireAuth, commitmentController.reopenCommitment);
router.post('/commitments/:id/reassign', requireAuth, validateRequest(commitmentSchema.reassignCommitmentSchema), commitmentController.reassignCommitment);
router.post('/commitments/:id/follow-up', requireAuth, validateRequest(commitmentSchema.scheduleFollowUpSchema), commitmentController.scheduleFollowUp);
router.post('/commitments/:id/ping', requireAuth, commitmentController.pingCommitment);
router.post('/commitments/:id/operation-action', requireAuth, operationEnabled, validateRequest(operationSchema.commitmentOperationActionSchema), operationController.registerCommitmentOperationAction);
router.patch('/commitments/:id', requireAuth, validateRequest(commitmentSchema.updateCommitmentSchema), commitmentController.updateCommitment);
router.delete('/commitments/:id', requireAuth, commitmentController.deleteCommitment);

router.patch('/operation-checklist-run-items/:id/toggle', requireAuth, operationEnabled, validateRequest(operationSchema.toggleChecklistItemSchema), operationController.toggleChecklistItem);

// Contactos externos (contraparte de un commitment sin cuenta en Ping)
router.post('/contacts', requireAuth, validateRequest(contactSchema.createContactSchema), contactController.createContact);
router.get('/contacts', requireAuth, contactController.getContacts);
router.get('/contacts/:id', requireAuth, validateRequest(contactSchema.getContactSchema), contactController.getContact);

// Search
router.get('/search', requireAuth, searchController.search);

// Private file reads and uploads have independent gates. Authorization on the
// owning resource is still enforced by the service before issuing any URL.
router.post(
    '/files/read-url',
    requireAuth,
    privateFileReadsEnabled,
    validateRequest(privateFileSchema.createPrivateFileReadUrlSchema),
    privateFileController.createReadUrl
);
router.post(
    '/files/upload-url',
    requireAuth,
    privateFileUploadsEnabled,
    validateRequest(privateFileSchema.createPrivateFileUploadUrlSchema),
    privateFileController.createUploadUrl
);
router.post(
    '/files/profile-avatar/upload-url',
    requireAuth,
    privateAvatarUploadsEnabled,
    validateRequest(privateFileSchema.createProfileAvatarUploadUrlSchema),
    privateFileController.createProfileAvatarUploadUrl
);
router.post(
    '/files/profile-avatar/complete',
    requireAuth,
    privateAvatarUploadsEnabled,
    validateRequest(privateFileSchema.completeProfileAvatarSchema),
    privateFileController.completeProfileAvatar
);
router.post(
    '/files/message-attachment/upload-url',
    requireAuth,
    privateMessageUploadsEnabled,
    validateRequest(privateFileSchema.createMessageAttachmentUploadUrlSchema),
    privateFileController.createMessageAttachmentUploadUrl
);

// AI
router.get('/ai/health', requireAuth, (req, res) => res.json({ ok: true, version: '2.1', routes: ['ask', 'summarize', 'analyze-message'] }));
router.post('/ai/ask', requireAuth, aiController.askPing);
router.get('/ai/history', requireAuth, aiController.getHistory);
router.delete('/ai/history', requireAuth, aiController.clearHistory);
router.post('/ai/summarize', requireAuth, aiController.summarize);
router.post('/ai/analyze-message/:id', requireAuth, aiController.analyzeMessage);

// Insights
router.get('/insights', requireAuth, insightsController.getInsights);

// Cloud Calendar OAuth & Sync
router.get('/calendar/auth/google', requireAuth, calendarEnabled, calendarController.getGoogleAuth);
router.get('/calendar/auth/google/callback', calendarEnabled, calendarController.googleCallback);
router.get('/calendar/auth/outlook', requireAuth, calendarEnabled, calendarController.getMsAuth);
router.get('/calendar/auth/outlook/callback', calendarEnabled, calendarController.msCallback);
router.get('/calendar/accounts', requireAuth, calendarEnabled, calendarController.listAccounts);
router.patch('/calendar/accounts/:id', requireAuth, calendarEnabled, calendarController.updateAccount);
router.delete('/calendar/accounts/:id', requireAuth, calendarEnabled, calendarController.disconnectAccount);
router.post('/calendar/sync', requireAuth, calendarEnabled, calendarController.syncCommitment);

// Agora
router.get('/agora/token/:channelName', requireAuth, callsEnabled, agoraController.getToken);
router.post('/agora/call/notify', requireAuth, callsEnabled, agoraController.notifyCall);
router.post('/agora/recording/start', requireAuth, callsEnabled, agoraController.startRecording);
router.post('/agora/recording/:callId/stop', requireAuth, callsEnabled, agoraController.stopRecording);
router.get('/call', callsEnabled, agoraController.renderCallPage);
