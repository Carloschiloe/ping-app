import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import {
    RecordingPresets,
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { transcribeAgentVoice, type AgentAdapterSurface, type AgentVoiceTranscriptResult } from '../api/query-modules/agent';
import { resolveRecordingDurationMs } from '../utils/audioRecording';
import { AGENT_IDLE_AUDIO_MODE, AGENT_RECORDING_AUDIO_MODE } from '../utils/agentAudioSession';
import {
    createEphemeralUuid,
    mapMicrophonePermission,
    transitionVoiceSession,
    type MicrophonePermissionState,
    type VoiceSessionEvent,
    type VoiceSessionState,
} from '../utils/voiceSession';

const VOICE_KEEP_AWAKE_TAG = 'ping-agent-voice';

interface UseAgentVoiceInputOptions {
    conversationId?: string;
    currentCommitmentId?: string;
    surface?: Exclude<AgentAdapterSurface, 'mobile_text'>;
    onTranscriptReady: (result: AgentVoiceTranscriptResult) => void;
    onFailure?: (code: string) => void;
}

export function useAgentVoiceInput(options: UseAgentVoiceInputOptions) {
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(recorder, 200);
    const [state, setState] = useState<VoiceSessionState>('idle');
    const [permission, setPermission] = useState<MicrophonePermissionState>('unknown');
    const [durationMs, setDurationMs] = useState(0);
    const stateRef = useRef<VoiceSessionState>('idle');
    const durationRef = useRef(0);
    const activeUriRef = useRef<string | null>(null);
    // Mirrors the last known recording uri from the polled JS-side recorder
    // state (never the live native accessor) so cleanup paths that may run
    // after the native recorder shared object has been released — unmount,
    // background-cancel — never dereference the native uri getter directly.
    // Reading that getter after disposal throws "Unable to find the native
    // shared object associated with given JavaScript object" and crashes the
    // app.
    const lastKnownUriRef = useRef<string | null>(null);
    const voiceSessionIdRef = useRef<string | null>(null);
    const deviceSessionIdRef = useRef(createEphemeralUuid());
    // Invalidates async recorder/transcription work when the user cancels or
    // the screen leaves the foreground. Native callbacks can resolve after
    // cancellation; they must never advance the cancelled session.
    const operationIdRef = useRef(0);
    const mountedRef = useRef(true);
    const optionsRef = useRef(options);
    const requestAbortRef = useRef<AbortController | null>(null);
    optionsRef.current = options;
    const voiceIsActive = ['listening', 'capturing', 'transcribing', 'interpreting', 'responding'].includes(state);

    useEffect(() => {
        if (voiceIsActive) {
            void activateKeepAwakeAsync(VOICE_KEEP_AWAKE_TAG).catch(() => undefined);
        } else {
            void deactivateKeepAwake(VOICE_KEEP_AWAKE_TAG).catch(() => undefined);
        }
        return () => {
            void deactivateKeepAwake(VOICE_KEEP_AWAKE_TAG).catch(() => undefined);
        };
    }, [voiceIsActive]);

    const applyEvent = useCallback((event: VoiceSessionEvent) => {
        try {
            const next = transitionVoiceSession(stateRef.current, event);
            stateRef.current = next;
            if (mountedRef.current) setState(next);
            return true;
        } catch (error) {
            // A native recorder promise may reject after cancel() already
            // moved the state to cancelled. That is a stale callback, not a
            // user-facing voice failure and must not become an uncaught error.
            if (stateRef.current === 'cancelled') return false;
            throw error;
        }
    }, []);

    const deleteLocalCapture = useCallback((uri?: string | null) => {
        const target = uri || activeUriRef.current;
        activeUriRef.current = null;
        lastKnownUriRef.current = null;
        if (!target) return;
        try {
            const file = new File(target);
            if (file.exists) file.delete();
        } catch {
            // Best effort: Expo owns its recorder cache and may already have removed it.
        }
    }, []);

    const cancel = useCallback(async () => {
        if (stateRef.current === 'cancelled') return;
        operationIdRef.current += 1;
        if (stateRef.current === 'capturing' || stateRef.current === 'listening') {
            await recorder.stop().catch(() => undefined);
        }
        requestAbortRef.current?.abort();
        requestAbortRef.current = null;
        deleteLocalCapture(lastKnownUriRef.current);
        await setAudioModeAsync(AGENT_IDLE_AUDIO_MODE).catch(() => undefined);
        try {
            applyEvent('CANCEL');
        } catch {
            stateRef.current = 'cancelled';
            if (mountedRef.current) setState('cancelled');
        }
        durationRef.current = 0;
        if (mountedRef.current) setDurationMs(0);
    }, [applyEvent, deleteLocalCapture, recorder]);

    useEffect(() => {
        if (!recorderState.isRecording) return;
        const observed = resolveRecordingDurationMs(recorderState.durationMillis, durationRef.current);
        if (observed !== undefined) {
            durationRef.current = observed;
            setDurationMs(observed);
        }
    }, [recorderState.durationMillis, recorderState.isRecording]);

    // Captures the uri while the recorder is still known-valid, via the
    // library's own polled JS state rather than the live native getter — see
    // lastKnownUriRef above.
    useEffect(() => {
        if (recorderState.url) lastKnownUriRef.current = recorderState.url;
    }, [recorderState.url]);

    useEffect(() => {
        mountedRef.current = true;
        const subscription = AppState.addEventListener('change', (next) => {
            if (next !== 'active' && (stateRef.current === 'capturing' || stateRef.current === 'listening')) {
                void cancel();
            }
        });
        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            subscription.remove();
            if (stateRef.current === 'capturing' || stateRef.current === 'listening') void recorder.stop().catch(() => undefined);
            deleteLocalCapture(lastKnownUriRef.current);
            void setAudioModeAsync(AGENT_IDLE_AUDIO_MODE).catch(() => undefined);
        };
    }, [cancel, deleteLocalCapture, recorder]);

    const start = useCallback(async () => {
        if (!['idle', 'ended', 'cancelled', 'failed'].includes(stateRef.current)) return;
        const operationId = ++operationIdRef.current;
        try {
            applyEvent('START_PERMISSION_CHECK');
            let response = await getRecordingPermissionsAsync();
            let mapped = mapMicrophonePermission(response);
            if (!response.granted && response.canAskAgain) {
                response = await requestRecordingPermissionsAsync();
                mapped = mapMicrophonePermission(response);
            }
            if (operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            setPermission(mapped);
            if (!response.granted) {
                applyEvent('FAIL');
                optionsRef.current.onFailure?.(mapped === 'blocked' || mapped === 'restricted' ? 'permission_blocked' : 'permission_denied');
                return;
            }

            // Do not mix the microphone with Ping's previous response or
            // another app's audio. This is a capture boundary, not a prompt
            // tweak: the transcript must contain only this turn.
            await setAudioModeAsync(AGENT_RECORDING_AUDIO_MODE);
            if (operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            await recorder.prepareToRecordAsync();
            if (operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            voiceSessionIdRef.current = createEphemeralUuid();
            durationRef.current = 0;
            setDurationMs(0);
            recorder.record();
            applyEvent('CAPTURE_STARTED');
        } catch {
            if (operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            applyEvent('FAIL');
            optionsRef.current.onFailure?.('capture_failed');
        }
    }, [applyEvent, recorder]);

    const stop = useCallback(async () => {
        if (stateRef.current !== 'capturing') return;
        const operationId = operationIdRef.current;
        try {
            await recorder.stop();
            if (operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            applyEvent('CAPTURE_STOPPED');
            const status = recorder.getStatus();
            const finalDuration = resolveRecordingDurationMs(status.durationMillis, durationRef.current);
            const uri = status.url;
            const resolvedUri = uri || lastKnownUriRef.current;
            if (!resolvedUri || !finalDuration) throw new Error('empty_audio');
            activeUriRef.current = resolvedUri;
            lastKnownUriRef.current = resolvedUri;
            const requestAbort = new AbortController();
            requestAbortRef.current = requestAbort;

            const result = await transcribeAgentVoice({
                uri: resolvedUri,
                mimeType: 'audio/m4a',
                durationMs: finalDuration,
                capturedAt: new Date().toISOString(),
                voiceSessionId: voiceSessionIdRef.current || createEphemeralUuid(),
                deviceSessionId: deviceSessionIdRef.current,
                conversationId: optionsRef.current.conversationId,
                currentCommitmentId: optionsRef.current.currentCommitmentId,
                surface: optionsRef.current.surface,
                signal: requestAbort.signal,
            });
            requestAbortRef.current = null;
            if (!mountedRef.current || operationId !== operationIdRef.current || (stateRef.current as VoiceSessionState) === 'cancelled') return;
            applyEvent('TRANSCRIPT_READY');
            optionsRef.current.onTranscriptReady(result);
        } catch (error) {
            // stateRef.current puede haber cambiado a 'cancelled' durante los
            // await de arriba (cancel() corriendo en paralelo, ej. background
            // mid-transcripción) -- TS no puede ver esa mutación async y
            // sigue estrechando el tipo a 'capturing' en este punto, así que
            // se fuerza el tipo real (VoiceSessionState) explícitamente.
            if (mountedRef.current && operationId === operationIdRef.current && (stateRef.current as VoiceSessionState) !== 'cancelled') {
                applyEvent('FAIL');
                optionsRef.current.onFailure?.(error instanceof Error ? error.message : 'transcription_failed');
            }
        } finally {
            requestAbortRef.current = null;
            deleteLocalCapture(activeUriRef.current || lastKnownUriRef.current);
            await setAudioModeAsync(AGENT_IDLE_AUDIO_MODE).catch(() => undefined);
        }
    }, [applyEvent, deleteLocalCapture, recorder]);

    const markSubmitted = useCallback(() => applyEvent('AGENT_SUBMITTED'), [applyEvent]);
    const markFinished = useCallback((failed = false) => applyEvent(failed ? 'FAIL' : 'AGENT_FINISHED'), [applyEvent]);
    const reset = useCallback(() => {
        if (['interpreting', 'ended', 'cancelled', 'failed'].includes(stateRef.current)) applyEvent('RESET');
    }, [applyEvent]);

    return {
        state,
        permission,
        durationMs,
        start,
        stop,
        cancel,
        reset,
        markSubmitted,
        markFinished,
        openSettings: Linking.openSettings,
    };
}
