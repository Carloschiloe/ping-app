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
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { validateRequest } from '../middleware/validate';
import * as groupSchema from '../schemas/group.schema';
import * as commitmentSchema from '../schemas/commitment.schema';
import * as messageSchema from '../schemas/message.schema';
import * as operationSchema from '../schemas/operation.schema';

export const router = Router();

// Health
router.get('/health', async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('profiles').select('count', { count: 'exact', head: true });
        if (error) throw error;
        res.json({ ok: true, db_status: 'connected', timestamp: new Date().toISOString() });
    } catch (error: any) {
        res.status(500).json({ ok: false, error: 'Database connection failed', details: error.message });
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

router.get('/conversations', requireAuth, conversationController.list);
router.get('/conversations/:id/messages', requireAuth, conversationController.getMessages);
router.get('/conversations/:id/media', requireAuth, conversationController.getConversationMedia);
router.post('/conversations/:id/messages', requireAuth, validateRequest(messageSchema.sendMessageSchema), conversationController.sendMessage);
router.get('/conversations/:id/participants', requireAuth, groupController.getParticipants);
router.get('/conversations/:id/operation-state', requireAuth, operationController.getConversationOperationState);
router.patch('/conversations/:id/mode', requireAuth, validateRequest(operationSchema.updateConversationModeSchema), operationController.updateConversationMode);
router.patch('/conversations/:id/pin', requireAuth, validateRequest(operationSchema.setPinnedMessageSchema), operationController.setPinnedMessage);
router.patch('/conversations/:id/active-commitment', requireAuth, validateRequest(operationSchema.setActiveCommitmentSchema), operationController.setActiveCommitment);
router.post('/conversations/:id/checklists', requireAuth, validateRequest(operationSchema.saveChecklistSchema), operationController.saveChecklistTemplate);
router.post('/conversations/:id/shift-reports', requireAuth, validateRequest(operationSchema.createShiftReportSchema), operationController.createShiftReport);
router.patch('/conversations/:id/read', requireAuth, conversationController.markAsRead);
router.patch('/conversations/:id/archive', requireAuth, conversationController.toggleArchive);
router.post('/conversations/:id/ping', requireAuth, conversationController.pingConversation);

// Groups
router.post('/groups', requireAuth, validateRequest(groupSchema.createGroupSchema), groupController.createGroup);
router.patch('/groups/:id', requireAuth, validateRequest(groupSchema.updateGroupSchema), groupController.updateGroup);
router.post('/groups/:id/participants', requireAuth, validateRequest(groupSchema.addParticipantsSchema), groupController.addParticipants);
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
router.post('/commitments/:id/accept', requireAuth, commitmentController.acceptCommitment);
router.post('/commitments/:id/reject', requireAuth, commitmentController.rejectCommitment);
router.post('/commitments/:id/postpone', requireAuth, commitmentController.postponeCommitment);
router.post('/commitments/:id/ping', requireAuth, commitmentController.pingCommitment);
router.post('/commitments/:id/operation-action', requireAuth, validateRequest(operationSchema.commitmentOperationActionSchema), operationController.registerCommitmentOperationAction);
router.patch('/commitments/:id', requireAuth, commitmentController.updateCommitment);
router.delete('/commitments/:id', requireAuth, commitmentController.deleteCommitment);

router.patch('/operation-checklist-run-items/:id/toggle', requireAuth, validateRequest(operationSchema.toggleChecklistItemSchema), operationController.toggleChecklistItem);

// Search
router.get('/search', requireAuth, searchController.search);

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
router.get('/calendar/auth/google', requireAuth, calendarController.getGoogleAuth);
router.get('/calendar/auth/google/callback', calendarController.googleCallback);
router.get('/calendar/auth/outlook', requireAuth, calendarController.getMsAuth);
router.get('/calendar/auth/outlook/callback', calendarController.msCallback);
router.get('/calendar/accounts', requireAuth, calendarController.listAccounts);
router.patch('/calendar/accounts/:id', requireAuth, calendarController.updateAccount);
router.delete('/calendar/accounts/:id', requireAuth, calendarController.disconnectAccount);
router.post('/calendar/sync', requireAuth, calendarController.syncCommitment);

// Agora
router.get('/agora/token/:channelName', requireAuth, agoraController.getToken);
router.post('/agora/call/notify', requireAuth, agoraController.notifyCall);
router.post('/agora/recording/start', requireAuth, agoraController.startRecording);
router.post('/agora/recording/:callId/stop', requireAuth, agoraController.stopRecording);
router.get('/call', agoraController.renderCallPage);
