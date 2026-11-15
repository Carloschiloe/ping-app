// The recording → summary → proposals path with fake providers: no network.
import { describe, expect, it, vi } from 'vitest';
import { processMeetingRecording, proposalKey, type MeetingJob, type MeetingPipelineDeps } from '../src/services/meetings/meetingPipeline';
import { analyzeMeeting } from '../src/services/meetings/meetingAnalysis';
import { MeetingProviderError, type MeetingTranscriber } from '../src/services/meetings/meetingTypes';
import type { MeetingLlm } from '../src/services/meetings/meetingLlm';

const job: MeetingJob = {
    callId: 'call-1', conversationId: 'conv-1', requestedBy: 'user-1', userName: 'Carlos',
    participants: ['Carlos', 'Paula'], startedAt: new Date('2026-11-16T13:00:00Z'), timeZone: 'America/Santiago',
};

const okTranscriber = (id: string): MeetingTranscriber => ({
    id, diarizes: true,
    transcribe: vi.fn(async () => ({
        text: 'yo te mando la cotización el miércoles', segments: [{ speaker: 'Paula', text: 'yo te mando la cotización el miércoles', startMs: 0, endMs: 2000 }],
        language: 'es', durationSec: 2, provider: id.split(':')[0], model: id.split(':')[1], latencyMs: 10, usage: null,
    })),
});
const downTranscriber = (id: string): MeetingTranscriber => ({ id, diarizes: true, transcribe: vi.fn(async () => { throw new MeetingProviderError('provider_unavailable', true); }) });

const answer = {
    summary: 'Paula enviará la cotización.', decisions: [],
    commitments: [
        { owner: 'Paula', task: 'Enviar cotización', due_date: '2026-11-18', conditional: false },
        { owner: 'Paula', task: 'Enviar cotización', due_date: '2026-11-18' },
    ],
};
const fakeLlm = (fail: string[] = []): MeetingLlm => ({
    completeJson: vi.fn(async (target) => {
        if (fail.includes(target.provider)) throw new MeetingProviderError('provider_no_credit', false);
        return { json: answer, raw: '', inputTokens: 100, outputTokens: 50, latencyMs: 5, attempts: 1, costUsd: null };
    }),
});

function deps(overrides: Partial<MeetingPipelineDeps> = {}, llm = fakeLlm()): MeetingPipelineDeps & { created: string[]; deleted: string[] } {
    const created: string[] = []; const deleted: string[] = [];
    return {
        created, deleted,
        consentGiven: async () => true,
        loadRecording: async () => ({ bytes: Buffer.from('audio'), mimeType: 'audio/mp4', fileName: 'a.m4a', seconds: 120 }),
        transcribers: [okTranscriber('openai:gpt-transcribe')],
        analysisTargets: [{ provider: 'google', model: 'gemini-3.1-flash-lite' }],
        existingProposalKeys: async () => new Set(),
        saveResult: async () => undefined,
        createProposal: async (_job, _c, key) => { created.push(key); },
        deleteAudio: async (callId) => { deleted.push(callId); },
        keepAudio: false,
        allowance: async () => true,
        analyze: (input, targets) => analyzeMeeting(input, targets, llm),
        ...overrides,
    };
}

describe('meeting pipeline', () => {
    it('never touches the audio without everybody’s yes', async () => {
        const d = deps({ consentGiven: async () => false });
        expect(await processMeetingRecording(job, d)).toEqual({ status: 'no_consent' });
        expect((d.transcribers[0].transcribe as any).mock.calls).toHaveLength(0);
    });

    it('creates proposals only, once each, and deletes the audio afterwards', async () => {
        const d = deps();
        const outcome = await processMeetingRecording(job, d);
        expect(outcome).toMatchObject({ status: 'processed', proposals: 1 });
        expect(d.created).toHaveLength(1);
        expect(d.deleted).toEqual(['call-1']);
    });

    it('a retry of the same recording adds no proposal twice', async () => {
        const key = proposalKey('call-1', { owner: 'Paula', task: 'Enviar cotización', dueDate: '2026-11-18' } as any);
        const d = deps({ existingProposalKeys: async () => new Set([key]) });
        expect(await processMeetingRecording(job, d)).toMatchObject({ status: 'processed', proposals: 0, skippedDuplicates: 1 });
    });

    it('moves to the backup providers when the first ones are down or out of credit', async () => {
        const llm = fakeLlm(['google']);
        const d = deps({
            transcribers: [downTranscriber('groq:whisper-large-v3-turbo'), okTranscriber('openai:gpt-transcribe')],
            analysisTargets: [{ provider: 'google', model: 'gemini-3.1-flash-lite' }, { provider: 'openai', model: 'gpt-6-luna' }],
        }, llm);
        expect(await processMeetingRecording(job, d)).toMatchObject({ status: 'processed', transcriber: 'openai:gpt-transcribe', analyzer: 'openai:gpt-6-luna' });
    });

    it('keeps the audio and reports a retryable failure when every provider is down', async () => {
        const d = deps({ transcribers: [downTranscriber('a:b'), downTranscriber('c:d')] });
        expect(await processMeetingRecording(job, d)).toEqual({ status: 'failed', code: 'provider_unavailable', retryable: true });
        expect(d.deleted).toEqual([]);
    });

    it('stops before spending when the user has no minutes left', async () => {
        const d = deps({ allowance: async () => false });
        expect(await processMeetingRecording(job, d)).toEqual({ status: 'over_allowance' });
    });
});
