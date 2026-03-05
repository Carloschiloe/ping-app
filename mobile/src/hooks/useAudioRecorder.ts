import { useState } from 'react';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
import { uploadToSupabase } from '../lib/upload';

interface UseAudioRecorderProps {
    onAudioSent: (textStr: string) => void;
    onRecordingStateChange?: (isRecording: boolean) => void;
    setSendingMedia: (sending: boolean) => void;
}

export function useAudioRecorder({ onAudioSent, onRecordingStateChange, setSendingMedia }: UseAudioRecorderProps) {
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingUri, setRecordingUri] = useState<string | null>(null);

    const startRecording = async () => {
        if (isRecording || recording) return;
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            onRecordingStateChange?.(true);

            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(rec);
            setIsRecording(true);
        } catch (e) {
            console.error('[Audio]', e);
            setIsRecording(false);
            onRecordingStateChange?.(false);
        }
    };

    const stopRecording = async () => {
        if (!recording || !isRecording) return;
        setIsRecording(false);
        onRecordingStateChange?.(false);

        try {
            await recording.stopAndUnloadAsync();
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
    };

    const uploadAudio = async () => {
        if (!recordingUri) return;
        setSendingMedia(true);
        try {
            const url = await uploadToSupabase(recordingUri, 'chat-media', 'audio/m4a');
            if (url) {
                onAudioSent(`[audio]${url}`);
                setRecordingUri(null);
            } else {
                Alert.alert('Error', 'No se pudo subir el audio.');
            }
        } catch (e) {
            console.error('[Audio upload]', e);
            Alert.alert('Error', 'No se pudo subir el audio.');
        } finally {
            setSendingMedia(false);
        }
    };

    return {
        isRecording,
        recording,
        recordingUri,
        startRecording,
        stopRecording,
        cancelAudio,
        uploadAudio
    };
}
