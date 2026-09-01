import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
    isTranscriptionConfigured,
    transcribeAudioDetailed,
    TranscriptionProviderError,
} from './transcription.service';

const WORKER_ID = randomUUID();
const SWEEP_INTERVAL_MS = 30_000;
const MAX_JOBS_PER_SWEEP = 5;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

type JobRow = {
    id: string;
    attachment_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    transcript_text: string | null;
};

type JobContext = {
    attachment_id: string;
    message_id: string;
    conversation_id: string;
    bucket: string;
    object_path: string;
    mime_type: string;
    size_bytes: number;
    attachment_lifecycle: string;
    message_deleted_at: string | null;
    conversation_deleted_at: string | null;
    transcript_text: string | null;
    pipeline_version: string;
};

let sweepRunning = false;
let interval: NodeJS.Timeout | null = null;

function rpcRow<T>(data: T | T[] | null): T | null {
    return Array.isArray(data) ? data[0] ?? null : data;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await supabaseAdmin.rpc(name, args);
    if (error) throw new Error(`${name}:${error.code || 'database_error'}`);
    return rpcRow(data) as T | null;
}

async function contextFor(jobId: string, phase: 'transcription' | 'analysis') {
    return rpc<JobContext>('get_audio_transcription_context', {
        p_job_id: jobId,
        p_worker_id: WORKER_ID,
        p_phase: phase,
    });
}

function isActiveAudio(context: JobContext | null): context is JobContext {
    return Boolean(
        context
        && context.attachment_lifecycle === 'attached'
        && context.message_deleted_at === null
        && context.conversation_deleted_at === null
        && context.mime_type.startsWith('audio/')
        && Number.isFinite(Number(context.size_bytes))
        && Number(context.size_bytes) > 0
        && Number(context.size_bytes) <= MAX_AUDIO_BYTES
    );
}

function extensionForMime(mimeType: string) {
    const extensions: Record<string, string> = {
        'audio/aac': 'aac',
        'audio/m4a': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
    };
    return extensions[mimeType] || 'audio';
}

async function cancel(jobId: string, code: string) {
    await rpc('cancel_audio_transcription_job', {
        p_job_id: jobId,
        p_worker_id: WORKER_ID,
        p_error_code: code,
    });
}

export async function processNextAudioTranscriptionJob(): Promise<boolean> {
    if (!isTranscriptionConfigured()) return false;

    const job = await rpc<JobRow>('claim_audio_transcription_job', { p_worker_id: WORKER_ID });
    if (!job) return false;

    let temporaryFile: string | undefined;
    try {
        const context = await contextFor(job.id, 'transcription');
        const cancellationCode = context && !String(context.mime_type).startsWith('audio/')
            ? 'unsupported_mime'
            : 'source_unavailable';
        if (!isActiveAudio(context)) {
            if (cancellationCode === 'unsupported_mime') {
                await rpc('fail_audio_transcription_job', {
                    p_job_id: job.id,
                    p_worker_id: WORKER_ID,
                    p_error_code: cancellationCode,
                    p_retryable: false,
                });
                return true;
            }
            await cancel(job.id, cancellationCode);
            return true;
        }

        const { data: audioBlob, error: downloadError } = await supabaseAdmin.storage
            .from(context.bucket)
            .download(context.object_path);
        if (downloadError || !audioBlob) {
            await rpc('fail_audio_transcription_job', {
                p_job_id: job.id,
                p_worker_id: WORKER_ID,
                p_error_code: 'storage_unavailable',
                p_retryable: true,
            });
            return true;
        }

        const bytes = Buffer.from(await audioBlob.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
            await rpc('fail_audio_transcription_job', {
                p_job_id: job.id,
                p_worker_id: WORKER_ID,
                p_error_code: 'invalid_audio_size',
                p_retryable: false,
            });
            return true;
        }

        temporaryFile = join(
            tmpdir(),
            `ping_audio_${job.id}_${randomUUID()}.${extensionForMime(context.mime_type)}`,
        );
        await writeFile(temporaryFile, bytes, { flag: 'wx' });
        const result = await transcribeAudioDetailed(temporaryFile);

        // PostgreSQL revalidates message, conversation and attachment here.
        // If a tombstone won the race, it cancels the job and discards text.
        await rpc('complete_audio_transcription_job', {
            p_job_id: job.id,
            p_worker_id: WORKER_ID,
            p_transcript_text: result.text,
            p_language_detected: result.languageDetected,
        });
        return true;
    } catch (error) {
        if (error instanceof TranscriptionProviderError) {
            await rpc('fail_audio_transcription_job', {
                p_job_id: job.id,
                p_worker_id: WORKER_ID,
                p_error_code: error.code,
                p_retryable: error.retryable,
            }).catch(() => undefined);
            return true;
        }
        await rpc('fail_audio_transcription_job', {
            p_job_id: job.id,
            p_worker_id: WORKER_ID,
            p_error_code: 'worker_error',
            p_retryable: true,
        }).catch(() => undefined);
        return true;
    } finally {
        if (temporaryFile) await unlink(temporaryFile).catch(() => undefined);
    }
}

export async function processNextAudioAnalysisJob(): Promise<boolean> {
    const job = await rpc<JobRow>('claim_audio_transcription_analysis', { p_worker_id: WORKER_ID });
    if (!job) return false;

    try {
        const context = await contextFor(job.id, 'analysis');
        if (!isActiveAudio(context) || !context.transcript_text) {
            await cancel(job.id, 'source_unavailable');
            return true;
        }

        const { data: sourceMessage, error: sourceMessageError } = await supabaseAdmin
            .from('messages')
            .select('metadata')
            .eq('id', context.message_id)
            .maybeSingle();
        if (sourceMessageError) throw sourceMessageError;
        const clientTimeZone = typeof sourceMessage?.metadata?.clientTimeZone === 'string'
            ? sourceMessage.metadata.clientTimeZone
            : undefined;

        // Dynamic import avoids making the canonical message writer depend on
        // worker module initialization while retaining the same understanding.
        const { analyzeAndSuggestTask } = await import('./message.service');
        const suggestion = await analyzeAndSuggestTask(
            context.message_id,
            context.transcript_text,
            undefined,
            undefined,
            context.conversation_id,
            { persist: false, timeZone: clientTimeZone },
        );

        await rpc('complete_audio_transcription_analysis', {
            p_job_id: job.id,
            p_worker_id: WORKER_ID,
            p_suggested_task: suggestion,
        });
        return true;
    } catch {
        await rpc('fail_audio_transcription_analysis', {
            p_job_id: job.id,
            p_worker_id: WORKER_ID,
            p_error_code: 'analysis_error',
            p_retryable: true,
        }).catch(() => undefined);
        return true;
    }
}

export async function runAudioTranscriptionSweep() {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
        for (let index = 0; index < MAX_JOBS_PER_SWEEP; index += 1) {
            if (!(await processNextAudioAnalysisJob())) break;
        }
        for (let index = 0; index < MAX_JOBS_PER_SWEEP; index += 1) {
            if (!(await processNextAudioTranscriptionJob())) break;
        }
        // A transcription completed in this same sweep can be analyzed now;
        // PostgreSQL still arbitrates the independent analysis lease.
        for (let index = 0; index < MAX_JOBS_PER_SWEEP; index += 1) {
            if (!(await processNextAudioAnalysisJob())) break;
        }
    } finally {
        sweepRunning = false;
    }
}

export function wakeAudioTranscriptionWorker() {
    queueMicrotask(() => {
        runAudioTranscriptionSweep().catch((error) => {
            console.error('[AudioWorker] Sweep failed', {
                errorType: error instanceof Error ? error.name : 'UnknownError',
            });
        });
    });
}

export function startAudioTranscriptionWorker() {
    if (interval) return;
    wakeAudioTranscriptionWorker();
    interval = setInterval(wakeAudioTranscriptionWorker, SWEEP_INTERVAL_MS);
    interval.unref?.();
}
