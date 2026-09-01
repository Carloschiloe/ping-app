import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    createSupabaseAdminMock,
    setSupabaseAdminMock,
    supabaseAdminMockModule,
} from './helpers/supabaseMock';

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/notification.service', () => ({
    NotificationService: { sendPushNotifications: vi.fn(async () => null) },
}));

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const PROPOSAL = '44444444-4444-4444-8444-444444444444';
const COMMITMENT = '55555555-5555-4555-8555-555555555555';

describe('C-1 vertical canonical Commitment flow', () => {
    it('preserves source and routes confirmation, follow-up and resolution through atomic evidence RPCs', async () => {
        const suggestedTask = {
            hasCommitment: true,
            title: 'Enviar el informe',
            dueAt: '2026-08-29T12:00:00.000Z',
            replyText: 'Agendar',
            assignedToName: null,
            type: 'task',
        };
        const accepted = {
            id: COMMITMENT,
            proposal_id: PROPOSAL,
            message_id: MESSAGE,
            conversation_id: CONVERSATION,
            owner_user_id: USER,
            assigned_to_user_id: USER,
            counterparty_contact_id: null,
            title: suggestedTask.title,
            due_at: suggestedTask.dueAt,
            proposed_due_at: null,
            status: 'accepted',
            meta: {},
        };

        const mock = createSupabaseAdminMock({
            conversation_participants: [
                {
                    data: [{ conversation_id: CONVERSATION }],
                    error: null,
                },
                {
                    data: { conversation_id: CONVERSATION, role: 'admin' },
                    error: null,
                },
                {
                    data: { conversation_id: CONVERSATION, role: 'admin' },
                    error: null,
                },
            ],
            messages: [
                {
                    data: {
                        id: MESSAGE,
                        conversation_id: CONVERSATION,
                        sender_id: USER,
                        content: 'Mañana a las 12 enviar el informe',
                        metadata: { suggestedTask },
                    },
                    error: null,
                },
                {
                    data: { id: MESSAGE, conversation_id: CONVERSATION, sender_id: USER },
                    error: null,
                },
            ],
            commitments: [
                { data: accepted, error: null },
                { data: accepted, error: null },
                { data: accepted, error: null },
                { data: accepted, error: null },
            ],
            profiles: [{ data: { full_name: 'Carlos' }, error: null }],
            'rpc:create_conversation_with_participants': [{ data: CONVERSATION, error: null }],
            'rpc:persist_message_with_attachment': [{
                data: [{ message_id: MESSAGE, idempotent_replay: false }],
                error: null,
            }],
            'rpc:create_commitment_proposal_with_evidence': [{
                data: {
                    id: PROPOSAL,
                    source_message_id: MESSAGE,
                    conversation_id: CONVERSATION,
                    source_kind: 'ai_suggestion',
                    status: 'pending',
                },
                error: null,
            }],
            'rpc:confirm_commitment_proposal': [{ data: accepted, error: null }],
            'rpc:apply_commitment_transition_with_evidence': [
                {
                    data: {
                        ...accepted,
                        follow_up_at: '2026-08-30T15:00:00.000Z',
                        next_action: 'Verificar recepción',
                    },
                    error: null,
                },
                {
                    data: {
                        ...accepted,
                        status: 'resolved',
                        resolved_at: '2026-08-30T16:00:00.000Z',
                        resolution_result: 'Informe recibido y aprobado',
                    },
                    error: null,
                },
            ],
        });
        setSupabaseAdminMock(mock);

        const { processUserMessage } = await import('../src/services/message.service');
        const { getOrCreateSelfConversationId } = await import('../src/services/conversation.service');
        const core = await import('../src/services/commitmentApplication.service');

        // In the canonical model a self-chat is a direct conversation whose
        // only participant is the user. Exercise that lookup before capture.
        const selfConversationId = await getOrCreateSelfConversationId(USER);
        expect(selfConversationId).toBe(CONVERSATION);
        expect(mock.getInsertCalls('conversations')).toHaveLength(0);

        const messageResult = await processUserMessage(
            USER,
            'Mañana a las 12 enviar el informe',
            selfConversationId
        );
        const messageWrite = mock.getRpcCalls().find((call) => call.name === 'persist_message_with_attachment');
        const originalInsert = { content: messageWrite?.args.p_content, metadata: messageWrite?.args.p_metadata };
        expect(originalInsert.content).toBe('Mañana a las 12 enviar el informe');
        expect(originalInsert.metadata.suggestedTask).toEqual(expect.objectContaining({
            replyText: 'Agendar',
        }));
        expect(messageResult.message.text).toBe('Mañana a las 12 enviar el informe');

        const commitment = await core.createConfirmedCommitment(USER, {
            title: suggestedTask.title,
            due_at: suggestedTask.dueAt,
            conversation_id: CONVERSATION,
            message_id: MESSAGE,
            source_kind: 'ai_suggestion',
        });
        expect(commitment).toMatchObject({
            id: COMMITMENT,
            proposal_id: PROPOSAL,
            message_id: MESSAGE,
            status: 'accepted',
        });

        await core.scheduleFollowUp(
            USER,
            COMMITMENT,
            '2026-08-30T15:00:00.000Z',
            'Verificar recepción'
        );
        const resolved = await core.resolveCommitment(
            USER,
            COMMITMENT,
            'Informe recibido y aprobado'
        );
        expect(resolved).toMatchObject({
            status: 'resolved',
            resolution_result: 'Informe recibido y aprobado',
        });

        const rpcCalls = mock.getRpcCalls();
        expect(rpcCalls.map((call) => call.name)).toEqual([
            'create_conversation_with_participants',
            'persist_message_with_attachment',
            'merge_message_suggested_task',
            'create_commitment_proposal_with_evidence',
            'confirm_commitment_proposal',
            'apply_commitment_transition_with_evidence',
            'apply_commitment_transition_with_evidence',
        ]);
        expect(rpcCalls[3].args.p_proposal).toEqual(expect.objectContaining({
            conversation_id: CONVERSATION,
            source_message_id: MESSAGE,
            source_kind: 'ai_suggestion',
        }));
        expect(rpcCalls[5].args).toEqual(expect.objectContaining({
            p_event_type: 'follow_up_scheduled',
            p_patch: expect.objectContaining({
                follow_up_at: '2026-08-30T15:00:00.000Z',
            }),
        }));
        expect(rpcCalls[6].args).toEqual(expect.objectContaining({
            p_event_type: 'resolved',
            p_patch: expect.objectContaining({
                status: 'resolved',
                resolution_result: 'Informe recibido y aprobado',
            }),
        }));

        // The backend never performs an independent row/event/audit write in
        // this vertical flow. Those three writes are owned by each RPC's
        // database transaction.
        expect(mock.getInsertCalls('commitments')).toHaveLength(0);
        expect(mock.getUpdateCalls('commitments')).toHaveLength(0);
        expect(mock.getInsertCalls('commitment_events')).toHaveLength(0);
        expect(mock.getInsertCalls('commitment_audit_records')).toHaveLength(0);
    }, 30_000);

    it('keeps SQL evidence contracts atomic for proposal, confirmation, transition and edit', () => {
        const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
        const proposalSql = fs.readFileSync(
            path.join(migrationsDir, '20260728200000_harden_commitment_beta_permissions.sql'),
            'utf8'
        );
        const confirmationSql = fs.readFileSync(
            path.join(migrationsDir, '20260730123000_shared_commitment_agreements.sql'),
            'utf8'
        );
        const transitionSql = fs.readFileSync(
            path.join(migrationsDir, '20260728183000_atomic_commitment_evidence.sql'),
            'utf8'
        );
        const editSql = fs.readFileSync(
            path.join(migrationsDir, '20260828160000_commitment_core_canonical_writes.sql'),
            'utf8'
        );

        expect(proposalSql).toMatch(/create_commitment_proposal_with_evidence[\s\S]*commitment_proposal_events[\s\S]*commitment_audit_records/);
        expect(confirmationSql).toMatch(/finalize_approved_commitment_proposal[\s\S]*commitment_events[\s\S]*commitment_audit_records/);
        expect(transitionSql).toMatch(/apply_commitment_transition_with_evidence[\s\S]*commitment_events[\s\S]*commitment_audit_records/);
        expect(editSql).toMatch(/edit_commitment_with_evidence[\s\S]*commitment_events[\s\S]*commitment_audit_records/);
        expect(editSql).toMatch(/archive_commitment_with_evidence[\s\S]*commitment_events[\s\S]*commitment_audit_records/);
    });
});
