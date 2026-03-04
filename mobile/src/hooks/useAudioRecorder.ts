import { useState } from 'react';
import { Audio } from 'expo-av';
import { Alert } from 'react-native';
import { uploadToSupabase } from '../lib/upload';

interface UseAudioRecorderProps {
    onAudioSent: (text: string) => void;
    onRecordingStateChange?: (isRecording: boolean) => void;
    setSendingMedia: (sending: boolean) => void;
}

export function useAudioRecorder({ onAudioSent, onRecordingStateChange, setSendingMedia }: UseAudioRecorderProps) {
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);

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

            setSendingMedia(true);
            const url = await uploadToSupabase(uri, 'chat-media', 'audio/m4a');
            setSendingMedia(false);

            if (url) {
                onAudioSent(`[audio]${url}`);
            } else {
                Alert.alert('Error', 'No se pudo subir el audio.');
            }
        } catch (e) {
            console.error('[Audio stop]', e);
            setRecording(null);
            setSendingMedia(false);
        }
    };

    return {
        isRecording,
        recording,
        startRecording,
        stopRecording
    };
}
