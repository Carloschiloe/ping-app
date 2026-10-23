import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder as useExpoAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio';
import {
    PrivateMessageAttachment,
    uploadPrivateMessageAttachment,
} from '../lib/privateFiles';
import { resolveRecordingDurationMs } from '../utils/audioRecording';
import { isNetworkFailure } from '../utils/synchronization';

interface UseAudioRecorderProps {
    conversationId: string;
    onAudioSent: (payload: { text: string; attachment: PrivateMessageAttachment }) => void;
    onRecordingStateChange?: (isRecording: boolean) => void;
    setSendingMedia: (sending: boolean) => void;
}

// SDK 57 hotfix: migrado de expo-av (Audio.Recording, retirado de Expo Go en
// SDK 57 -- "Cannot find native module 'ExponentAV'") a expo-audio, la
// librería oficial de reemplazo. RecordingPresets.HIGH_QUALITY produce el
// MISMO formato .m4a/AAC que antes (verificado en el código fuente instalado
// de expo-audio) -- sin cambio de contrato con el backend/Whisper. El
// contrato público de este hook (nombres y forma del objeto devuelto) se
// preserva sin cambios para no tocar a los consumidores (ChatScreen.tsx).
export function useAudioRecorder({ conversationId, onAudioSent, onRecordingStateChange, setSendingMedia }: UseAudioRecorderProps) {
    const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
    // Polling reactivo de expo-audio (reemplaza el callback manual
    // setOnRecordingStatusUpdate de expo-av) -- misma cadencia (250ms) que
    // el código anterior.
    const recorderState = useAudioRecorderState(recorder, 250);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingUri, setRecordingUri] = useState<string | null>(null);
    const [recordingDurationMs, setRecordingDurationMs] = useState(0);
    const recordingDurationRef = useRef(0);
    const isRecordingRef = useRef(false);
    const startInFlightRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const recordingOperationRef = useRef(0);
    const uploadInFlightRef = useRef(false);
    const onAudioSentRef = useRef(onAudioSent);
    onAudioSentRef.current = onAudioSent;
    const onRecordingStateChangeRef = useRef(onRecordingStateChange);
    onRecordingStateChangeRef.current = onRecordingStateChange;

    // Mismo workaround ya certificado (sección 7 del ticket, bug real
    // conocido): Expo puede reportar duración 0 al detener aunque el
    // progreso ya haya observado tiempo transcurrido válido -- se conserva
    // la última duración observada mientras se graba.
    useEffect(() => {
        if (!recorderState.isRecording) return;
        const observedDuration = resolveRecordingDurationMs(
            recorderState.durationMillis,
            recordingDurationRef.current,
        );
        if (observedDuration !== undefined) {
            recordingDurationRef.current = observedDuration;
            setRecordingDurationMs(observedDuration);
        }
    }, [recorderState.durationMillis, recorderState.isRecording]);

    const startRecording = useCallback(async () => {
        if (isRecordingRef.current || startInFlightRef.current) return;
        startInFlightRef.current = true;
        stopRequestedRef.current = false;
        const operation = ++recordingOperationRef.current;
        try {
            const { granted } = await requestRecordingPermissionsAsync();
            if (!granted || operation !== recordingOperationRef.current || stopRequestedRef.current) {
                if (!granted) {
                    Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
                }
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

            if (operation !== recordingOperationRef.current || stopRequestedRef.current) return;

            await recorder.prepareToRecordAsync();
            if (operation !== recordingOperationRef.current || stopRequestedRef.current) return;

            recorder.record();
            if (operation !== recordingOperationRef.current || stopRequestedRef.current) {
                await recorder.stop().catch(() => undefined);
                return;
            }
            recordingDurationRef.current = 0;
            setRecordingDurationMs(0);
            isRecordingRef.current = true;
            setIsRecording(true);
            onRecordingStateChangeRef.current?.(true);
        } catch (e) {
            console.error('[Audio]', e);
            isRecordingRef.current = false;
            setIsRecording(false);
            setRecordingDurationMs(0);
            onRecordingStateChangeRef.current?.(false);
        } finally {
            startInFlightRef.current = false;
            if (!isRecordingRef.current) stopRequestedRef.current = false;
        }
    }, [recorder]);

    const stopRecording = useCallback(async () => {
        if (startInFlightRef.current && !isRecordingRef.current) {
            // The press can end while permissions/native preparation are still
            // pending. Mark the gesture as cancelled so start() cannot leave a
            // recorder running after the user has already released the button.
            stopRequestedRef.current = true;
            recordingOperationRef.current += 1;
            return;
        }
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;
        setIsRecording(false);
        onRecordingStateChangeRef.current?.(false);

        try {
            await recorder.stop();
            const finalStatus = recorder.getStatus();
            const durationMs = resolveRecordingDurationMs(
                finalStatus.durationMillis,
                recordingDurationRef.current,
            );
            recordingDurationRef.current = durationMs ?? 0;
            setRecordingDurationMs(durationMs ?? 0);
            const uri = recorder.uri;

            if (!uri) return;

            // Set the URI for preview instead of auto-uploading
            setRecordingUri(uri);
        } catch (e) {
            console.error('[Audio stop]', e);
            setSendingMedia(false);
        } finally {
            await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        }
    }, [recorder, setSendingMedia]);

    const cancelAudio = useCallback(() => {
        setRecordingUri(null);
        recordingDurationRef.current = 0;
        setRecordingDurationMs(0);
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }, []);

    const uploadAudio = useCallback(async () => {
        if (!recordingUri || uploadInFlightRef.current) return;
        uploadInFlightRef.current = true;
        setSendingMedia(true);
        const durationMs = resolveRecordingDurationMs(
            recordingDurationRef.current,
            recordingDurationMs,
        );
        const fileName = `audio-${Date.now()}.m4a`;
        try {
            const attachment = await uploadPrivateMessageAttachment(
                conversationId,
                recordingUri,
                'audio/m4a',
                fileName,
                durationMs,
            );
            onAudioSentRef.current({ text: 'Audio', attachment });
            setRecordingUri(null);
            recordingDurationRef.current = 0;
            setRecordingDurationMs(0);
        } catch (e) {
            console.warn('[Audio] Private upload failed', {
                message: e instanceof Error ? e.message : 'unknown',
            });
            const status = e && typeof e === 'object' && 'status' in e
                ? (e as { status?: unknown }).status
                : undefined;
            const retryable = (typeof status === 'number'
                && (status === 408 || status === 429 || status >= 500))
                || isNetworkFailure(e instanceof Error ? e.message : String(e));
            if (retryable) {
                onAudioSentRef.current({
                    text: 'Audio',
                    attachment: {
                        localUri: recordingUri,
                        uploadState: 'pending_local',
                        mimeType: 'audio/m4a',
                        fileName,
                        durationMs,
                    },
                });
                setRecordingUri(null);
                recordingDurationRef.current = 0;
                setRecordingDurationMs(0);
                return;
            }
            Alert.alert('No se pudo enviar', 'El audio no se subió. Inténtalo nuevamente.');
        } finally {
            uploadInFlightRef.current = false;
            setSendingMedia(false);
        }
    }, [conversationId, recordingDurationMs, recordingUri, setSendingMedia]);

    useEffect(() => () => {
        recordingOperationRef.current += 1;
        stopRequestedRef.current = true;
        if (isRecordingRef.current || startInFlightRef.current) {
            void recorder.stop().catch(() => undefined);
        }
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }, [recorder]);

    return {
        isRecording,
        recordingUri,
        recordingDurationMs,
        startRecording,
        stopRecording,
        cancelAudio,
        uploadAudio
    };
}
