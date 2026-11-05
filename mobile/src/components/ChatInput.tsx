import React from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet, Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioPlayer from './AudioPlayer';
import { Glass } from '../design/Glass';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';
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
    onOpenAttachments: () => void;
    onTakePhoto: () => void;
    onPickGallery: () => void;
    onRecordVideo: () => void;
    onPickDocument: () => void;
    onShareLocation: () => void;
    onCreateCommitment: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onCancelAudio: () => void;
    onUploadAudio: () => void;
    onFocus?: () => void;
}

// Imperative handle so the composer's focus/keyboard state can be
// relinquished BEFORE a native fullscreen surface (camera, gallery,
// document picker) is presented from outside this component — see
// useMediaPicker.ts's blurComposer usage. React Native's TextInput exposes
// both as real imperative methods on its native element (isFocused(),
// blur()); this is not new API surface, just exposing it to the parent.
export type ChatInputHandle = {
    isComposerFocused: () => boolean;
    blurComposer: () => void;
};

// A soft halo that slowly swells and fades around the mic, so the composer
// feels alive while it waits.
function Breath() {
    const t = useSharedValue(0);
    React.useEffect(() => {
        t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
    }, [t]);
    const halo = useAnimatedStyle(() => ({
        opacity: 0.12 + t.value * 0.3,
        transform: [{ scale: 1 + t.value * 0.24 }],
    }));
    return <Reanimated.View pointerEvents="none" style={[styles.breath, halo]} />;
}

function AccentCircle({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
    if (danger) return <View style={[styles.circleFill, styles.circleDanger]}>{children}</View>;
    return (
        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.circleFill}>
            {children}
        </LinearGradient>
    );
}

export const ChatInput = React.forwardRef<ChatInputHandle, ChatInputProps>(({
    text,
    onTextChange,
    onSend,
    isSelf,
    isPending,
    sendingMedia,
    recordingUri,
    isRecording,
    recordingDurationMs,
    onOpenAttachments,
    onTakePhoto,
    onPickGallery,
    onRecordVideo,
    onPickDocument,
    onShareLocation,
    onCreateCommitment,
    onStartRecording,
    onStopRecording,
    onCancelAudio,
    onUploadAudio,
    onFocus,
}, ref) => {
    const insets = useSafeAreaInsets();
    const [showActions, setShowActions] = React.useState(false);
    const inputRef = React.useRef<TextInput>(null);
    const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 16);

    React.useImperativeHandle(ref, () => ({
        isComposerFocused: () => inputRef.current?.isFocused() ?? false,
        blurComposer: () => inputRef.current?.blur(),
    }), []);

    // Everything the + offers, one tap each. The panel is plain views in
    // this window, and closing it is a state update, so the camera or
    // picker that opens next is the only native presentation in flight
    // (two at once leave the iOS camera frozen).
    const attachments: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; run: () => void }[] = [
        { icon: 'camera-outline', label: 'Cámara', run: onTakePhoto },
        { icon: 'images-outline', label: 'Galería', run: onPickGallery },
        { icon: 'videocam-outline', label: 'Video', run: onRecordVideo },
        { icon: 'document-text-outline', label: 'Documento', run: onPickDocument },
        { icon: 'location-outline', label: 'Ubicación', run: onShareLocation },
        { icon: 'calendar-outline', label: 'Compromiso', run: onCreateCommitment },
    ];
    const toggleActions = () => {
        if (!showActions) onOpenAttachments();
        setShowActions((prev) => !prev);
    };

    if (recordingUri) {
        return (
            <View style={[styles.inputBar, styles.container, { paddingBottom: bottomPadding }]}>
                <TouchableOpacity
                    style={[styles.roundBtn, styles.roundBtnDanger]}
                    onPress={onCancelAudio}
                    disabled={sendingMedia || isPending}
                    accessibilityLabel="Descartar audio"
                >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
                <Glass style={styles.field} intensity={50}>
                    <View style={styles.audioPreview}>
                        <AudioPlayer url={recordingUri} isMe={false} durationMs={recordingDurationMs} />
                    </View>
                </Glass>
                <TouchableOpacity
                    style={[styles.sendBtn, (sendingMedia || isPending) && styles.sendDisabled]}
                    onPress={onUploadAudio}
                    disabled={sendingMedia || isPending}
                    accessibilityLabel="Enviar audio"
                >
                    <AccentCircle>
                        {sendingMedia || isPending ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name="send" size={18} color={colors.onAccent} />}
                    </AccentCircle>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingBottom: bottomPadding }]}>
            {showActions && (
                <Glass style={styles.attachPanel} intensity={60}>
                    {attachments.map((item) => (
                        <TouchableOpacity
                            key={item.label}
                            style={styles.attachTile}
                            onPress={() => { setShowActions(false); item.run(); }}
                            disabled={sendingMedia || isPending}
                            accessibilityRole="button"
                            accessibilityLabel={item.label}
                        >
                            <View style={styles.attachIcon}>
                                <Ionicons name={item.icon} size={24} color={colors.accentBright} />
                            </View>
                            <Text style={styles.attachLabel}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </Glass>
            )}
            <View style={styles.inputBar}>
                <TouchableOpacity
                    onPress={toggleActions}
                    disabled={sendingMedia || isPending}
                    accessibilityLabel={showActions ? 'Cerrar adjuntos' : 'Adjuntar'}
                >
                    <Glass style={styles.roundBtn} intensity={50}>
                        <Ionicons name={showActions ? 'close' : 'add'} size={22} color={colors.text} />
                    </Glass>
                </TouchableOpacity>
                <Glass style={[styles.field, isRecording && styles.fieldRecording]} intensity={50}>
                    {isRecording ? (
                        <View style={styles.recordingStatus}>
                            <View style={styles.recordingDot} />
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
                            ref={inputRef}
                            style={styles.input}
                            placeholder={isSelf ? 'Escribe algo para ti...' : 'Escribe un mensaje...'}
                            placeholderTextColor={colors.textFaint}
                            value={text}
                            onChangeText={onTextChange}
                            onFocus={onFocus}
                            multiline
                            blurOnSubmit={false}
                            scrollEnabled
                            textAlignVertical="top"
                            underlineColorAndroid="transparent"
                            selectionColor={colors.accent}
                        />
                    )}
                </Glass>
                {text.trim() ? (
                    <TouchableOpacity
                        style={[styles.sendBtn, isPending && styles.sendDisabled]}
                        onPress={onSend}
                        disabled={isPending}
                        accessibilityLabel="Enviar mensaje"
                    >
                        <AccentCircle>
                            {isPending ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Ionicons name="send" size={18} color={colors.onAccent} />}
                        </AccentCircle>
                    </TouchableOpacity>
                ) : sendingMedia ? (
                    <View style={styles.sendBtn}>
                        <AccentCircle><ActivityIndicator size="small" color={colors.onAccent} /></AccentCircle>
                    </View>
                ) : (
                    <Pressable
                        style={styles.sendBtn}
                        onPressIn={onStartRecording}
                        onPressOut={onStopRecording}
                        accessibilityLabel="Mantén para grabar audio"
                    >
                        {!isRecording && <Breath />}
                        <AccentCircle danger={isRecording}>
                            <Ionicons name={isRecording ? 'radio-button-on' : 'mic'} size={20} color={colors.onAccent} />
                        </AccentCircle>
                    </Pressable>
                )}
            </View>
        </View>
    );
});
ChatInput.displayName = 'ChatInput';

const FIELD_HEIGHT = 46;

const styles = StyleSheet.create({
    container: { paddingHorizontal: space.sm + 2, paddingTop: space.xs },
    attachPanel: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderRadius: radius.xl,
        borderTopColor: colors.glassEdge,
        paddingVertical: space.md,
        marginBottom: space.sm,
        rowGap: space.md,
    },
    attachTile: { width: '33.33%', alignItems: 'center', gap: 6 },
    attachIcon: {
        width: 54,
        height: 54,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
    },
    attachLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.text },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: space.sm,
        paddingVertical: space.xs,
    },
    roundBtn: {
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roundBtnDanger: {
        backgroundColor: colors.glassDim,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.danger,
    },
    field: {
        flex: 1,
        minHeight: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        justifyContent: 'center',
    },
    fieldRecording: { borderColor: colors.danger },
    input: {
        fontFamily: fonts.regular,
        paddingHorizontal: space.lg,
        paddingTop: Platform.OS === 'android' ? 12 : 13,
        paddingBottom: Platform.OS === 'android' ? 10 : 12,
        fontSize: 15,
        lineHeight: 20,
        minHeight: FIELD_HEIGHT,
        maxHeight: 120,
        includeFontPadding: false,
        color: colors.text,
    },
    sendBtn: {
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleFill: {
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleDanger: { backgroundColor: colors.danger },
    breath: {
        position: 'absolute',
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        backgroundColor: colors.accent,
    },
    sendDisabled: { opacity: 0.4 },
    recordingStatus: {
        minHeight: FIELD_HEIGHT,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm + 1,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.danger,
    },
    recordingCopy: { flex: 1 },
    recordingTitle: { fontFamily: fonts.semibold, color: colors.text, fontSize: 13 },
    recordingHint: { fontFamily: fonts.regular, color: colors.textFaint, fontSize: 10, marginTop: 1 },
    recordingTime: {
        fontFamily: fonts.bold,
        minWidth: 42,
        color: colors.danger,
        fontSize: 14,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
    },
    audioPreview: { paddingVertical: 4, paddingHorizontal: space.md },
});
