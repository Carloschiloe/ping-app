import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const supabaseUrl = new URL(process.env.SUPABASE_URL);
if (supabaseUrl.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error('E2E is restricted to Ping Staging V2');
}
const configuredRemoteBaseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, '');
if (configuredRemoteBaseUrl) {
  const remoteUrl = new URL(configuredRemoteBaseUrl);
  const isStagingRenderHost = /^ping-backend-staging(?:-[a-z0-9]+)?\.onrender\.com$/
    .test(remoteUrl.hostname);
  if (remoteUrl.protocol !== 'https:' || !isStagingRenderHost || remoteUrl.pathname !== '/api') {
    throw new Error('E2E_BASE_URL must be the HTTPS /api URL of ping-backend-staging');
  }
}

const REMOTE_TIMEOUT_MS = 30_000;
const fetchWithTimeout = (input, init = {}) => {
  const timeoutSignal = AbortSignal.timeout(REMOTE_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: 'staging-e2e',
  PING_EXPECTED_SUPABASE_PROJECT_REF: EXPECTED_PROJECT_REF,
  ENABLE_PRIVATE_FILE_READS: 'true',
  ENABLE_PRIVATE_FILE_UPLOADS: 'false',
  ENABLE_PRIVATE_AVATAR_UPLOADS: 'true',
  ENABLE_PRIVATE_MESSAGE_UPLOADS: 'true',
  ENABLE_NON_MVP_CAPABILITIES: 'false',
  ENABLE_OPERATION_MODULE: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false',
  ENABLE_CALLS: 'false',
  ENABLE_AUTOMATIONS: 'false',
  RUN_CRON_JOBS: 'false',
  OPENAI_API_KEY: '',
});

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  },
);
const publicClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  },
);

const runId = randomUUID();
const runMarker = `ping-beta-e2e-${runId}`;
const password = randomBytes(24).toString('base64url');
const users = [];
const resources = {
  conversations: new Set(),
  messages: new Set(),
  proposals: new Set(),
  commitments: new Set(),
  objectPaths: new Set(),
};
const checks = [];

function check(name, condition, detail = undefined) {
  if (!condition) throw new Error(`Check failed: ${name}${detail ? ` (${detail})` : ''}`);
  checks.push(name);
  console.info(`[E2E] passed: ${name}`);
}

async function createTemporaryUser(index) {
  console.info(`[E2E] creating temporary user ${index}`);
  const email = `${runMarker}-${index}@example.invalid`;
  const phone = `+569${randomBytes(4).readUInt32BE(0).toString().padStart(10, '0').slice(0, 8)}`;
  const profileName = index === 2 ? null : `Ping Beta E2E ${index}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { e2e_run: runId },
  });
  if (error || !data.user) throw error || new Error('Temporary user was not created');
  users.push(data.user.id);

  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: profileName,
    phone,
  });
  if (profileError) throw profileError;

  const client = publicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session?.access_token) {
    throw signInError || new Error('Temporary user could not sign in');
  }
  console.info(`[E2E] temporary user ${index} ready`);
  return {
    id: data.user.id,
    email,
    phone,
    token: session.session.access_token,
    client,
  };
}

async function cleanup() {
  const objectPaths = [...resources.objectPaths];
  if (objectPaths.length > 0) {
    await admin.storage.from('chat-media').remove(objectPaths);
  }

  const commitmentIds = [...resources.commitments];
  const proposalIds = [...resources.proposals];
  const messageIds = [...resources.messages];
  const conversationIds = [...resources.conversations];

  if (commitmentIds.length > 0) {
    await admin.from('commitment_audit_records').delete().in('commitment_id', commitmentIds);
    await admin.from('commitment_events').delete().in('commitment_id', commitmentIds);
    await admin.from('commitments').delete().in('id', commitmentIds);
  }
  if (proposalIds.length > 0) {
    await admin.from('commitment_audit_records').delete().in('proposal_id', proposalIds);
    await admin.from('commitment_proposal_events').delete().in('proposal_id', proposalIds);
    await admin.from('commitment_proposals').delete().in('id', proposalIds);
  }
  if (messageIds.length > 0) {
    await admin.from('message_reactions').delete().in('message_id', messageIds);
    await admin.from('messages').delete().in('id', messageIds);
  }
  if (conversationIds.length > 0) {
    await admin.from('conversation_participants').delete().in('conversation_id', conversationIds);
    await admin.from('conversations').delete().in('id', conversationIds);
  }
  for (const userId of users) {
    await admin.auth.admin.deleteUser(userId);
  }
}

let server;
try {
  let baseUrl = configuredRemoteBaseUrl;
  if (!baseUrl) {
    const { app } = await import('../dist/app.js');
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  }

  const request = async (path, { token, method = 'GET', body } = {}) => {
    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    return { response, payload };
  };

  const first = await createTemporaryUser(1);
  const second = await createTemporaryUser(2);
  const third = await createTemporaryUser(3);

  const health = await request('/health');
  check('staging health check', health.response.status === 200 && health.payload?.db_status === 'connected');

  const contactDiscovery = await request('/users/sync-contacts', {
    token: first.token,
    method: 'POST',
    body: {
      phones: [second.phone],
      emails: [second.email],
    },
  });
  check('authorized address-book match returns short-lived proof',
    contactDiscovery.response.status === 200
      && contactDiscovery.payload?.users?.length === 1
      && contactDiscovery.payload.users[0]?.id === second.id
      && contactDiscovery.payload.users[0]?.contactProof?.startsWith('PINGC1.'));

  const discoveredConversation = await request('/conversations/from-contact', {
    token: first.token,
    method: 'POST',
    body: { proof: contactDiscovery.payload.users[0].contactProof },
  });
  check('matched device contact opens direct conversation',
    discoveredConversation.response.status === 200
      && typeof discoveredConversation.payload?.conversationId === 'string');
  resources.conversations.add(discoveredConversation.payload.conversationId);

  const crossAccountProof = await request('/conversations/from-contact', {
    token: third.token,
    method: 'POST',
    body: { proof: contactDiscovery.payload.users[0].contactProof },
  });
  check('contact proof rejects another authenticated account',
    crossAccountProof.response.status === 403);

  const discoveredMessage = await request(
    `/conversations/${discoveredConversation.payload.conversationId}/messages`,
    {
      token: first.token,
      method: 'POST',
      body: {
        text: `Temporary contact chat ${runMarker}`,
        client_message_id: randomUUID(),
      },
    },
  );
  check('message sent through discovered contact conversation',
    discoveredMessage.response.status === 201
      && typeof discoveredMessage.payload?.message?.id === 'string');
  resources.messages.add(discoveredMessage.payload.message.id);

  const recipientMessages = await request(
    `/conversations/${discoveredConversation.payload.conversationId}/messages`,
    { token: second.token },
  );
  check('recipient can immediately retrieve contact message',
    recipientMessages.response.status === 200
      && recipientMessages.payload?.messages?.some(
        (message) => message.id === discoveredMessage.payload.message.id
      ));

  const recipientConversations = await request('/conversations', {
    token: second.token,
  });
  check('recipient conversation list immediately contains new message',
    recipientConversations.response.status === 200
      && recipientConversations.payload?.conversations?.some(
        (conversation) =>
          conversation.id === discoveredConversation.payload.conversationId
          && conversation.lastMessage?.text === `Temporary contact chat ${runMarker}`
      ));

  const noContactMatch = await request('/users/sync-contacts', {
    token: first.token,
    method: 'POST',
    body: {
      phones: ['+56900000000'],
      emails: ['not-a-ping-user@example.invalid'],
    },
  });
  check('unknown address-book entry reveals no profile',
    noContactMatch.response.status === 200
      && Array.isArray(noContactMatch.payload?.users)
      && noContactMatch.payload.users.length === 0);

  const invitation = await request('/conversation-invitations', {
    token: first.token,
    method: 'POST',
    body: { inviteeEmail: second.email },
  });
  check('explicit conversation invitation created',
    invitation.response.status === 200
      && invitation.payload?.token?.startsWith('PING1.')
      && invitation.payload?.expiresIn === 900);

  const acceptedInvitation = await request('/conversation-invitations/accept', {
    token: second.token,
    method: 'POST',
    body: { token: invitation.payload.token },
  });
  check('intended recipient accepts invitation',
    acceptedInvitation.response.status === 200
      && typeof acceptedInvitation.payload?.conversationId === 'string');
  resources.conversations.add(acceptedInvitation.payload.conversationId);

  const replayedInvitation = await request('/conversation-invitations/accept', {
    token: second.token,
    method: 'POST',
    body: { token: invitation.payload.token },
  });
  check('invitation replay is idempotent for intended recipient',
    replayedInvitation.response.status === 200
      && replayedInvitation.payload?.conversationId === acceptedInvitation.payload.conversationId);

  const { data: incompleteProfile, error: incompleteProfileError } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', second.id)
    .single();
  if (incompleteProfileError) throw incompleteProfileError;
  check('new profile starts without inferred name', incompleteProfile.full_name === null);

  const rejectedEmptyName = await request('/user/profile', {
    token: second.token,
    method: 'PATCH',
    body: { full_name: ' ' },
  });
  check('empty onboarding name rejected', rejectedEmptyName.response.status === 400);

  const completedProfile = await request('/user/profile', {
    token: second.token,
    method: 'PATCH',
    body: {
      id: first.id,
      full_name: '  Ping   Beta E2E 2  ',
    },
  });
  check('onboarding name accepted',
    completedProfile.response.status === 200
      && completedProfile.payload?.user?.full_name === 'Ping Beta E2E 2');

  const { data: persistedProfile, error: persistedProfileError } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('id', second.id)
    .single();
  if (persistedProfileError) throw persistedProfileError;
  check('onboarding name persisted on authenticated profile',
    persistedProfile.id === second.id
      && persistedProfile.full_name === 'Ping Beta E2E 2');

  const self = await request('/conversations/self', { token: first.token, method: 'POST' });
  check('self-chat created', self.response.status === 200 && typeof self.payload?.conversationId === 'string');
  const conversationId = self.payload.conversationId;
  resources.conversations.add(conversationId);

  const secondSelf = await request('/conversations/self', {
    token: second.token,
    method: 'POST',
  });
  check('second self-chat created',
    secondSelf.response.status === 200
      && typeof secondSelf.payload?.conversationId === 'string');
  resources.conversations.add(secondSelf.payload.conversationId);

  const crossConversation = await request(`/conversations/${conversationId}/messages`, {
    token: second.token,
  });
  check('cross-user conversation rejected', [403, 404].includes(crossConversation.response.status));

  const { error: directProposalError } = await first.client
    .from('commitment_proposals')
    .insert({
      proposed_by_user_id: first.id,
      source_kind: 'manual',
      title: 'Direct insertion must fail',
      type: 'task',
      status: 'pending',
    });
  check('direct proposal insertion is revoked', Boolean(directProposalError));

  const { error: definerBoundaryError } = await admin.rpc(
    'create_commitment_proposal_with_evidence',
    {
      p_actor_user_id: first.id,
      p_proposal: {
        proposed_by_user_id: first.id,
        proposed_responsible_user_id: first.id,
        conversation_id: secondSelf.payload.conversationId,
        source_kind: 'manual',
        title: 'Cross-context proposal must fail',
        type: 'task',
        status: 'pending',
      },
    },
  );
  check('SECURITY DEFINER validates conversation membership',
    Boolean(definerBoundaryError));

  const clientMessageId = randomUUID();
  const messageBody = {
    text: `Temporary beta validation ${runMarker}`,
    client_message_id: clientMessageId,
  };
  const sent = await request(`/conversations/${conversationId}/messages`, {
    token: first.token,
    method: 'POST',
    body: messageBody,
  });
  check('message sent', sent.response.status === 201 && typeof sent.payload?.message?.id === 'string');
  const messageId = sent.payload.message.id;
  resources.messages.add(messageId);

  const replay = await request(`/conversations/${conversationId}/messages`, {
    token: first.token,
    method: 'POST',
    body: messageBody,
  });
  check('idempotent replay returns original message',
    replay.response.status === 201 && replay.payload?.message?.id === messageId);

  const { count: messageCount, error: messageCountError } = await admin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', first.id)
    .eq('client_message_id', clientMessageId);
  if (messageCountError) throw messageCountError;
  check('idempotency unique row', messageCount === 1);

  const rejectedProposalResponse = await request('/commitment-proposals', {
    token: first.token,
    method: 'POST',
    body: {
      title: 'Temporary rejected proposal',
      conversation_id: conversationId,
      message_id: messageId,
      expected_result: 'Must never create a commitment',
    },
  });
  check('proposal created for rejection', rejectedProposalResponse.response.status === 201);
  const rejectedProposalId = rejectedProposalResponse.payload.id;
  resources.proposals.add(rejectedProposalId);

  const rejected = await request(`/commitment-proposals/${rejectedProposalId}/reject`, {
    token: first.token,
    method: 'POST',
    body: { reason: 'Temporary beta rejection' },
  });
  check('proposal rejected', rejected.response.status === 200 && rejected.payload?.status === 'rejected');

  const { count: rejectedCommitmentCount, error: rejectedCountError } = await admin
    .from('commitments')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', rejectedProposalId);
  if (rejectedCountError) throw rejectedCountError;
  check('rejected proposal creates no commitment', rejectedCommitmentCount === 0);

  const proposalResponse = await request('/commitment-proposals', {
    token: first.token,
    method: 'POST',
    body: {
      title: 'Temporary confirmed commitment',
      conversation_id: conversationId,
      message_id: messageId,
      expected_result: 'Validated beta result',
    },
  });
  check('proposal created for confirmation', proposalResponse.response.status === 201);
  const proposalId = proposalResponse.payload.id;
  resources.proposals.add(proposalId);

  const confirmed = await request(`/commitment-proposals/${proposalId}/confirm`, {
    token: first.token,
    method: 'POST',
    body: {},
  });
  check('proposal confirmation creates commitment',
    confirmed.response.status === 201 && confirmed.payload?.status === 'accepted');
  const commitmentId = confirmed.payload.id;
  resources.commitments.add(commitmentId);

  const duplicateConfirmation = await request(`/commitment-proposals/${proposalId}/confirm`, {
    token: first.token,
    method: 'POST',
    body: {},
  });
  check('duplicate confirmation rejected', duplicateConfirmation.response.status === 409);

  const { count: commitmentCount, error: commitmentCountError } = await admin
    .from('commitments')
    .select('*', { count: 'exact', head: true })
    .eq('proposal_id', proposalId);
  if (commitmentCountError) throw commitmentCountError;
  check('proposal has exactly one commitment', commitmentCount === 1);

  const crossResolve = await request(`/commitments/${commitmentId}/resolve`, {
    token: second.token,
    method: 'POST',
    body: { result: 'Unauthorized result' },
  });
  check('cross-user commitment mutation rejected', [403, 404].includes(crossResolve.response.status));

  const progressed = await request(`/commitments/${commitmentId}/action-completed`, {
    token: first.token,
    method: 'POST',
  });
  check('progress does not resolve commitment',
    progressed.response.status === 200
      && progressed.payload?.status === 'accepted'
      && Boolean(progressed.payload?.action_completed_at));

  const followedUp = await request(`/commitments/${commitmentId}/follow-up`, {
    token: first.token,
    method: 'POST',
    body: {
      followUpAt: new Date(Date.now() + 86_400_000).toISOString(),
      nextAction: 'Verify beta result',
    },
  });
  check('follow-up preserves open status',
    followedUp.response.status === 200 && followedUp.payload?.status === 'accepted');

  const { error: rollbackProbeError } = await admin.rpc(
    'apply_commitment_transition_with_evidence',
    {
      p_commitment_id: commitmentId,
      p_actor_user_id: first.id,
      p_expected_status: 'accepted',
      p_patch: { status: 'rejected' },
      p_event_type: 'invalid_e2e_event',
      p_event_payload: {},
    },
  );
  check('invalid atomic transition rejected', Boolean(rollbackProbeError));
  const { data: afterRollback, error: afterRollbackError } = await admin
    .from('commitments')
    .select('status')
    .eq('id', commitmentId)
    .single();
  if (afterRollbackError) throw afterRollbackError;
  check('failed atomic transition fully rolled back', afterRollback.status === 'accepted');

  const missingResult = await request(`/commitments/${commitmentId}/resolve`, {
    token: first.token,
    method: 'POST',
    body: {},
  });
  check('resolution without result rejected', missingResult.response.status === 400);

  const resolutionResult = 'Temporary beta validation completed';
  const resolved = await request(`/commitments/${commitmentId}/resolve`, {
    token: first.token,
    method: 'POST',
    body: { result: resolutionResult },
  });
  check('resolution stores explicit result',
    resolved.response.status === 200
      && resolved.payload?.status === 'resolved'
      && resolved.payload?.resolution_result === resolutionResult);

  const { count: eventCount, error: eventError } = await admin
    .from('commitment_events')
    .select('*', { count: 'exact', head: true })
    .eq('commitment_id', commitmentId);
  if (eventError) throw eventError;
  const { count: auditCount, error: auditError } = await admin
    .from('commitment_audit_records')
    .select('*', { count: 'exact', head: true })
    .eq('commitment_id', commitmentId);
  if (auditError) throw auditError;
  check('commitment events preserved', eventCount >= 4);
  check('commitment audit evidence preserved', auditCount >= 3);

  const { data: crossRows, error: crossSelectError } = await second.client
    .from('commitment_proposals')
    .select('id')
    .eq('id', proposalId);
  if (crossSelectError) throw crossSelectError;
  check('RLS hides another user proposal', crossRows.length === 0);

  const { data: fileConversation, error: fileConversationError } = await admin
    .from('conversations')
    .insert({
      conversation_type: 'group',
      name: `Temporary files ${runMarker}`,
      created_by: first.id,
    })
    .select('id')
    .single();
  if (fileConversationError) throw fileConversationError;
  resources.conversations.add(fileConversation.id);
  const { error: fileParticipantsError } = await admin
    .from('conversation_participants')
    .insert([
      { conversation_id: fileConversation.id, user_id: first.id, role: 'admin' },
      { conversation_id: fileConversation.id, user_id: second.id, role: 'member' },
    ]);
  if (fileParticipantsError) throw fileParticipantsError;

  const png = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1,
    8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 0, 73, 69, 78,
    68, 174, 66, 96, 130,
  ]);

  const attachmentUpload = await request('/files/message-attachment/upload-url', {
    token: first.token,
    method: 'POST',
    body: {
      conversationId: fileConversation.id,
      mimeType: 'image/png',
    },
  });
  check('authorized attachment upload signed',
    attachmentUpload.response.status === 200
      && attachmentUpload.payload?.bucket === 'chat-media'
      && attachmentUpload.payload?.objectPath?.startsWith(
        `conversations/${fileConversation.id}/attachments/${first.id}/`
      ));
  resources.objectPaths.add(attachmentUpload.payload.objectPath);

  const { error: uploadError } = await first.client.storage
    .from('chat-media')
    .uploadToSignedUrl(
      attachmentUpload.payload.objectPath,
      attachmentUpload.payload.token,
      png,
      { contentType: 'image/png' },
    );
  if (uploadError) throw uploadError;

  const attachedMessage = await request(`/conversations/${fileConversation.id}/messages`, {
    token: first.token,
    method: 'POST',
    body: {
      text: 'Imagen temporal de validación',
      client_message_id: randomUUID(),
      attachment: {
        bucket: 'chat-media',
        objectPath: attachmentUpload.payload.objectPath,
        mimeType: 'image/png',
        fileName: 'temporary-e2e.png',
      },
    },
  });
  check('attachment reference persisted on message',
    attachedMessage.response.status === 201
      && attachedMessage.payload?.message?.media_bucket === 'chat-media'
      && attachedMessage.payload?.message?.media_object_path === attachmentUpload.payload.objectPath
      && !JSON.stringify(attachedMessage.payload?.message).includes(attachmentUpload.payload.signedUrl));
  const attachedMessageId = attachedMessage.payload.message.id;
  resources.messages.add(attachedMessageId);

  const signed = await request('/files/read-url', {
    token: second.token,
    method: 'POST',
    body: { resourceType: 'message', resourceId: attachedMessageId },
  });
  check('participant private file signed', signed.response.status === 200 && signed.payload?.expiresIn === 60);
  const downloaded = await fetch(signed.payload.signedUrl);
  check('participant private file downloaded', downloaded.status === 200);

  const crossSigned = await request('/files/read-url', {
    token: third.token,
    method: 'POST',
    body: { resourceType: 'message', resourceId: attachedMessageId },
  });
  check('cross-user private file rejected', [403, 404].includes(crossSigned.response.status));

  const arbitraryReference = await request(`/conversations/${fileConversation.id}/messages`, {
    token: first.token,
    method: 'POST',
    body: {
      text: 'Arbitrary path must fail',
      client_message_id: randomUUID(),
      attachment: {
        bucket: 'chat-media',
        objectPath: `conversations/${fileConversation.id}/attachments/${third.id}/not-owned.png`,
        mimeType: 'image/png',
        fileName: 'not-owned.png',
      },
    },
  });
  check('arbitrary attachment path rejected', arbitraryReference.response.status === 403);

  const uploadGate = await request('/files/upload-url', {
    token: first.token,
    method: 'POST',
    body: {
      purpose: 'message_attachment',
      ownerResourceId: conversationId,
      mimeType: 'image/png',
    },
  });
  check('generic private upload gate remains disabled', uploadGate.response.status === 503);

  const avatarUpload = await request('/files/profile-avatar/upload-url', {
    token: first.token,
    method: 'POST',
    body: { mimeType: 'image/png' },
  });
  check('own avatar upload signed',
    avatarUpload.response.status === 200
      && avatarUpload.payload?.objectPath?.startsWith(`profiles/${first.id}/avatar/`));
  resources.objectPaths.add(avatarUpload.payload.objectPath);
  const { error: avatarUploadError } = await first.client.storage
    .from('chat-media')
    .uploadToSignedUrl(
      avatarUpload.payload.objectPath,
      avatarUpload.payload.token,
      png,
      { contentType: 'image/png' },
    );
  if (avatarUploadError) throw avatarUploadError;

  const completedAvatar = await request('/files/profile-avatar/complete', {
    token: first.token,
    method: 'POST',
    body: {
      bucket: 'chat-media',
      objectPath: avatarUpload.payload.objectPath,
    },
  });
  check('avatar private reference persisted',
    completedAvatar.response.status === 200
      && completedAvatar.payload?.avatar_bucket === 'chat-media'
      && completedAvatar.payload?.avatar_object_path === avatarUpload.payload.objectPath);

  const avatarRead = await request('/files/read-url', {
    token: first.token,
    method: 'POST',
    body: { resourceType: 'profile', resourceId: first.id },
  });
  check('own avatar can be read', avatarRead.response.status === 200);

  const { error: revokeError } = await admin
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', fileConversation.id)
    .eq('user_id', second.id);
  if (revokeError) throw revokeError;

  const afterRevocation = await request('/files/read-url', {
    token: second.token,
    method: 'POST',
    body: { resourceType: 'message', resourceId: attachedMessageId },
  });
  check('revocation blocks new signatures', [403, 404].includes(afterRevocation.response.status));

  console.log(JSON.stringify({
    projectRef: EXPECTED_PROJECT_REF,
    target: configuredRemoteBaseUrl ? 'remote-staging' : 'local-staging',
    status: 'passed',
    checks,
    temporaryUsers: users.length,
    temporaryObjects: resources.objectPaths.size,
    cleanupRequired: true,
  }, null, 2));
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await cleanup();

  const { count: remainingProfiles, error: remainingProfileError } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .in('id', users);
  if (remainingProfileError) throw remainingProfileError;
  if (remainingProfiles) {
    throw new Error('Temporary E2E profiles remain after cleanup');
  }
}
