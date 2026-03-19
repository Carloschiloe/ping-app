import React from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, Platform, Text } from 'react-native';
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
    const [showActions, setShowActions] = React.useState(false);

    const handlePickMedia = React.useCallback(() => {
        setShowActions(false);
        onPickMedia();
    }, [onPickMedia]);

    const handleShareLocation = React.useCallback(() => {
        setShowActions(false);
        onShareLocation();
    }, [onShareLocation]);

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
        <View style={styles.inputContainer}>
            {showActions && (
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handlePickMedia}
                        disabled={sendingMedia || isPending}
                    >
                        <Ionicons name="image-outline" size={18} color={theme.colors.text.secondary} />
                        <Text style={styles.actionLabel}>Foto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handleShareLocation}
                        disabled={sendingMedia || isPending}
                    >
                        <Ionicons name="location-outline" size={18} color={theme.colors.text.secondary} />
                        <Text style={styles.actionLabel}>Ubicacion</Text>
                    </TouchableOpacity>
                </View>
            )}
            <View style={styles.inputBar}>
                <TouchableOpacity
                    style={[styles.mediaBtn, showActions && styles.mediaBtnActive]}
                    onPress={() => setShowActions((prev) => !prev)}
                    disabled={sendingMedia || isPending}
                >
                    <Ionicons name={showActions ? 'close' : 'add'} size={22} color={theme.colors.text.secondary} />
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
        </View>
    );
};

const createStyles = (theme: any) => StyleSheet.create({
    inputContainer: {
        backgroundColor: theme.isDark ? '#101924' : '#f4f3f2',
        paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    actionLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.text.secondary },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 8,
    },
    recordBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    sendBtn: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    mediaBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    mediaBtnActive: {
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    input: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 120,
        color: theme.colors.text.primary,
        borderWidth: 1,
        borderColor: theme.colors.separator,
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
