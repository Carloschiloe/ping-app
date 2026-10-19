import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { getAudioMessagePalette } from '../utils/messagePresentation';
import { shouldRestartAudioPlayback } from '../utils/audioPlayback';

interface AudioPlayerProps {
    url: string;
    isMe?: boolean;
    style?: any;
    transcript?: string;
}

// Keep the decorative waveform stable across renders. Generating heights with
// Math.random() during render made every playback-status update redraw the
// message with a different waveform and violated React's render purity rule.
const AUDIO_WAVEFORM_HEIGHTS = [8, 14, 11, 18, 9, 16, 12, 20, 10, 15, 7, 13] as const;

// SDK 57 hotfix: migrado de expo-av (Audio.Sound, retirado de Expo Go en SDK
// 57) a expo-audio. `useAudioPlayer` libera el player automáticamente al
// desmontar (antes requería un useEffect manual con unloadAsync) y
// `useAudioPlayerStatus` refleja `playing` de forma reactiva -- ya no hace
// falta un listener manual para saber cuándo terminó la reproducción.
export default function AudioPlayer({ url, isMe = false, style, transcript }: AudioPlayerProps) {
    const { theme } = useAppTheme();
    const palette = getAudioMessagePalette(isMe, theme.colors);
    const player = useAudioPlayer(url);
    const status = useAudioPlayerStatus(player);

    const toggle = async () => {
        if (status.playing) {
            player.pause();
            return;
        }

        try {
            // Fix: ensure audio plays through speaker and ignores silent switch
            await setAudioModeAsync({
                allowsRecording: false,
                playsInSilentMode: true,
                shouldPlayInBackground: false,
                interruptionMode: 'duckOthers',
                shouldRouteThroughEarpiece: false,
            });

            // expo-audio leaves a finished player at the end of its source.
            // Rewind only after a real finish; a paused player must resume from
            // its current position. The existing player/source is preserved,
            // which also keeps signed attachment URLs intact.
            if (shouldRestartAudioPlayback(status)) {
                await player.seekTo(0);
            }

            player.play();
        } catch (error) {
            console.error('[AudioPlayer] play error:', error);
        }
    };

    return (
        <View style={style}>
            <TouchableOpacity style={styles.audioPlayer} onPress={toggle}>
                <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={32} color={palette.iconColor} />
                <View style={styles.audioWave}>
                    {AUDIO_WAVEFORM_HEIGHTS.map((height, i) => (
                        <View key={i} style={[
                            styles.audioBar,
                            {
                                backgroundColor: palette.waveColor,
                                height,
                                opacity: status.playing ? 0.9 : 0.55,
                            },
                        ]} />
                    ))}
                </View>
                <Text style={[styles.audioLabel, { color: palette.labelColor }]}>
                    {status.playing ? 'Detener' : 'Audio'}
                </Text>
            </TouchableOpacity>
            {transcript && (
                <Text style={[styles.transcriptText, { color: palette.transcriptColor }]}>
                    &quot;{transcript}&quot;
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    audioPlayer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8, minWidth: 160 },
    audioWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
    audioBar: { width: 3, borderRadius: 2 },
    audioLabel: { fontSize: 11, opacity: 0.78 },
    transcriptText: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 4,
        paddingHorizontal: 8,
        opacity: 0.82,
    },
});
