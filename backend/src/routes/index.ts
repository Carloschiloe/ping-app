import { Router, raw } from 'express';
import { requireAuth } from '../middleware/auth';
import * as messageController from '../controllers/message.controller';
import * as commitmentController from '../controllers/commitment.controller';
import * as searchController from '../controllers/search.controller';
import * as pushController from '../controllers/push.controller';
import * as conversationController from '../controllers/conversation.controller';
import * as userController from '../controllers/user.controller';
import * as groupController from '../controllers/group.controller';
import * as aiController from '../controllers/ai.controller';
import * as calendarController from '../controllers/calendar.controller';
import * as agoraController from '../controllers/agora.controller';
import * as operationController from '../controllers/operation.controller';
import * as contactController from '../controllers/contact.controller';
import * as privateFileController from '../controllers/privateFile.controller';
import * as attachmentController from '../controllers/attachment.controller';
import * as agentTurnController from '../controllers/agentTurn.controller';
import * as agentConversationTurnController from '../controllers/agentConversationTurn.controller';
import * as memoryFactsController from '../controllers/memoryFacts.controller';
import * as agentVoiceController from '../controllers/agentVoice.controller';
import * as m8LiveVoiceController from '../controllers/m8LiveVoice.controller';
import * as accountSafetyController from '../controllers/accountSafety.controller';
import * as accountSafetySchema from '../schemas/accountSafety.schema';
import * as appTelemetryController from '../controllers/appTelemetry.controller';
import * as appTelemetrySchema from '../schemas/appTelemetry.schema';
import { getAccess, requirePlan } from '../services/access.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { validateRequest } from '../middleware/validate';
import { agentTurnRequestSchema } from '../schemas/agentTurnRequest.schema';
import { agentVoiceTranscriptionRequestSchema } from '../schemas/agentVoiceRequest.schema';
import { m8LiveVoiceSessionSchema, m8LiveVoiceTelemetrySchema } from '../schemas/m8LiveVoice.schema';
import { MAX_AGENT_VOICE_BYTES } from '../services/agentVoice.service';
import { MAX_MESSAGE_ATTACHMENT_BYTES } from '../services/privateFile.service';
import { getDurableAgentRuntimeStatus } from '../services/agentDurableConfig.service';
import {
    getLatestPrivateAgentTurnContractDiagnostic,
    getLatestPrivateAgentTurnDatabaseDiagnostic,
} from '../services/privateAgentTurnAdmission.service';
import { isAgentConversationTurnPersistenceEnabled } from '../services/agentConversationTurn.service';
import * as groupSchema from '../schemas/group.schema';
import * as commitmentSchema from '../schemas/commitment.schema';
import * as messageSchema from '../schemas/message.schema';
import * as operationSchema from '../schemas/operation.schema';
import * as contactSchema from '../schemas/contact.schema';
import * as privateFileSchema from '../schemas/privateFile.schema';
import * as attachmentSchema from '../schemas/attachment.schema';
import * as sharedContentSchema from '../schemas/sharedContent.schema';
import * as conversationInvitationSchema from '../schemas/conversationInvitation.schema';
import * as contactDiscoverySchema from '../schemas/contactDiscovery.schema';
import {
    requireFeature,
} from '../middleware/featureGate';
import { createAgentRateLimiter } from '../middleware/agentRateLimit';
import { getRateLimitStoreStatus } from '../middleware/rateLimitStore';
import { getM8LiveVoiceTelemetryPersistenceStatus, recordLiveVoiceUsage } from '../services/m8LiveVoice.service';

export const router = Router();

// Límite dedicado por endpoint, más estricto que el global de app.ts porque
// cada turno puede costar varias llamadas al modelo. Es por usuario
// autenticado, con fallback a IP.
const agentTurnRateLimiter = createAgentRateLimiter('turn');

const agentVoiceRateLimiter = createAgentRateLimiter('voice', 10);
// Reports and feedback are written by people, never in bursts.
const safetyRateLimiter = createAgentRateLimiter('safety', 15);
// The app says hello on open and reports its own crashes, a few per session.
const appTelemetryRateLimiter = createAgentRateLimiter('app-telemetry', 30);
const agentVoiceCaptureRateLimiter = createAgentRateLimiter('voice-capture', 10);
const agentVoiceSessionRateLimiter = createAgentRateLimiter('voice-session', 6);
const agentVoiceTelemetryRateLimiter = createAgentRateLimiter('voice-telemetry', 240);
const agentVoiceUsageRateLimiter = createAgentRateLimiter('voice-usage', 240);

const operationEnabled = requireFeature('ENABLE_OPERATION_MODULE');
const calendarEnabled = requireFeature('ENABLE_CALENDAR_INTEGRATION');
// Calls are a core feature; only recording a call stays switched off.
const callRecordingEnabled = requireFeature('ENABLE_CALL_RECORDING');

// Health
router.get('/health', async (req, res) => {
    try {
        // Liveness/readiness sólo necesita comprobar conectividad. Un COUNT
        // exacto fuerza trabajo innecesario sobre una tabla que puede crecer.
        const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
        if (error) throw error;
        const durableStatus = getDurableAgentRuntimeStatus();
        const durableAgentRuntime = durableStatus.enabled;
        const agentConversationEvents = isAgentConversationTurnPersistenceEnabled();
        res.json({
            ok: true,
            db_status: 'connected',
            agent_runtime: durableAgentRuntime
                ? 'durable'
                : agentConversationEvents
                    ? 'process_local_read_fallback'
                    : 'process_local',
            agent_conversation_events: agentConversationEvents,
            // Durable turns now commit their history row in the same RPC as
            // the checkpoint/admission. The separate execute endpoint uses a
            // Postgres outbox before effects and can recover its projection
            // on an idempotent retry when it is given the history binding.
            agent_history_persistence: agentConversationEvents
                ? durableAgentRuntime ? 'durable_for_durable_turns' : 'best_effort'
                : 'disabled',
            agent_execution_history_persistence: agentConversationEvents
                ? 'durable_recoverable_when_bound'
                : 'disabled',
            agent_execution_history_reconciler: process.env.ENABLE_AGENT_HISTORY_RECONCILER === 'true'
                ? 'enabled'
                : 'disabled',
            rate_limit_store: getRateLimitStoreStatus(),
            agent_action_continuity: durableAgentRuntime ? 'durable' : 'process_local_only',
            agent_durable_status: durableStatus,
            agent_private_database_diagnostic: getLatestPrivateAgentTurnDatabaseDiagnostic(),
            agent_durable_contract_diagnostic: getLatestPrivateAgentTurnContractDiagnostic(),
            live_voice: {
                enabled: process.env.PING_ENVIRONMENT === 'production'
                    && process.env.M8_LIVE_VOICE_ENABLED === 'true',
                telemetry_persistence: process.env.M8_LIVE_VOICE_TELEMETRY_PERSISTENCE === 'true',
                telemetry_runtime: getM8LiveVoiceTelemetryPersistenceStatus(),
            },
            commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
            deployment_marker: process.env.PING_DEPLOYMENT_MARKER
                || process.env.RENDER_SERVICE_NAME
                || process.env.NODE_ENV
                || 'unknown',
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ ok: false, error: 'Database connection failed' });
    }
});

// Canonical app config/capabilities. Currently exposes only the
// message-attachment size policy: backend is the single authoritative
// owner of MAX_MESSAGE_ATTACHMENT_BYTES (privateFile.service.ts, itself
// consumed by attachmentApplication.service.ts and the DB verification
// path). Mobile fetches this for preflight UX only — it never becomes the
// source of truth; post-upload backend/Storage verification remains
// authoritative even if a client holds a stale/never-fetched value. Kept
// deliberately separate from /health, which is a narrow DB-connectivity
// probe consumed by deploy tooling, not product configuration.
router.get('/config', (req, res) => {
    res.json({
        limits: {
            maxMessageAttachmentBytes: MAX_MESSAGE_ATTACHMENT_BYTES,
        },
    });
});

// Push
router.post('/push/token', requireAuth, pushController.saveToken);

// Users
router.get('/users', requireAuth, userController.search);
router.post(
    '/users/sync-contacts',
    requireAuth,
    validateRequest(contactDiscoverySchema.syncContactsSchema),
    userController.syncContacts
);
router.patch('/user/profile', requireAuth, userController.updateProfile);
router.post('/user/account/delete', requireAuth, safetyRateLimiter, validateRequest(accountSafetySchema.deleteAccountSchema), accountSafetyController.deleteAccount);
router.get('/user/data-export', requireAuth, safetyRateLimiter, accountSafetyController.exportData);
router.get('/blocks', requireAuth, accountSafetyController.listBlocks);
router.post('/blocks/:userId', requireAuth, safetyRateLimiter, validateRequest(accountSafetySchema.blockSchema), accountSafetyController.block);
router.delete('/blocks/:userId', requireAuth, validateRequest(accountSafetySchema.blockSchema), accountSafetyController.unblock);
router.get('/conversations/:id/block', requireAuth, validateRequest(accountSafetySchema.chatBlockSchema), accountSafetyController.chatBlock);
router.post('/reports', requireAuth, safetyRateLimiter, validateRequest(accountSafetySchema.reportSchema), accountSafetyController.report);
router.post('/feedback', requireAuth, safetyRateLimiter, validateRequest(accountSafetySchema.feedbackSchema), accountSafetyController.feedback);
// What this person may use now (free trial, plan).
router.get('/user/access', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getAccess(req.user!.id));
});
router.post('/app/hello', requireAuth, appTelemetryRateLimiter, validateRequest(appTelemetrySchema.helloSchema), appTelemetryController.hello);
router.post('/app/errors', requireAuth, appTelemetryRateLimiter, validateRequest(appTelemetrySchema.appErrorSchema), appTelemetryController.appError);


// Conversations
router.post('/conversations/self', requireAuth, conversationController.createSelf);
router.post('/conversations', requireAuth, conversationController.createOrFind);
router.post(
    '/conversations/from-contact',
    requireAuth,
    validateRequest(contactDiscoverySchema.createFromContactSchema),
    conversationController.createFromContact
);
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
router.post('/invite-links', requireAuth, conversationController.createInviteLink);
router.post(
    '/invite-links/accept',
    requireAuth,
    validateRequest(conversationInvitationSchema.acceptInviteLinkSchema),
    conversationController.acceptInviteLink
);

router.get('/conversations', requireAuth, conversationController.list);
router.get('/conversations/:id/messages', requireAuth, conversationController.getMessages);
router.get('/conversations/:id/agent-turns', requireAuth, agentConversationTurnController.list);
router.delete('/conversations/:id/agent-turns', requireAuth, agentConversationTurnController.clear);
router.get('/memory/facts', requireAuth, memoryFactsController.list);
router.delete('/memory/facts/:id', requireAuth, memoryFactsController.forget);
router.get(
    '/conversations/:id/shared-content',
    requireAuth,
    validateRequest(sharedContentSchema.getSharedContentSchema),
    conversationController.getConversationSharedContent,
);
router.get('/conversations/:id/media', requireAuth, conversationController.getConversationMedia);
router.post('/conversations/:id/messages', requireAuth, validateRequest(messageSchema.sendMessageSchema), conversationController.sendMessage);
router.post('/conversations/:id/messages/:messageId/forward', requireAuth, conversationController.forwardMessage);
router.post('/conversations/:id/messages/:messageId/reactions', requireAuth, validateRequest(messageSchema.toggleReactionSchema), messageController.toggleReaction);
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
router.patch('/conversations/:id/unread', requireAuth, conversationController.markAsUnread);
router.patch('/conversations/:id/archive', requireAuth, conversationController.toggleArchive);
router.post('/conversations/:id/ping', requireAuth, conversationController.pingConversation);

// Groups
router.post('/groups', requireAuth, validateRequest(groupSchema.createGroupSchema), groupController.createGroup);
router.patch('/groups/:id', requireAuth, validateRequest(groupSchema.updateGroupSchema), groupController.updateGroup);
router.post('/groups/:id/participants', requireAuth, validateRequest(groupSchema.addParticipantsSchema), groupController.addParticipants);
router.patch('/groups/:id/participants/:userId/role', requireAuth, validateRequest(groupSchema.updateParticipantRoleSchema), groupController.updateParticipantRole);
router.delete('/groups/:id', requireAuth, validateRequest(groupSchema.deleteGroupSchema), groupController.deleteGroup);

// Legacy self-chat message routes (kept for backward compatibility)
router.patch('/messages/:id/status', requireAuth, messageController.updateMessageStatus);
router.delete('/messages/:id', requireAuth, messageController.deleteMessage);

// Commitments
router.get('/commitments/check-conflict', requireAuth, commitmentController.checkConflict);
// PING — ARCHIVE LIFECYCLE COMPLETION: explicit archived-only listing,
// registered before the plain '/commitments' route (same pattern as
// check-conflict above) -- a separate endpoint, never a query-param branch
// on getCommitments, so normal retrieval can never accidentally include
// archived items.
router.get('/commitments/archived', requireAuth, commitmentController.getArchivedCommitments);
router.get('/commitments', requireAuth, commitmentController.getCommitments);
router.post('/commitments', requireAuth, requirePlan, validateRequest(commitmentSchema.createCommitmentSchema), commitmentController.createCommitment);
router.post('/commitment-proposals', requireAuth, validateRequest(commitmentSchema.createCommitmentSchema), commitmentController.createProposal);
router.get('/commitment-proposals', requireAuth, commitmentController.getAgreementProposals);
router.post('/commitment-proposals/shared', requireAuth, validateRequest(commitmentSchema.createCommitmentSchema), commitmentController.createSharedProposal);
router.post('/commitment-proposals/:id/respond', requireAuth, validateRequest(commitmentSchema.sharedProposalResponseSchema), commitmentController.respondToSharedProposal);
router.post('/commitment-proposals/:id/confirm', requireAuth, validateRequest(commitmentSchema.proposalDecisionSchema), commitmentController.confirmProposal);
router.post('/commitment-proposals/:id/reject', requireAuth, validateRequest(commitmentSchema.proposalDecisionSchema), commitmentController.rejectProposal);
router.post('/commitments/:id/accept', requireAuth, commitmentController.acceptCommitment);
router.post('/commitments/:id/reject', requireAuth, validateRequest(commitmentSchema.rejectCommitmentSchema), commitmentController.rejectCommitment);
router.post('/commitments/:id/postpone', requireAuth, validateRequest(commitmentSchema.postponeCommitmentSchema), commitmentController.postponeCommitment);
router.post('/commitments/:id/counter-propose', requireAuth, validateRequest(commitmentSchema.counterProposeCommitmentSchema), commitmentController.counterProposeCommitment);
router.post('/commitments/:id/action-completed', requireAuth, commitmentController.markActionCompleted);
router.post('/commitments/:id/resolve', requireAuth, validateRequest(commitmentSchema.resolveCommitmentSchema), commitmentController.resolveCommitment);
router.post('/commitments/:id/cancel', requireAuth, validateRequest(commitmentSchema.cancelCommitmentSchema), commitmentController.cancelCommitment);
router.post('/commitments/:id/reopen', requireAuth, commitmentController.reopenCommitment);
router.post('/commitments/:id/reassign', requireAuth, validateRequest(commitmentSchema.reassignCommitmentSchema), commitmentController.reassignCommitment);
router.post('/commitments/:id/follow-up', requireAuth, validateRequest(commitmentSchema.scheduleFollowUpSchema), commitmentController.scheduleFollowUp);
router.post('/commitments/:id/operation-action', requireAuth, operationEnabled, validateRequest(operationSchema.commitmentOperationActionSchema), operationController.registerCommitmentOperationAction);
router.patch('/commitments/:id', requireAuth, validateRequest(commitmentSchema.updateCommitmentSchema), commitmentController.updateCommitment);
router.delete('/commitments/:id', requireAuth, commitmentController.deleteCommitment);
// PING — ARCHIVE LIFECYCLE COMPLETION: symmetric counterpart to DELETE
// above -- clears archived_at only, same owner authorization.
router.post('/commitments/:id/restore', requireAuth, commitmentController.restoreCommitment);

router.patch('/operation-checklist-run-items/:id/toggle', requireAuth, operationEnabled, validateRequest(operationSchema.toggleChecklistItemSchema), operationController.toggleChecklistItem);

// Contactos externos (contraparte de un commitment sin cuenta en Ping)
router.post('/contacts', requireAuth, validateRequest(contactSchema.createContactSchema), contactController.createContact);
router.get('/contacts', requireAuth, contactController.getContacts);
router.get('/contacts/:id', requireAuth, validateRequest(contactSchema.getContactSchema), contactController.getContact);

// Search
router.get('/search', requireAuth, searchController.search);

// Private file reads and uploads. Authorization on the owning resource is
// enforced by the service before issuing any URL.
router.post(
    '/files/read-url',
    requireAuth,
    validateRequest(privateFileSchema.createPrivateFileReadUrlSchema),
    privateFileController.createReadUrl
);
router.post(
    '/files/profile-avatar/upload-url',
    requireAuth,
    validateRequest(privateFileSchema.createProfileAvatarUploadUrlSchema),
    privateFileController.createProfileAvatarUploadUrl
);
router.post(
    '/files/profile-avatar/complete',
    requireAuth,
    validateRequest(privateFileSchema.completeProfileAvatarSchema),
    privateFileController.completeProfileAvatar
);
router.post(
    '/files/profile-cover/upload-url',
    requireAuth,
    validateRequest(privateFileSchema.createProfileAvatarUploadUrlSchema),
    privateFileController.createProfileCoverUploadUrl
);
router.post(
    '/files/profile-cover/complete',
    requireAuth,
    validateRequest(privateFileSchema.completeProfileAvatarSchema),
    privateFileController.completeProfileCover
);
router.post(
    '/attachments/upload-intents',
    requireAuth,
    validateRequest(attachmentSchema.createUploadIntentSchema),
    attachmentController.createUploadIntent
);
router.post(
    '/attachments/:id/complete',
    requireAuth,
    validateRequest(attachmentSchema.attachmentIdSchema),
    attachmentController.completeUpload
);
router.post(
    '/attachments/:id/read-url',
    requireAuth,
    validateRequest(attachmentSchema.attachmentIdSchema),
    attachmentController.createReadUrl
);

// AI (legacy — coexiste con el asistente de /agent/turn)
router.post('/ai/summarize', requireAuth, requirePlan, aiController.summarize);

// Ping Agent (M-1F) — read-only orchestrator sobre M-1B/M-1C/M-1D/M-1D.1/M-1E.
// Rate limit propio (más estricto que el global de app.ts) porque cada
// request puede disparar hasta 2 llamadas a un LLM (sección 22/29) — keyed
// por usuario autenticado, nunca por IP sola, ya que requireAuth corre antes.
router.post(
    '/agent/voice/transcribe',
    requireAuth,
    requirePlan,
    agentVoiceRateLimiter,
    raw({ type: () => true, limit: MAX_AGENT_VOICE_BYTES + 1024 }),
    agentVoiceController.agentVoiceRawBodyError,
    validateRequest(agentVoiceTranscriptionRequestSchema),
    agentVoiceController.transcribe,
);

// M-8: production WebRTC live-voice broker. The provider key remains on the
// backend and semantic turns return through the existing Ping Core boundary.
router.post(
    '/agent/voice/live/session',
    requireAuth,
    requirePlan,
    agentVoiceSessionRateLimiter,
    validateRequest(m8LiveVoiceSessionSchema),
    m8LiveVoiceController.createSession,
);
router.get('/agent/voice/live/client', m8LiveVoiceController.client);
router.post(
    '/agent/voice/live/usage',
    requireAuth,
    agentVoiceUsageRateLimiter,
    validateRequest(appTelemetrySchema.liveVoiceUsageSchema),
    (req, res) => {
        recordLiveVoiceUsage(req.user!.id, req.body.kind, req.body.usage);
        res.status(204).end();
    },
);
router.post(
    '/agent/voice/live/telemetry',
    requireAuth,
    agentVoiceTelemetryRateLimiter,
    validateRequest(m8LiveVoiceTelemetrySchema),
    m8LiveVoiceController.telemetry,
);
router.get(
    '/agent/voice/live/telemetry/latest',
    requireAuth,
    agentVoiceTelemetryRateLimiter,
    m8LiveVoiceController.readLatestTelemetry,
);
router.get(
    '/agent/voice/live/telemetry/internal/latest',
    agentVoiceTelemetryRateLimiter,
    m8LiveVoiceController.readLatestTelemetryInternal,
);
router.get(
    '/agent/voice/live/telemetry/:voiceSessionId',
    requireAuth,
    m8LiveVoiceController.readTelemetry,
);

// Ping Agent Turn — the single entry point: every surface reaches the same
// assistant, which reads with tools and only proposes changes; a change runs
// after the user's explicit confirmation in a later turn.
router.post(
    '/agent/turn',
    requireAuth,
    requirePlan,
    agentTurnRateLimiter,
    validateRequest(agentTurnRequestSchema),
    agentTurnController.turn,
);

// Insights

// Cloud Calendar OAuth & Sync
router.get('/calendar/auth/outlook/link', requireAuth, calendarEnabled, calendarController.getMsAuthLink);
router.get('/calendar/auth/google', requireAuth, calendarEnabled, calendarController.getGoogleAuth);
router.get('/calendar/auth/google/callback', calendarEnabled, calendarController.googleCallback);
router.get('/calendar/auth/outlook', requireAuth, calendarEnabled, calendarController.getMsAuth);
router.get('/calendar/auth/outlook/callback', calendarEnabled, calendarController.msCallback);
router.get('/calendar/accounts', requireAuth, calendarEnabled, calendarController.listAccounts);
router.patch('/calendar/accounts/:id', requireAuth, calendarEnabled, calendarController.updateAccount);
router.delete('/calendar/accounts/:id', requireAuth, calendarEnabled, calendarController.disconnectAccount);
router.post('/calendar/sync', requireAuth, calendarEnabled, calendarController.syncCommitment);

// Agora
router.get('/agora/token/:channelName', requireAuth, agoraController.getToken);
router.post('/agora/call/notify', requireAuth, requirePlan, agoraController.notifyCall);
router.post('/agora/recording/start', requireAuth, callRecordingEnabled, agoraController.startRecording);
router.post('/agora/recording/:callId/stop', requireAuth, callRecordingEnabled, agoraController.stopRecording);
router.get('/call', agoraController.renderCallPage);
