import React from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AudioPlayer from './AudioPlayer';
import { useAppTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRecordingDuration } from '../utils/audioRecording';

interface ChatInputProps {
    text: string;
    onTextChange: (t: string) => void;
    onSend: () => void;
    isSelf: boolean;
    isPending: boolean;
    sendingMedia: boolean;
    recordingUri: string | null;
    isRecording: boolean;
    recordingDurationMs: number;
    onPickMedia: () => void;
    onShareLocation: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onCancelAudio: () => void;
    onUploadAudio: () => void;
    onFocus?: () => void;
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
    recordingDurationMs,
    onPickMedia,
    onShareLocation,
    onStartRecording,
    onStopRecording,
    onCancelAudio,
    onUploadAudio,
    onFocus,
}) => {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
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
            <View
                style={[
                    styles.inputBar,
                    { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 16) },
                ]}
            >
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
        <View
            style={[
                styles.inputContainer,
                { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 16) },
            ]}
        >
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
                {isRecording ? (
                    <View style={styles.recordingStatus}>
                        <View style={styles.recordingPulse}>
                            <Ionicons name="mic" size={19} color={theme.colors.white} />
                        </View>
                        <View style={styles.recordingCopy}>
                            <Text style={styles.recordingTitle}>Grabando audio</Text>
                            <Text style={styles.recordingHint}>Suelta para terminar</Text>
                        </View>
                        <Text style={styles.recordingTime}>
                            {formatRecordingDuration(recordingDurationMs)}
                        </Text>
                    </View>
                ) : (
                    <TextInput
                        style={styles.input}
                        placeholder={isSelf ? 'Escribe algo para ti...' : 'Escribe un mensaje...'}
                        placeholderTextColor={theme.colors.text.muted}
                        value={text}
                        onChangeText={onTextChange}
                        onFocus={onFocus}
                        multiline
                        blurOnSubmit={false}
                        scrollEnabled
                        textAlignVertical="top"
                        underlineColorAndroid="transparent"
                        selectionColor={theme.colors.primary}
                    />
                )}
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
        paddingTop: Platform.OS === 'android' ? 12 : 10,
        paddingBottom: Platform.OS === 'android' ? 10 : 10,
        fontSize: 15,
        lineHeight: 20,
        minHeight: 46,
        maxHeight: 120,
        includeFontPadding: false,
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
    recordingStatus: {
        flex: 1,
        minHeight: 46,
        borderRadius: 23,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: theme.isDark ? '#2b1b20' : '#fff1f2',
        borderWidth: 1,
        borderColor: theme.isDark ? '#7f1d1d' : '#fecdd3',
    },
    recordingPulse: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.danger,
    },
    recordingCopy: {
        flex: 1,
    },
    recordingTitle: {
        color: theme.colors.text.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    recordingHint: {
        color: theme.colors.text.muted,
        fontSize: 10,
        marginTop: 1,
    },
    recordingTime: {
        minWidth: 42,
        color: theme.colors.danger,
        fontSize: 14,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
    },
    audioPreviewContainer: {
        backgroundColor: theme.colors.white,
        borderRadius: 24,
        paddingVertical: 4,
        paddingHorizontal: 12,
    },
});
