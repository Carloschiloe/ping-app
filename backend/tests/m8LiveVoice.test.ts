import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearM8LiveVoiceTelemetryForTests,
    createM8LiveVoiceSession,
    getLatestM8LiveVoiceTelemetry,
    getM8LiveVoiceTelemetry,
    recordM8LiveVoiceTelemetry,
} from '../src/services/m8LiveVoice.service';
import {
    assertInternalM8LiveVoiceDiagnostics,
    createM8LiveVoiceLatestProof,
} from '../src/services/m8LiveVoiceInternalDiagnostics.service';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';
import { sanitizeM8LiveVoiceError, traceM8LiveVoiceDiagnostic } from '../src/services/m8LiveVoiceDiagnostics.service';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const voiceSessionId = '22222222-2222-4222-8222-222222222222';
const deviceSessionId = '33333333-3333-4333-8333-333333333333';

describe('M8 live voice staging boundary', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'staging';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        process.env.M8_LIVE_VOICE_MODEL = 'gpt-realtime-2.1';
        process.env.OPENAI_API_KEY = 'test-only-key';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'staging-diagnostic-test-key';
        clearM8LiveVoiceTelemetryForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.M8_LIVE_VOICE_ENABLED;
        delete process.env.M8_LIVE_VOICE_MODEL;
        delete process.env.OPENAI_API_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    it('brokers an SDP session without exposing the provider key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('v=0\\r\\nanswer', {
            status: 201,
            headers: {
                'Content-Type': 'application/sdp',
                Location: 'https://api.openai.com/v1/realtime/calls/live_test_session',
            },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await createM8LiveVoiceSession({
            actorUserId,
            request: {
                sdp: 'v=0\\r\\n' + 'a'.repeat(120),
                voiceSessionId,
                deviceSessionId,
                locale: 'es-CL',
                timezone: 'America/Santiago',
            },
        });

        expect(result).toEqual({
            sessionId: 'live_test_session',
            sdp: 'v=0\\r\\nanswer',
            model: 'gpt-realtime-2.1',
            provider: 'openai_realtime_webrtc',
        });
        const request = fetchMock.mock.calls[0][1] as RequestInit;
        expect(request.method).toBe('POST');
        expect((request.headers as Record<string, string>).Authorization).toBe('Bearer test-only-key');
        expect((request.headers as Record<string, string>)['OpenAI-Safety-Identifier']).toMatch(/^[a-f0-9]{64}$/);
        const form = request.body as FormData;
        const sdp = form.get('sdp');
        const session = form.get('session');
        expect(typeof sdp).toBe('string');
        expect(sdp).toContain('v=0');
        expect(typeof session).toBe('string');
        expect(session).toContain('ping_core_turn');
        expect(session).toContain('gpt-realtime-2.1');
        expect(session).toContain('"create_response":false');
        expect(session).toContain('"interrupt_response":true');
        expect(result.sdp).toBe('v=0\\r\\nanswer');
    });

    it('keeps telemetry actor/device scoped and reports zero side effects', () => {
        recordM8LiveVoiceTelemetry(actorUserId, {
            voiceSessionId,
            deviceSessionId,
            event: 'core_disposition',
            atMs: 240,
            coreKind: 'response',
            confirmationRequired: false,
            sideEffects: 0,
        });

        expect(getM8LiveVoiceTelemetry(actorUserId, voiceSessionId)).toMatchObject({
            voiceSessionId,
            deviceSessionId,
            sideEffects: 0,
            events: [{ event: 'core_disposition', coreKind: 'response', sideEffects: 0 }],
        });
    });

    it('does not expose the live endpoint outside staging or without its flag', async () => {
        process.env.PING_ENVIRONMENT = 'production';
        await expect(createM8LiveVoiceSession({
            actorUserId,
            request: { sdp: 'v=0\\r\\n' + 'a'.repeat(120), voiceSessionId, deviceSessionId },
        })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('serves a staging client with browser media and barge-in controls', () => {
        delete process.env.M8_LIVE_VOICE_ENABLED;
        const html = getM8LiveVoiceClientHtml('unit-test-nonce');
        expect(html).toContain('navigator.mediaDevices?.getUserMedia');
        expect(html).toContain('RTCPeerConnection');
        expect(html).toContain('response.cancel');
        expect(html).toContain('voice_stage');
        expect(html).toContain('microphone_permission_timeout');
        expect(html).toContain('voice_session_requested');
        expect(html).toContain('remote_description_set');
        expect(html).toContain("config_requested");
        expect(html).toContain("config_ack");
        expect(html).toContain("CONFIG_ATTEMPTS");
        expect(html).toContain("auth_ready");
        expect(html).toContain("voice_session_requested");
        expect(html).toContain("ice_gathering");
        expect(html).toContain("waitForIceGathering");
        expect(html).toContain("remote_description_applying");
        expect(html).toContain("remote_description_invalid_sdp");
        expect(html).toContain("const negotiatedSdp=pc.localDescription?.sdp");
        expect(html).toContain("sdp:negotiatedSdp");
        expect(html).not.toContain("sdp:offer.sdp");
        expect(html).toContain("normalizeSdp");
        expect(html).toContain("String.fromCharCode(13,10)");
        expect(html).toContain("data_channel_timeout");
        expect(html).toContain("provider_session_timeout");
        expect(html).toContain("retry");
        expect(html).toContain("listening");
        expect(html).toContain("audio_ready");
        expect(html).toContain("coreResultReady");
        expect(html).toContain("audio_before_core_result");
        expect(html).toContain("transcript_received");
        expect(html).toContain("core_request_started");
        expect(html).toContain("function_call_output");
        expect(html).toContain("response_create");
        expect(html).toContain("response_cancel");
        expect(html).toContain("audio_transport");
        expect(html).toContain("speech_started_while_assistant_speaking");
        expect(html).toContain("remote_audio_stalled");
        expect(html).toContain("setAudioGate(false)");
        expect(html).toContain("setAudioGate(true)");
        expect(html).toContain("remote.muted=!enabled");
        expect(html).toContain("echoCancellation:true");
        expect(html).toContain("noiseSuppression:true");
        expect(html).toContain("autoGainControl:true");
        expect(html).toContain("response_cancel_skipped_no_active_response");
        expect(html).toContain("self_audio_echo_suspected");
        expect(html).toContain("core_turn_already_in_flight");
        expect(html).toContain("ECHO_SETTLE_MS");
        expect(html).toContain("createResponse('user_turn_ready','required')");
        expect(html).toContain("createResponse('core_result_authorized','none')");
        expect(html).toContain("responseHasAudio=toolChoice!=='required'");
        expect(html).toContain("response.created");
        expect(html).toContain("realtime_output_transcript_done");
        expect(html).toContain("realtime_audio_done");
        expect(html).toContain("provider_audio_generation_done");
        expect(html).toContain("realtimeOutputText");
        expect(html).toContain("audioDeltaCount");
        expect(html).toContain("tool_response_done");
        expect(html).toContain("response:{tool_choice:toolChoice,output_modalities:toolChoice==='required'?['text']:['audio']}");
        expect(html).toContain("keepalive:event==='session_closed'");
        expect(html).toContain("currentStage");
        expect(html).toContain("m8_diagnostic_error");
        expect(html).toContain("fail(currentStage,error,error?.httpStatus)");
        expect(html).toContain('Configurando la conversación segura.');
        expect(html).not.toMatch(/[ÃÂ�]/);
        expect(html).toContain('<script nonce="unit-test-nonce">');
        expect(html).not.toContain('__M8_SCRIPT_NONCE__');
        expect(html).not.toContain('OPENAI_API_KEY');
    });

    it('serves an executable bootstrap script after all runtime substitutions', () => {
        const html = getM8LiveVoiceClientHtml('runtime-test-nonce');
        const marker = '<script nonce="runtime-test-nonce">';
        const start = html.indexOf(marker);
        const end = html.indexOf('</script>', start + marker.length);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        expect(() => new Function(html.slice(start + marker.length, end))).not.toThrow();
    });

    it('returns the voice UI to listening after output or response completion', () => {
        const html = getM8LiveVoiceClientHtml('completion-test-nonce');

        expect(html).toContain("const completeAssistantResponse=(detailCode)=>");
        expect(html).toContain("if(event.type==='response.output_audio.done'||event.type==='response.audio.done')completeAssistantResponse('audio_output_done')");
        expect(html).toContain("if(event.type==='response.done'||event.type==='response.completed'){if(responseHasAudio||assistantSpeaking||lastAudioState==='playing')completeAssistantResponse(event.type)");
        expect(html).toContain("outputPlaybackPending=shouldReturnToListening");
        expect(html).toContain("if(wasAssistantSpeaking||wasOutputPending){cancelResponse('speech_started_while_assistant_speaking');setAudioGate(false);outputPlaybackPending=false");
        const completionStart = html.indexOf("const completeAssistantResponse=(detailCode)=>");
        const completionEnd = html.indexOf("const createResponse=", completionStart);
        const completion = html.slice(completionStart, completionEnd);
        expect(completion).not.toContain("setAudioGate(false)");
        expect(completion).not.toContain("assistant_audio_stopped");
        expect(completion).toContain("stage:'provider_audio_generation_done'");
        expect(html).toContain("currentStage!=='listening'");
        expect(html).toContain("stage('listening','Ping está listo','Habla cuando quieras.'");
    });

    it('accepts sanitized stage diagnostics without side effects', () => {
        recordM8LiveVoiceTelemetry(actorUserId, {
            voiceSessionId,
            deviceSessionId,
            event: 'voice_stage',
            stage: 'session_response_received',
            httpStatus: 201,
            atMs: 420,
            sideEffects: 0,
        });

        expect(getM8LiveVoiceTelemetry(actorUserId, voiceSessionId).events).toContainEqual(expect.objectContaining({
            event: 'voice_stage', stage: 'session_response_received', httpStatus: 201, sideEffects: 0,
        }));
    });

    it('keeps the latest physical session recoverable and sanitizes transcript/Core text', () => {
        recordM8LiveVoiceTelemetry(actorUserId, {
            voiceSessionId,
            deviceSessionId,
            event: 'transcript_received',
            transcript: 'agenda esto access_token=must-not-persist',
            turnId: 'turn-1',
            turnSequence: 1,
            vadState: 'speech_stopped',
            atMs: 500,
            sideEffects: 0,
        });
        recordM8LiveVoiceTelemetry(actorUserId, {
            voiceSessionId,
            deviceSessionId,
            event: 'core_disposition',
            coreKind: 'response',
            coreAnswer: 'respuesta authorization=must-not-persist',
            httpStatus: 200,
            latencyMs: 42,
            atMs: 700,
            sideEffects: 0,
        });

        const latest = getLatestM8LiveVoiceTelemetry(actorUserId);
        expect(latest).toMatchObject({ voiceSessionId, deviceSessionId, eventCount: 2, closed: false, sideEffects: 0 });
        expect(JSON.stringify(latest)).not.toContain('must-not-persist');
        expect(latest.events).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'transcript_received', transcript: 'agenda esto access_token=[redacted]' }),
            expect.objectContaining({ event: 'core_disposition', coreAnswer: 'respuesta authorization=[redacted]', latencyMs: 42 }),
        ]));
    });

    it('accepts only a short-lived staging HMAC capability for internal recovery', () => {
        const timestamp = String(Date.now());
        expect(() => assertInternalM8LiveVoiceDiagnostics(timestamp, createM8LiveVoiceLatestProof(timestamp))).not.toThrow();
        expect(() => assertInternalM8LiveVoiceDiagnostics(timestamp, '0'.repeat(64))).toThrowError(/unauthorized/i);
        expect(() => assertInternalM8LiveVoiceDiagnostics(String(Date.now() - 120_000), createM8LiveVoiceLatestProof(String(Date.now() - 120_000)))).toThrowError(/unauthorized/i);
        process.env.PING_ENVIRONMENT = 'production';
        expect(() => assertInternalM8LiveVoiceDiagnostics(timestamp, createM8LiveVoiceLatestProof(timestamp))).toThrowError(/unavailable/i);
    });

    it('writes only staging diagnostics with hashed identities and no secrets or SDP', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        traceM8LiveVoiceDiagnostic('session_request_received', {
            actorUserId,
            voiceSessionId,
            deviceSessionId,
            sessionId: 'provider-session-id',
            authorization: 'Bearer access-token-that-must-not-appear',
            sdp: 'v=0\r\nprivate-offer',
            errorMessage: 'refresh_token=secret-value',
        });

        expect(info).toHaveBeenCalledTimes(1);
        const line = info.mock.calls[0].map(String).join(' ');
        expect(line).toContain('PING_M8_BOOTSTRAP_TRACE');
        expect(line).not.toContain(actorUserId);
        expect(line).not.toContain(voiceSessionId);
        expect(line).not.toContain('provider-session-id');
        expect(line).not.toContain('access-token-that-must-not-appear');
        expect(line).not.toContain('private-offer');
        expect(line).not.toContain('secret-value');
        expect(line).toContain('actorUserIdHash');
    });

    it('keeps provider/auth failures structured and sanitized', () => {
        const details = sanitizeM8LiveVoiceError(Object.assign(new Error('Bearer hidden-token'), {
            name: 'AuthApiError', statusCode: 401, code: 'invalid_token',
        }));
        expect(details).toEqual({
            errorName: 'AuthApiError',
            errorCode: 'invalid_token',
            httpStatus: 401,
            errorMessage: 'Bearer [redacted]',
            providerErrorType: undefined,
            providerErrorMessage: undefined,
        });
    });

    it('sanitizes provider rejection diagnostics without retaining credentials or SDP', () => {
        const details = sanitizeM8LiveVoiceError(Object.assign(new Error('provider rejected'), {
            status: 400,
            code: 'invalid_request_error',
            providerErrorType: 'invalid_request_error',
            providerErrorMessage: 'Authorization: Bearer hidden-token; sdp=https://private.example/offer',
        }));
        expect(details).toMatchObject({
            errorCode: 'invalid_request_error',
            httpStatus: 400,
            providerErrorType: 'invalid_request_error',
        });
        expect(String(details.providerErrorMessage)).not.toContain('hidden-token');
        expect(String(details.providerErrorMessage)).not.toContain('private.example');
        expect(JSON.stringify(details)).not.toContain('hidden-token');
        expect(JSON.stringify(details)).not.toContain('private.example');
    });
});
