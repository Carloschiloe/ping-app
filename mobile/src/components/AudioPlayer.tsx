import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

interface AudioPlayerProps {
    url: string;
    isMe?: boolean;
    style?: any;
}

export default function AudioPlayer({ url, isMe = false, style }: AudioPlayerProps) {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [playing, setPlaying] = useState(false);

    const toggle = async () => {
        if (playing && sound) {
            await sound.stopAsync();
            setPlaying(false);
            return;
        }
        const { sound: s } = await Audio.Sound.createAsync({ uri: url });
        setSound(s);
        setPlaying(true);
        await s.playAsync();
        s.setOnPlaybackStatusUpdate((status: any) => {
            if (status.didJustFinish) { setPlaying(false); }
        });
    };

    useEffect(() => {
        return () => { sound?.unloadAsync(); };
    }, [sound]);

    return (
        <TouchableOpacity style={[styles.audioPlayer, style]} onPress={toggle}>
            <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={isMe ? 'white' : '#1e3a5f'} />
            <View style={styles.audioWave}>
                {[...Array(12)].map((_, i) => (
                    <View key={i} style={[styles.audioBar, { height: 4 + Math.random() * 14, opacity: playing ? 1 : 0.5 }, isMe ? styles.audioBarMe : styles.audioBarThem]} />
                ))}
            </View>
            <Text style={[styles.audioLabel, isMe ? styles.audioLabelMe : styles.audioLabelThem]}>
                {playing ? 'Detener' : 'Audio'}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    audioPlayer: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, minWidth: 180 },
    audioWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
    audioBar: { width: 3, borderRadius: 2 },
    audioBarMe: { backgroundColor: 'rgba(255,255,255,0.7)' },
    audioBarThem: { backgroundColor: '#0a84ff' },
    audioLabel: { fontSize: 11 },
    audioLabelMe: { color: 'rgba(255,255,255,0.75)' },
    audioLabelThem: { color: '#6b7280' },
});
