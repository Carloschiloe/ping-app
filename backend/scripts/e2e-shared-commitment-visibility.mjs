import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'E2E_BASE_URL',
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const supabaseUrl = new URL(process.env.SUPABASE_URL);
if (supabaseUrl.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error('Focused E2E is restricted to Ping Staging V2');
}

const baseUrl = process.env.E2E_BASE_URL.replace(/\/+$/, '');
const remoteUrl = new URL(baseUrl);
if (
  remoteUrl.protocol !== 'https:'
  || !/^ping-backend-staging(?:-[a-z0-9]+)?\.onrender\.com$/.test(remoteUrl.hostname)
  || remoteUrl.pathname !== '/api'
) {
  throw new Error('E2E_BASE_URL must be the HTTPS /api URL of ping-backend-staging');
}

const fetchWithTimeout = (input, init = {}) => fetch(input, {
  ...init,
  signal: AbortSignal.timeout(60_000),
});

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  },
);

const runId = randomUUID();
const marker = `ping-shared-commitment-e2e-${runId}`;
const password = randomBytes(24).toString('base64url');
const users = [];
const resources = {
  conversationId: null,
  messageId: null,
  proposalId: null,
  commitmentId: null,
};
const checks = [];

function check(name, condition) {
  if (!condition) throw new Error(`Check failed: ${name}`);
  checks.push(name);
  console.info(`[E2E shared commitment] passed: ${name}`);
}

async function request(path, { token, method = 'GET', body } = {}) {
  const attempts = method === 'GET' ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (attempt < attempts && [502, 503, 504].includes(response.status)) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
        continue;
      }
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      return { response, payload };
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error('Remote request exhausted safe GET retries');
}

async function createTemporaryUser(index) {
  const email = `${marker}-${index}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { e2e_run: runId },
  });
  if (error || !data.user) throw error || new Error('Temporary user was not created');
  users.push(data.user.id);

  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout },
    },
  );
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session?.access_token) {
    throw signInError || new Error('Temporary user could not sign in');
  }

  return {
    id: data.user.id,
    token: session.session.access_token,
  };
}

async function deleteRows(table, column, values) {
  if (!values?.length) return;
  const { error } = await admin.from(table).delete().in(column, values);
  if (error) throw error;
}

async function cleanup() {
  const cleanupErrors = [];
  const attempt = async (operation) => {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push(error);
    }
  };

  if (resources.commitmentId) {
    await attempt(() => deleteRows(
      'commitment_audit_records',
      'commitment_id',
      [resources.commitmentId],
    ));
    await attempt(() => deleteRows(
      'commitment_events',
      'commitment_id',
      [resources.commitmentId],
    ));
    await attempt(() => deleteRows('commitments', 'id', [resources.commitmentId]));
  }
  if (resources.proposalId) {
    await attempt(() => deleteRows(
      'commitment_audit_records',
      'proposal_id',
      [resources.proposalId],
    ));
    await attempt(() => deleteRows(
      'commitment_proposal_events',
      'proposal_id',
      [resources.proposalId],
    ));
    await attempt(() => deleteRows(
      'commitment_proposal_responses',
      'proposal_id',
      [resources.proposalId],
    ));
    await attempt(() => deleteRows(
      'commitment_proposals',
      'id',
      [resources.proposalId],
    ));
  }
  if (resources.messageId) {
    await attempt(() => deleteRows('message_reactions', 'message_id', [resources.messageId]));
    await attempt(() => deleteRows('messages', 'id', [resources.messageId]));
  }
  if (resources.conversationId) {
    await attempt(() => deleteRows(
      'conversation_participants',
      'conversation_id',
      [resources.conversationId],
    ));
    await attempt(() => deleteRows('conversations', 'id', [resources.conversationId]));
  }

  for (const userId of users) {
    await attempt(async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  }

  for (let poll = 0; poll < 10; poll += 1) {
    const { count, error } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('id', users);
    if (error) {
      cleanupErrors.push(error);
      break;
    }
    if (!count) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (poll === 9) {
      cleanupErrors.push(new Error('Temporary E2E profiles remain after cleanup'));
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Focused E2E cleanup failed');
  }
}

let runError;
try {
  const owner = await createTemporaryUser(1);
  const recipient = await createTemporaryUser(2);
  const participant = await createTemporaryUser(3);

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .insert({
      conversation_type: 'group',
      name: `Temporary agreement ${marker}`,
      created_by: owner.id,
    })
    .select('id')
    .single();
  if (conversationError) throw conversationError;
  resources.conversationId = conversation.id;

  const { error: participantsError } = await admin
    .from('conversation_participants')
    .insert([
      { conversation_id: conversation.id, user_id: owner.id, role: 'admin' },
      { conversation_id: conversation.id, user_id: recipient.id, role: 'member' },
      { conversation_id: conversation.id, user_id: participant.id, role: 'member' },
    ]);
  if (participantsError) throw participantsError;

  const message = await request(`/conversations/${conversation.id}/messages`, {
    token: owner.token,
    method: 'POST',
    body: {
      text: `Temporary shared agreement ${marker}`,
      client_message_id: randomUUID(),
    },
  });
  check('source message created', message.response.status === 201);
  resources.messageId = message.payload.message.id;

  const initialDueAt = new Date(Date.now() + (3 * 86_400_000)).toISOString();
  const proposal = await request('/commitment-proposals/shared', {
    token: owner.token,
    method: 'POST',
    body: {
      title: 'Temporary shared agreement',
      conversation_id: conversation.id,
      message_id: resources.messageId,
      assigned_to_user_id: owner.id,
      due_at: initialDueAt,
      expected_result: 'Every participant approves the same version',
    },
  });
  check(
    'proposal remains pending before every response',
    proposal.response.status === 201 && proposal.payload?.status === 'pending',
  );
  resources.proposalId = proposal.payload.id;

  const counterDueAt = new Date(Date.now() + (4 * 86_400_000)).toISOString();
  const counter = await request(`/commitment-proposals/${resources.proposalId}/respond`, {
    token: participant.token,
    method: 'POST',
    body: {
      decision: 'counter_propose',
      proposedDueAt: counterDueAt,
    },
  });
  check(
    'participant can counter-propose without creating Commitment',
    counter.response.status === 200 && counter.payload?.commitment === null,
  );

  const ownerApproval = await request(
    `/commitment-proposals/${resources.proposalId}/respond`,
    {
      token: owner.token,
      method: 'POST',
      body: { decision: 'approve' },
    },
  );
  check(
    'partial approval still creates no Commitment',
    ownerApproval.response.status === 200 && ownerApproval.payload?.commitment === null,
  );

  const finalApproval = await request(
    `/commitment-proposals/${resources.proposalId}/respond`,
    {
      token: recipient.token,
      method: 'POST',
      body: { decision: 'approve' },
    },
  );
  check(
    'last approval creates confirmed Commitment',
    finalApproval.response.status === 200
      && finalApproval.payload?.proposal?.status === 'confirmed'
      && finalApproval.payload?.commitment?.status === 'accepted',
  );
  resources.commitmentId = finalApproval.payload.commitment.id;

  const recipientCommitments = await request('/commitments', { token: recipient.token });
  const sharedCommitment = recipientCommitments.payload?.find(
    (commitment) => commitment.id === resources.commitmentId,
  );
  check(
    'recipient sees shared Commitment in dashboard',
    recipientCommitments.response.status === 200
      && sharedCommitment?.agreement_responses?.some(
        (response) => response.participant_user_id === recipient.id,
      ),
  );

  const insights = await request('/insights', { token: recipient.token });
  const insightCommitments = [
    ...(insights.payload?.needsAttention || []),
    ...(insights.payload?.awaitingResponse || []),
    ...(insights.payload?.overdue || []),
    ...(insights.payload?.upcoming || []),
    ...(insights.payload?.noDate || []),
    ...(insights.payload?.actionDonePendingResolution || []),
    ...(insights.payload?.recentlyResolved || []),
  ];
  check(
    'recipient sees shared Commitment in Insights',
    insights.response.status === 200
      && insightCommitments.some(
        (commitment) => commitment.id === resources.commitmentId,
      ),
  );
} catch (error) {
  runError = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    if (runError) {
      throw new AggregateError([runError, cleanupError], 'Focused E2E and cleanup failed');
    }
    throw cleanupError;
  }
}

if (runError) throw runError;

console.log(JSON.stringify({
  projectRef: EXPECTED_PROJECT_REF,
  target: 'remote-staging',
  status: 'passed',
  checks,
  cleanup: 'verified',
}, null, 2));
