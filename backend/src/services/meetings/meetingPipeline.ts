// The whole path for one authorised recording, written against small
// interfaces so it can be tested without a database or a provider:
//
//   recording → transcript → analysis → proposals the user confirms
//
// It is NOT wired to any route yet. The worker that will call it must take
// a job with a lock (see meeting_jobs in the prepared migration), so the same
// recording is never processed twice, and it only ever creates proposals:
// nothing becomes a commitment until a person confirms it.
import { analyzeMeeting, MEETING_ANALYSIS_VERSION, normalizeKey } from './meetingAnalysis';
import { MeetingLlmTarget } from './meetingLlm';
import { transcribeWithFallback, transcriptAsDialogue } from './meetingTranscription';
import { MeetingAnalysisRun, MeetingProviderError, MeetingTranscriber, MeetingTranscript, ProposedMeetingCommitment } from './meetingTypes';

export const MEETING_PIPELINE_VERSION = `${MEETING_ANALYSIS_VERSION}-p1`;

export interface MeetingJob {
    callId: string;
    conversationId: string;
    requestedBy: string; // the user whose Vorian this summary is for
    userName: string;
    participants: string[];
    startedAt: Date;
    timeZone: string;
}

export interface MeetingPipelineDeps {
    /** Every participant said yes to recording; checked again before using the audio. */
    consentGiven(callId: string): Promise<boolean>;
    loadRecording(callId: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string; seconds: number } | null>;
    transcribers: MeetingTranscriber[];
    analysisTargets: MeetingLlmTarget[];
    /** Proposals already stored for this call, so a retry adds nothing twice. */
    existingProposalKeys(callId: string): Promise<Set<string>>;
    saveResult(job: MeetingJob, result: { transcript: MeetingTranscript; analysis: MeetingAnalysisRun; version: string }): Promise<void>;
    createProposal(job: MeetingJob, commitment: ProposedMeetingCommitment, key: string): Promise<void>;
    deleteAudio(callId: string): Promise<void>;
    /** Keep the audio after processing? Off by default: the transcript is enough. */
    keepAudio: boolean;
    /** Stop when the minutes this user has left are not enough. */
    allowance(userId: string, seconds: number): Promise<boolean>;
    analyze?: typeof analyzeMeeting;
}

export type MeetingOutcome =
    | { status: 'processed'; proposals: number; skippedDuplicates: number; transcriber: string; analyzer: string }
    | { status: 'no_consent' | 'no_recording' | 'over_allowance' }
    | { status: 'failed'; code: string; retryable: boolean };

/** Same owner, same task and same date: the same proposal. */
export function proposalKey(callId: string, c: ProposedMeetingCommitment): string {
    return `${callId}|${normalizeKey(c.owner || '')}|${normalizeKey(c.task)}|${c.dueDate || ''}`;
}

export async function processMeetingRecording(job: MeetingJob, deps: MeetingPipelineDeps): Promise<MeetingOutcome> {
    try {
        if (!(await deps.consentGiven(job.callId))) return { status: 'no_consent' };
        const recording = await deps.loadRecording(job.callId);
        if (!recording) return { status: 'no_recording' };
        if (!(await deps.allowance(job.requestedBy, recording.seconds))) return { status: 'over_allowance' };

        const transcript = await transcribeWithFallback(
            { bytes: recording.bytes, mimeType: recording.mimeType, fileName: recording.fileName, languageHint: 'es', speakerHints: job.participants },
            deps.transcribers,
        );
        const analysis = await (deps.analyze || analyzeMeeting)({
            transcript: transcriptAsDialogue(transcript), userName: job.userName, participants: job.participants,
            now: job.startedAt, timeZone: job.timeZone,
        }, deps.analysisTargets);

        await deps.saveResult(job, { transcript, analysis, version: MEETING_PIPELINE_VERSION });

        const existing = await deps.existingProposalKeys(job.callId);
        let proposals = 0; let skippedDuplicates = 0;
        for (const commitment of analysis.analysis.commitments) {
            const key = proposalKey(job.callId, commitment);
            if (existing.has(key)) { skippedDuplicates += 1; continue; }
            existing.add(key);
            await deps.createProposal(job, commitment, key);
            proposals += 1;
        }
        if (!deps.keepAudio) await deps.deleteAudio(job.callId);
        return { status: 'processed', proposals, skippedDuplicates, transcriber: `${transcript.provider}:${transcript.model}`, analyzer: `${analysis.provider}:${analysis.model}` };
    } catch (error) {
        if (error instanceof MeetingProviderError) return { status: 'failed', code: error.code, retryable: error.retryable };
        return { status: 'failed', code: 'unexpected', retryable: true };
    }
}
