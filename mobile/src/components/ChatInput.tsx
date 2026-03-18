import React from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AudioPlayer from './AudioPlayer';
import { useAppTheme } from '../theme/ThemeContext';

interface ChatInputProps {
    text: string;
    onTextChange: (t: string) => void;
    onSend: () => void;
    isSelf: boolean;
    isPending: boolean;
    sendingMedia: boolean;
    recordingUri: string | null;
    isRecording: boolean;
    onPickMedia: () => void;
    onShareLocation: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onCancelAudio: () => void;
    onUploadAudio: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    text,
    onTextChange,
    onSend,
    isSelf,
    isPending,
    sendingMedia,
    recordingUri,
    isRecording,
    onPickMedia,
    onShareLocation,
    onStartRecording,
    onStopRecording,
    onCancelAudio,
    onUploadAudio
}) => {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    if (recordingUri) {
        return (
            <View style={styles.inputBar}>
                <TouchableOpacity 
                    style={[styles.mediaBtn, { backgroundColor: '#fee2e2' }]} 
                    onPress={onCancelAudio} 
                    disabled={sendingMedia || isPending}
                >
                    <Ionicons name="trash-outline" size={24} color={theme.colors.danger} />
                </TouchableOpacity>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <View style={styles.audioPreviewContainer}>
                        <AudioPlayer url={recordingUri} isMe={false} />
                    </View>
                </View>
                <TouchableOpacity 
                    style={[styles.sendBtn, (sendingMedia || isPending) && styles.sendDisabled]} 
                    onPress={onUploadAudio} 
                    disabled={sendingMedia || isPending}
                >
                    {sendingMedia || isPending ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Ionicons name="send" size={18} color={theme.colors.white} />}
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.inputBar}>
            <TouchableOpacity 
                style={styles.mediaBtn} 
                onPress={onPickMedia} 
                disabled={sendingMedia || isPending}
            >
                <Ionicons name="image-outline" size={24} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.mediaBtn}
                onPress={onShareLocation}
                disabled={sendingMedia || isPending}
            >
                <Ionicons name="location-outline" size={22} color={theme.colors.text.secondary} />
            </TouchableOpacity>
            <TextInput
                style={styles.input}
                placeholder={isSelf ? 'Escribe un recordatorio...' : 'Escribe un mensaje...'}
                placeholderTextColor={theme.colors.text.muted}
                value={text}
                onChangeText={onTextChange}
                multiline
            />
            {text.trim() ? (
                <TouchableOpacity 
                    style={[styles.sendBtn, isPending && styles.sendDisabled]} 
                    onPress={onSend} 
                    disabled={isPending}
                >
                    {isPending ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Ionicons name="send" size={18} color={theme.colors.white} />}
                </TouchableOpacity>
            ) : sendingMedia ? (
                <View style={styles.sendBtn}><ActivityIndicator size="small" color={theme.colors.white} /></View>
            ) : (
                <Pressable 
                    style={[styles.sendBtn, isRecording && styles.recordingBtn]} 
                    onPressIn={onStartRecording} 
                    onPressOut={onStopRecording}
                >
                    <Ionicons name={isRecording ? 'radio-button-on' : 'mic'} size={20} color={theme.colors.white} />
                </Pressable>
            )}
        </View>
    );
};

const createStyles = (theme: any) => StyleSheet.create({
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: theme.isDark ? '#101924' : '#f1f0f0',
        paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        gap: 6,
    },
    recordBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    mediaBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.black,
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15.5,
        maxHeight: 120,
        color: theme.colors.text.primary,
        shadowColor: theme.colors.black, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
    },
    sendDisabled: {
        opacity: 0.4,
    },
    recordingBtn: {
        backgroundColor: theme.colors.danger,
    },
    audioPreviewContainer: {
        backgroundColor: theme.colors.white,
        borderRadius: 24,
        paddingVertical: 4,
        paddingHorizontal: 12,
    },
});
