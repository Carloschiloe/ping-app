// Takes one finished call recording at a time and turns it into a summary
// each participant receives in their own chat with Vorian.
//
//   tracks (one per phone) → transcript → summary and commitments → notices
//
// Nothing becomes a commitment here: Vorian only offers to note each one, and
// the person says yes. What every step cost is written to ai_usage (and the
// total to meeting_jobs.cost_usd), so the admin panel always shows it.
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { costFor, recordAiUsage, type AiUsage } from '../aiUsage.service';
import { deliverMeetingSummary, INITIATIVE_NOTE_PREFIX } from '../assistant/assistantInitiative.service';
import { resolveAutomationTimezone } from '../automationTimezone.service';
import { analyzeMeeting, normalizeKey } from './meetingAnalysis';
import { parseLlmTarget } from './meetingLlm';
import { MEETING_PIPELINE_VERSION } from './meetingPipeline';
import { allParticipantsConsented, meetingSummariesEnabled, participantIds, RECORDINGS_BUCKET } from './meetingRecording.service';
import { GeminiTranscriber, interleaveTracks, OpenAiStyleTranscriber, transcriptAsDialogue, type TrackPiece } from './meetingTranscription';
import { MeetingAnalysis, MeetingAnalysisRun, MeetingProviderError, MeetingTranscript, ProposedMeetingCommitment } from './meetingTypes';

const WORKER_ID = randomUUID();
const SWEEP_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 4;

const TRANSCRIBER_MODEL = process.env.MEETING_TRANSCRIBER_MODEL || 'gemini-3.1-flash-lite';
const BACKUP_TRANSCRIBER_MODEL = process.env.MEETING_BACKUP_TRANSCRIBER_MODEL || 'whisper-1';
const ANALYZERS = (process.env.MEETING_ANALYZERS || 'openai:gpt-6-luna@low,google:gemini-3.1-flash-lite')
    .split(',').map((s) => s.trim()).filter(Boolean).map(parseLlmTarget);

// pieces: when the phone kept only the moments its person spoke (see callTimeMs).
type Track = { path: string; startedAt: string; seconds: number; pieces?: TrackPiece[] | null };
type JobRow = {
    id: string;
    call_id: string;
    requested_by: string;
    attempts: number;
    tracks: Record<string, Track>;
};
type Person = { id: string; name: string; firstName: string };

export interface StoredMeetingAnalysis extends MeetingAnalysis {
    version: string;
    /** participant id → indexes of the commitments that are theirs */
    owners: Record<string, number[]>;
    delivered: string[];
}

// ---------- pieces that do not touch the network (tested on their own) ----------

/** Seconds after the first phone started recording. */
export function trackOffsets(tracks: Track[]): number[] {
    const starts = tracks.map((t) => Date.parse(t.startedAt)).map((n) => (Number.isFinite(n) ? n : 0));
    const first = Math.min(...starts);
    return starts.map((s) => Math.max(0, (s - first) / 1000));
}

/** Which participant each commitment belongs to, by the name said in the call. */
export function ownersByParticipant(commitments: ProposedMeetingCommitment[], people: Person[], userId: string): Record<string, number[]> {
    const owners: Record<string, number[]> = {};
    commitments.forEach((c, index) => {
        const said = normalizeKey(c.owner || '');
        const match = c.ownerIsUser
            ? people.find((p) => p.id === userId)
            : people.find((p) => said && (normalizeKey(p.name) === said || normalizeKey(p.firstName) === said.split(' ')[0]));
        if (match) (owners[match.id] ||= []).push(index);
    });
    return owners;
}

function describeCommitment(c: ProposedMeetingCommitment): string {
    const when = c.dueDate ? ` (fecha ${c.dueDate}${c.dueText ? `, dicho como «${c.dueText}»` : ''})` : c.dueText ? ` (dicho como «${c.dueText}»)` : '';
    const condition = c.conditional ? ` — solo si ${c.condition || 'se cumple lo que dijeron'}` : '';
    return `${c.task}${when}${condition}`;
}

/** What Vorian is told, for one participant. */
export function meetingNoteFor(person: Person, others: Person[], analysis: StoredMeetingAnalysis): string {
    const mine = (analysis.owners[person.id] || []).map((i) => analysis.commitments[i]);
    const theirs = analysis.commitments
        .map((c, i) => ({ c, i }))
        .filter(({ i }) => !(analysis.owners[person.id] || []).includes(i));
    const lines = [
        `${INITIATIVE_NOTE_PREFIX} terminó una llamada del usuario con ${others.map((p) => p.name).join(', ') || 'otra persona'}, que todos aceptaron grabar para resumir. Este es el resultado.`,
        `Resumen: ${analysis.summary}`,
    ];
    if (analysis.decisions.length) lines.push(`Acuerdos: ${analysis.decisions.join('; ')}.`);
    lines.push(mine.length ? `Quedó a cargo del usuario: ${mine.map((c, n) => `${n + 1}) ${describeCommitment(c)}`).join('; ')}.` : 'No quedó nada a cargo del usuario.');
    if (theirs.length) lines.push(`Quedó a cargo de otros: ${theirs.map(({ c }) => `${c.owner || 'alguien'}: ${describeCommitment(c)}`).join('; ')}.`);
    if (analysis.openQuestions.length) lines.push(`Quedó pendiente: ${analysis.openQuestions.join('; ')}.`);
    lines.push(mine.length
        ? 'Cuéntale el resumen en pocas frases, sin leerlo entero. Luego ofrécele anotar lo que quedó a su cargo y prepáralo con propose_create_commitment, uno por cada compromiso y con su fecha; no anotes nada hasta que diga que sí. Lo que es condicional, dilo como condicional.'
        : 'Cuéntale el resumen en pocas frases, sin leerlo entero, y no ofrezcas anotar nada.');
    return lines.join('\n');
}

// ---------- the job ----------

async function people(conversationId: string): Promise<Person[]> {
    const ids = await participantIds(conversationId);
    const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', ids);
    if (error) throw error;
    return (data || []).map((row: any) => {
        const name = (typeof row.full_name === 'string' && row.full_name.trim()) || String(row.email || 'Alguien').split('@')[0];
        return { id: row.id, name, firstName: name.split(/\s+/)[0] };
    });
}

async function removeAudio(paths: string[]): Promise<void> {
    if (paths.length) await supabaseAdmin.storage.from(RECORDINGS_BUCKET).remove(paths);
}

function meter(feature: 'reunion_transcripcion' | 'reunion_resumen', model: string, usage: AiUsage, userId: string): number {
    recordAiUsage({ feature, model, usage, userId });
    return costFor(model, usage);
}

async function transcribe(job: JobRow, byId: Map<string, Person>): Promise<{ transcript: MeetingTranscript; cost: number; seconds: number }> {
    const all = Object.entries(job.tracks || {}).filter(([id]) => byId.has(id));
    if (!all.length) throw new MeetingProviderError('no_recording', false);
    const offsets = trackOffsets(all.map(([, t]) => t));
    const seconds = Math.max(...all.map(([, t], i) => (t.seconds || 0) + offsets[i]));
    const tracks = [];
    for (const [index, [id, t]] of all.entries()) {
        // A phone that cut its silences and kept nothing: that person never spoke.
        if (Array.isArray(t.pieces) && t.pieces.length === 0) continue;
        const { data, error } = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).download(t.path);
        if (error || !data) throw new MeetingProviderError('storage_unavailable', true);
        tracks.push({
            speaker: byId.get(id)!.name, bytes: Buffer.from(await data.arrayBuffer()), mimeType: 'audio/webm', fileName: `${id}.webm`,
            offsetSec: offsets[index], pieces: t.pieces || undefined,
            spokenSeconds: t.pieces ? t.pieces.reduce((sum, p) => sum + p.len, 0) : t.seconds,
        });
    }
    if (!tracks.length) throw new MeetingProviderError('no_recording', false);
    try {
        const transcript = await new GeminiTranscriber(TRANSCRIBER_MODEL).transcribeTracks(tracks);
        const cost = meter('reunion_transcripcion', TRANSCRIBER_MODEL, transcript.usage || {}, job.requested_by);
        return { transcript, cost, seconds };
    } catch (error) {
        console.warn('[MeetingWorker] Joint transcription failed, using the backup', { code: (error as any)?.code });
    }
    // Backup: each track on its own, put back in call order by its times.
    const backup = new OpenAiStyleTranscriber('openai', BACKUP_TRANSCRIBER_MODEL);
    const parts = [];
    let cost = 0;
    for (const t of tracks) {
        const one = await backup.transcribe({ bytes: t.bytes, mimeType: t.mimeType, fileName: t.fileName, languageHint: 'es' });
        cost += meter('reunion_transcripcion', BACKUP_TRANSCRIBER_MODEL, one.usage || { audioSeconds: t.spokenSeconds }, job.requested_by);
        parts.push({ speaker: t.speaker, segments: one.segments, pieces: t.pieces, offsetSec: t.offsetSec, first: one });
    }
    const segments = interleaveTracks(parts);
    const first = parts[0].first;
    return {
        transcript: {
            text: segments.map((x) => x.text).join(' '), segments, language: first.language, durationSec: seconds,
            provider: first.provider, model: first.model, latencyMs: Math.max(...parts.map((x) => x.first.latencyMs)), usage: null,
        },
        cost,
        seconds,
    };
}

async function finish(job: JobRow, patch: Record<string, unknown>): Promise<void> {
    await supabaseAdmin.from('meeting_jobs').update({ ...patch, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq('id', job.id);
}

async function processJob(job: JobRow): Promise<void> {
    const paths = Object.values(job.tracks || {}).map((t) => t.path);
    const { data: call, error: callError } = await supabaseAdmin
        .from('calls').select('id, conversation_id, created_at, analysis').eq('id', job.call_id).maybeSingle();
    if (callError) throw callError;
    if (!call) { await removeAudio(paths); await finish(job, { status: 'cancelled', last_error: 'call_missing' }); return; }

    // Checked again right before the audio is used.
    if (!(await allParticipantsConsented(job.call_id, call.conversation_id))) {
        await removeAudio(paths);
        await finish(job, { status: 'cancelled', last_error: 'no_consent' });
        return;
    }

    const everyone = await people(call.conversation_id);
    const byId = new Map(everyone.map((p) => [p.id, p]));
    const requester = byId.get(job.requested_by) || everyone[0];
    let stored = (call.analysis && (call.analysis as any).version === MEETING_PIPELINE_VERSION) ? call.analysis as StoredMeetingAnalysis : null;
    let cost = 0;

    if (!stored) {
        const { transcript, cost: transcriptionCost, seconds } = await transcribe(job, byId);
        cost += transcriptionCost;
        const { data: profile } = await supabaseAdmin.from('profiles').select('timezone').eq('id', requester.id).maybeSingle();
        const run: MeetingAnalysisRun = await analyzeMeeting({
            transcript: transcriptAsDialogue(transcript),
            userName: requester.name,
            participants: everyone.map((p) => p.name),
            now: new Date(call.created_at),
            timeZone: resolveAutomationTimezone((profile as any)?.timezone),
        }, ANALYZERS);
        cost += meter('reunion_resumen', run.model, { inputTokens: run.inputTokens, outputTokens: run.outputTokens }, requester.id);
        stored = {
            ...run.analysis,
            version: MEETING_PIPELINE_VERSION,
            owners: ownersByParticipant(run.analysis.commitments, everyone, requester.id),
            delivered: [],
        };
        const { error } = await supabaseAdmin.from('calls').update({
            transcript: transcript.text,
            summary: run.analysis.summary,
            analysis: stored,
            status: 'processed',
            recording_seconds: Math.round(seconds),
            transcript_delete_after: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
        }).eq('id', job.call_id);
        if (error) throw error;
        await supabaseAdmin.from('meeting_jobs').update({
            transcriber: `${transcript.provider}:${transcript.model}`,
            analyzer: `${run.provider}:${run.model}`,
            audio_seconds: Math.round(seconds),
            cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
            updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        // The text is kept; the audio is not needed any more.
        await removeAudio(paths);
        await supabaseAdmin.from('calls').update({ audio_deleted_at: new Date().toISOString() }).eq('id', job.call_id);
    }

    for (const person of everyone) {
        if (stored.delivered.includes(person.id)) continue;
        const others = everyone.filter((p) => p.id !== person.id);
        await deliverMeetingSummary(person.id, `meeting:${job.call_id}:${person.id}`, meetingNoteFor(person, others, stored));
        stored.delivered.push(person.id);
        await supabaseAdmin.from('calls').update({ analysis: stored }).eq('id', job.call_id);
    }
    await finish(job, { status: 'processed', last_error: null });
}

export async function processNextMeetingJob(): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('claim_meeting_job', { p_worker_id: WORKER_ID });
    if (error) return false; // before the database change, or the database is away
    const job = (Array.isArray(data) ? data[0] : data) as JobRow | null;
    if (!job) return false;
    try {
        await processJob(job);
    } catch (error: any) {
        const retryable = !(error instanceof MeetingProviderError) || error.retryable;
        const code = error instanceof MeetingProviderError ? error.code : 'worker_error';
        console.error('[MeetingWorker] Job failed', { jobId: job.id, code, attempts: job.attempts });
        if (retryable && job.attempts < MAX_ATTEMPTS) {
            await finish(job, { status: 'pending', last_error: code, next_attempt_at: new Date(Date.now() + job.attempts * 5 * 60_000).toISOString() });
        } else {
            // Out of tries: the audio is not kept around.
            await removeAudio(Object.values(job.tracks || {}).map((t) => t.path)).catch(() => undefined);
            await finish(job, { status: 'failed', last_error: code });
        }
    }
    return true;
}

let interval: NodeJS.Timeout | null = null;
let running = false;

export async function runMeetingSweep(): Promise<void> {
    if (running) return;
    running = true;
    try {
        if (!(await meetingSummariesEnabled())) return;
        for (let i = 0; i < 3; i += 1) if (!(await processNextMeetingJob())) break;
    } finally {
        running = false;
    }
}

export function wakeMeetingWorker(): void {
    queueMicrotask(() => { runMeetingSweep().catch(() => undefined); });
}

export function startMeetingWorker(): void {
    if (interval) return;
    interval = setInterval(wakeMeetingWorker, SWEEP_INTERVAL_MS);
    interval.unref?.();
}
