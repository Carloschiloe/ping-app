import { useEffect, useRef, useState } from 'react';
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

    const startRecording = async () => {
        if (isRecording) return;
        try {
            const { granted } = await requestRecordingPermissionsAsync();
            if (!granted) {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

            await recorder.prepareToRecordAsync();
            recorder.record();
            recordingDurationRef.current = 0;
            setRecordingDurationMs(0);
            setIsRecording(true);
            onRecordingStateChange?.(true);
        } catch (e) {
            console.error('[Audio]', e);
            setIsRecording(false);
            setRecordingDurationMs(0);
            onRecordingStateChange?.(false);
        }
    };

    const stopRecording = async () => {
        if (!isRecording) return;
        setIsRecording(false);
        onRecordingStateChange?.(false);

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
        }
    };

    const cancelAudio = () => {
        setRecordingUri(null);
        recordingDurationRef.current = 0;
        setRecordingDurationMs(0);
    };

    const uploadAudio = async () => {
        if (!recordingUri) return;
        setSendingMedia(true);
        try {
            const durationMs = resolveRecordingDurationMs(
                recordingDurationRef.current,
                recordingDurationMs,
            );
            const attachment = await uploadPrivateMessageAttachment(
                conversationId,
                recordingUri,
                'audio/m4a',
                `audio-${Date.now()}.m4a`,
                durationMs,
            );
            onAudioSent({ text: 'Audio', attachment });
            setRecordingUri(null);
            recordingDurationRef.current = 0;
            setRecordingDurationMs(0);
        } catch (e) {
            console.warn('[Audio] Private upload failed', {
                message: e instanceof Error ? e.message : 'unknown',
            });
            Alert.alert('No se pudo enviar', 'El audio no se subió. Inténtalo nuevamente.');
        } finally {
            setSendingMedia(false);
        }
    };

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
