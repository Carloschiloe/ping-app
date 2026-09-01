import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
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

export function useAudioRecorder({ conversationId, onAudioSent, onRecordingStateChange, setSendingMedia }: UseAudioRecorderProps) {
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingUri, setRecordingUri] = useState<string | null>(null);
    const [recordingDurationMs, setRecordingDurationMs] = useState(0);
    const recordingDurationRef = useRef(0);

    const startRecording = async () => {
        if (isRecording || recording) return;
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            rec.setProgressUpdateInterval(250);
            rec.setOnRecordingStatusUpdate((recordingStatus) => {
                if (recordingStatus.isRecording) {
                    const observedDuration = resolveRecordingDurationMs(
                        recordingStatus.durationMillis,
                        recordingDurationRef.current,
                    );
                    if (observedDuration !== undefined) {
                        recordingDurationRef.current = observedDuration;
                        setRecordingDurationMs(observedDuration);
                    }
                }
            });
            setRecording(rec);
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
        if (!recording || !isRecording) return;
        setIsRecording(false);
        onRecordingStateChange?.(false);

        try {
            const finalStatus = await recording.stopAndUnloadAsync();
            const durationMs = resolveRecordingDurationMs(
                finalStatus.durationMillis,
                recordingDurationRef.current,
            );
            recordingDurationRef.current = durationMs ?? 0;
            setRecordingDurationMs(durationMs ?? 0);
            const uri = recording.getURI();
            setRecording(null);

            if (!uri) return;

            // Set the URI for preview instead of auto-uploading
            setRecordingUri(uri);
        } catch (e) {
            console.error('[Audio stop]', e);
            setRecording(null);
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
        recording,
        recordingUri,
        recordingDurationMs,
        startRecording,
        stopRecording,
        cancelAudio,
        uploadAudio
    };
}
