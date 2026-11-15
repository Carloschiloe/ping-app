// Shapes shared by every step that turns an authorised call into a summary
// and proposed commitments: transcription → analysis → proposals the user
// confirms. Each step talks to a provider through these shapes only, so a
// provider can be swapped without touching the rest of Vorian.

export interface TranscriptSegment {
    speaker: string | null; // provider label ("A", "speaker_0") or a name when known
    text: string;
    startMs: number | null;
    endMs: number | null;
}

export interface MeetingTranscript {
    text: string;
    segments: TranscriptSegment[];
    language: string | null;
    durationSec: number | null;
    provider: string;
    model: string;
    latencyMs: number;
    /** What the provider billed, in its own unit, when it says so. */
    usage: { audioSeconds?: number; inputTokens?: number; audioInputTokens?: number; outputTokens?: number } | null;
}

export interface MeetingTranscriber {
    readonly id: string; // "openai:gpt-transcribe"
    readonly diarizes: boolean;
    transcribe(audio: { bytes: Buffer; mimeType: string; fileName: string; languageHint?: string; speakerHints?: string[] }): Promise<MeetingTranscript>;
}

export interface ProposedMeetingCommitment {
    owner: string | null; // who will do it, as said in the meeting
    ownerIsUser: boolean; // the Vorian owner themself
    task: string; // short, agenda-style
    dueDate: string | null; // YYYY-MM-DD, local
    dueText: string | null; // as it was said ("el viernes")
    conditional: boolean;
    condition: string | null;
    dependsOn: number | null; // index of another commitment in the same list
    quote: string | null; // words from the transcript that back it
    confidence: 'alta' | 'media' | 'baja';
}

export interface MeetingAnalysis {
    summary: string;
    decisions: string[];
    commitments: ProposedMeetingCommitment[];
    openQuestions: string[];
}

export interface MeetingAnalysisRun {
    analysis: MeetingAnalysis;
    provider: string;
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    attempts: number;
    costUsd: number | null;
}

export class MeetingProviderError extends Error {
    constructor(public readonly code: string, public readonly retryable: boolean, message?: string) {
        super(message || code);
        this.name = 'MeetingProviderError';
    }
}
