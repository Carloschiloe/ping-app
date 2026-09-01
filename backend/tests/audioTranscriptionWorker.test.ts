import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSupabaseAdminMock,
    createSupabaseStorageMock,
    setSupabaseAdminMock,
    setSupabaseStorageMock,
    supabaseAdminMockModule,
} from './helpers/supabaseMock';

const transcriptionMocks = vi.hoisted(() => ({
    isConfigured: vi.fn(() => true),
    transcribe: vi.fn(async () => ({ text: 'Recordarme llamar mañana', languageDetected: 'es' })),
}));

vi.mock('../src/lib/supabaseAdmin', () => supabaseAdminMockModule());
vi.mock('../src/services/transcription.service', async (importOriginal) => ({
    ...await importOriginal<typeof import('../src/services/transcription.service')>(),
    isTranscriptionConfigured: transcriptionMocks.isConfigured,
    transcribeAudioDetailed: transcriptionMocks.transcribe,
}));

import {
    processNextAudioTranscriptionJob,
} from '../src/services/audioTranscriptionWorker.service';
import { TranscriptionProviderError } from '../src/services/transcription.service';

const job = { id: '11111111-1111-4111-8111-111111111111', attachment_id: 'a1', status: 'processing' };
const activeContext = {
    attachment_id: 'a1',
    message_id: 'm1',
    conversation_id: 'c1',
    bucket: 'chat-media',
    object_path: 'conversations/c1/attachments/u1/voice.m4a',
    mime_type: 'audio/m4a',
    size_bytes: 3,
    attachment_lifecycle: 'attached',
    message_deleted_at: null,
    conversation_deleted_at: null,
    transcript_text: null,
    pipeline_version: 'c5b-v1',
};

describe('Audio Transcription worker', () => {
    beforeEach(() => {
        transcriptionMocks.isConfigured.mockReturnValue(true);
        transcriptionMocks.transcribe.mockResolvedValue({
            text: 'Recordarme llamar mañana',
            languageDetected: 'es',
        });
        setSupabaseAdminMock(createSupabaseAdminMock({}));
        setSupabaseStorageMock(createSupabaseStorageMock());
    });

    it('descarga por bucket/path confiables y completa sin URLs firmadas', async () => {
        const db = createSupabaseAdminMock({
            'rpc:claim_audio_transcription_job': [{ data: job, error: null }],
            'rpc:get_audio_transcription_context': [{ data: activeContext, error: null }],
            'rpc:complete_audio_transcription_job': [{ data: { ...job, status: 'completed' }, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(processNextAudioTranscriptionJob()).resolves.toBe(true);

        expect(storage.download).toHaveBeenCalledWith(activeContext.object_path);
        expect(storage.createSignedUrl).not.toHaveBeenCalled();
        expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
        expect(db.getRpcCalls().at(-1)).toEqual({
            name: 'complete_audio_transcription_job',
            args: expect.objectContaining({
                p_job_id: job.id,
                p_transcript_text: 'Recordarme llamar mañana',
                p_language_detected: 'es',
            }),
        });
    });

    it('deja el job pendiente cuando el proveedor no esta configurado', async () => {
        transcriptionMocks.isConfigured.mockReturnValue(false);
        const db = createSupabaseAdminMock({});
        setSupabaseAdminMock(db);

        await expect(processNextAudioTranscriptionJob()).resolves.toBe(false);
        expect(db.getRpcCalls()).toHaveLength(0);
    });

    it('clasifica una falla transitoria para retry controlado', async () => {
        transcriptionMocks.transcribe.mockRejectedValueOnce(
            new TranscriptionProviderError('provider_timeout', true),
        );
        const db = createSupabaseAdminMock({
            'rpc:claim_audio_transcription_job': [{ data: job, error: null }],
            'rpc:get_audio_transcription_context': [{ data: activeContext, error: null }],
            'rpc:fail_audio_transcription_job': [{ data: { ...job, status: 'failed' }, error: null }],
        });
        setSupabaseAdminMock(db);

        await expect(processNextAudioTranscriptionJob()).resolves.toBe(true);
        expect(db.getRpcCalls().at(-1)).toEqual({
            name: 'fail_audio_transcription_job',
            args: expect.objectContaining({ p_error_code: 'provider_timeout', p_retryable: true }),
        });
    });

    it('cancela una fuente tombstoned antes de descargar', async () => {
        const db = createSupabaseAdminMock({
            'rpc:claim_audio_transcription_job': [{ data: job, error: null }],
            'rpc:get_audio_transcription_context': [{
                data: { ...activeContext, attachment_lifecycle: 'tombstoned' }, error: null,
            }],
            'rpc:cancel_audio_transcription_job': [{ data: { ...job, status: 'cancelled' }, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(processNextAudioTranscriptionJob()).resolves.toBe(true);
        expect(storage.download).not.toHaveBeenCalled();
        expect(db.getRpcCalls().at(-1)?.name).toBe('cancel_audio_transcription_job');
    });

    it('marca MIME invalido como terminal sin programar retry', async () => {
        const db = createSupabaseAdminMock({
            'rpc:claim_audio_transcription_job': [{ data: job, error: null }],
            'rpc:get_audio_transcription_context': [{
                data: { ...activeContext, mime_type: 'application/pdf' }, error: null,
            }],
            'rpc:fail_audio_transcription_job': [{ data: { ...job, status: 'failed' }, error: null }],
        });
        const storage = createSupabaseStorageMock();
        setSupabaseAdminMock(db);
        setSupabaseStorageMock(storage);

        await expect(processNextAudioTranscriptionJob()).resolves.toBe(true);
        expect(storage.download).not.toHaveBeenCalled();
        expect(db.getRpcCalls().at(-1)).toEqual({
            name: 'fail_audio_transcription_job',
            args: expect.objectContaining({ p_error_code: 'unsupported_mime', p_retryable: false }),
        });
    });
});
