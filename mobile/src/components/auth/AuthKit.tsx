import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    ActivityIndicator,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleProp,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    useWindowDimensions,
    View,
    ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authColors, authLayout } from '../../theme/authTheme';
import type { AuthMode } from '../../utils/authForm';

type AuthScaffoldProps = {
    children: ReactNode;
    buildLabel?: string;
    condensedBrand?: boolean;
};

export function AuthScaffold({ children, buildLabel, condensedBrand = false }: AuthScaffoldProps) {
    const { height, width } = useWindowDimensions();
    const compact = height < 760 || width < 360;
    const backgroundMotion = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let animation: Animated.CompositeAnimation | undefined;
        let active = true;

        AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
            if (!active || reduceMotion) return;
            animation = Animated.loop(
                Animated.sequence([
                    Animated.timing(backgroundMotion, {
                        toValue: 1,
                        duration: 6200,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(backgroundMotion, {
                        toValue: 0,
                        duration: 6200,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ]),
            );
            animation.start();
        });

        return () => {
            active = false;
            animation?.stop();
        };
    }, [backgroundMotion]);

    return (
        <LinearGradient colors={['#f8fbff', '#f4f5ff', '#e9edff']} style={styles.background}>
            <View style={styles.decorations}>
                <Animated.View
                    style={[
                        styles.topBlob,
                        {
                            transform: [
                                {
                                    translateX: backgroundMotion.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, 24],
                                    }),
                                },
                                {
                                    translateY: backgroundMotion.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, 18],
                                    }),
                                },
                                {
                                    scale: backgroundMotion.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1, 1.08],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(72,98,255,0.85)', 'rgba(107,78,255,0.42)']}
                        style={styles.fill}
                    />
                </Animated.View>
                <Animated.View
                    style={[
                        styles.rings,
                        {
                            opacity: backgroundMotion.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.45, 1],
                            }),
                            transform: [
                                {
                                    scale: backgroundMotion.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.92, 1.08],
                                    }),
                                },
                            ],
                        },
                    ]}
                />
                <Animated.View
                    style={[
                        styles.bottomBlob,
                        {
                            transform: [
                                {
                                    translateY: backgroundMotion.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [12, -12],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(91,67,245,0.32)', 'rgba(78,216,237,0.05)']}
                        style={styles.fill}
                    />
                </Animated.View>
            </View>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
                >
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            compact && styles.scrollContentCompact,
                        ]}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.content}>
                            <AuthBrand compact={compact || condensedBrand} />
                            {!!buildLabel && <Text style={styles.buildLabel}>{buildLabel}</Text>}
                            {children}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

export function AuthBrand({ compact = false }: { compact?: boolean }) {
    return (
        <View style={[styles.brand, compact && styles.brandCompact]}>
            <PingLogo compact={compact} />
            <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>PING</Text>
            <Text style={styles.tagline}>Recuerda lo importante</Text>
        </View>
    );
}

export function PingLogo({ compact = false }: { compact?: boolean }) {
    const size = compact ? 74 : 92;
    const floatMotion = useRef(new Animated.Value(0)).current;
    const signalMotion = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let floatAnimation: Animated.CompositeAnimation | undefined;
        let signalAnimation: Animated.CompositeAnimation | undefined;
        let active = true;

        AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
            if (!active || reduceMotion) return;
            floatAnimation = Animated.loop(
                Animated.sequence([
                    Animated.timing(floatMotion, {
                        toValue: 1,
                        duration: 1700,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(floatMotion, {
                        toValue: 0,
                        duration: 1700,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ]),
            );
            signalAnimation = Animated.loop(
                Animated.sequence([
                    Animated.timing(signalMotion, {
                        toValue: 1,
                        duration: 1150,
                        easing: Easing.out(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(signalMotion, {
                        toValue: 0,
                        duration: 650,
                        easing: Easing.in(Easing.quad),
                        useNativeDriver: true,
                    }),
                ]),
            );
            floatAnimation.start();
            signalAnimation.start();
        });

        return () => {
            active = false;
            floatAnimation?.stop();
            signalAnimation?.stop();
        };
    }, [floatMotion, signalMotion]);

    return (
        <Animated.View
            accessibilityLabel="Logo de Ping"
            accessible
            style={[
                styles.logoCanvas,
                {
                    width: size + 34,
                    height: size,
                    transform: [
                        {
                            translateY: floatMotion.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -7],
                            }),
                        },
                        {
                            rotate: floatMotion.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '-1.5deg'],
                            }),
                        },
                    ],
                },
            ]}
        >
            <Animated.View
                style={[
                    styles.signal,
                    {
                        opacity: signalMotion.interpolate({
                            inputRange: [0, 0.65, 1],
                            outputRange: [0.45, 1, 0.45],
                        }),
                        transform: [
                            {
                                scale: signalMotion.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.9, 1.12],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <View style={[styles.wave, styles.waveLarge, compact && styles.waveLargeCompact]} />
                <View style={[styles.wave, styles.waveMedium, compact && styles.waveMediumCompact]} />
                <Ionicons
                    name="sparkles"
                    size={compact ? 18 : 22}
                    color={authColors.primary}
                    style={styles.sparkle}
                />
            </Animated.View>
            <LinearGradient
                colors={[authColors.primary, authColors.indigo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, compact && styles.bubbleCompact]}
            >
                <View style={styles.dots}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                </View>
            </LinearGradient>
            <View style={[styles.tail, compact && styles.tailCompact]} />
        </Animated.View>
    );
}

export function AuthCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.card, style]}>{children}</View>;
}

export function AuthSegmentedControl({
    value,
    onChange,
    disabled,
}: {
    value: AuthMode;
    onChange: (mode: AuthMode) => void;
    disabled?: boolean;
}) {
    return (
        <View style={styles.segmented} accessibilityRole="tablist">
            {([
                ['login', 'Iniciar sesión'],
                ['signup', 'Crear cuenta'],
            ] as const).map(([mode, label]) => {
                const selected = value === mode;
                return (
                    <Pressable
                        key={mode}
                        accessibilityRole="tab"
                        accessibilityState={{ selected, disabled }}
                        onPress={() => onChange(mode)}
                        disabled={disabled}
                        style={({ pressed }) => [
                            styles.segment,
                            selected && styles.segmentSelected,
                            pressed && !disabled && styles.pressed,
                        ]}
                    >
                        <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                            {label}
                        </Text>
                        {selected && <View style={styles.segmentIndicator} />}
                    </Pressable>
                );
            })}
        </View>
    );
}

type AuthFieldProps = TextInputProps & {
    icon: keyof typeof Ionicons.glyphMap;
    secure?: boolean;
};

export function AuthField({ icon, secure = false, style, ...props }: AuthFieldProps) {
    const [hidden, setHidden] = useState(secure);
    return (
        <View style={styles.field}>
            <Ionicons name={icon} size={21} color="#6476d8" style={styles.fieldIcon} />
            <TextInput
                {...props}
                style={[styles.fieldInput, style]}
                placeholderTextColor={authColors.placeholder}
                secureTextEntry={secure && hidden}
                selectionColor={authColors.primary}
            />
            {secure && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
                    hitSlop={10}
                    onPress={() => setHidden((current) => !current)}
                    style={styles.eyeButton}
                >
                    <Ionicons
                        name={hidden ? 'eye-outline' : 'eye-off-outline'}
                        size={22}
                        color={authColors.inkSoft}
                    />
                </Pressable>
            )}
        </View>
    );
}

export function AuthPrimaryButton({
    label,
    onPress,
    loading,
    disabled,
    icon = 'arrow-forward',
}: {
    label: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    icon?: keyof typeof Ionicons.glyphMap;
}) {
    const unavailable = !!loading || !!disabled;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: unavailable, busy: !!loading }}
            onPress={onPress}
            disabled={unavailable}
            style={({ pressed }) => [
                styles.primaryButtonFrame,
                unavailable && styles.disabled,
                pressed && !unavailable && styles.pressed,
            ]}
        >
            <LinearGradient
                colors={unavailable ? ['#98a2dd', '#8d96d3'] : [authColors.primary, authColors.indigo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButton}
            >
                {loading ? (
                    <ActivityIndicator color={authColors.white} />
                ) : (
                    <>
                        <Text style={styles.primaryButtonText}>{label}</Text>
                        <View style={styles.primaryButtonIcon}>
                            <Ionicons name={icon} size={22} color={authColors.white} />
                        </View>
                    </>
                )}
            </LinearGradient>
        </Pressable>
    );
}

export function AuthMessage({
    tone,
    children,
}: {
    tone: 'error' | 'warning' | 'success' | 'info';
    children: ReactNode;
}) {
    const icon = tone === 'error'
        ? 'alert-circle'
        : tone === 'warning'
            ? 'time'
            : tone === 'success'
                ? 'checkmark-circle'
                : 'information-circle';
    return (
        <View style={[styles.message, styles[`message_${tone}`]]}>
            <Ionicons
                name={icon}
                size={18}
                color={tone === 'error'
                    ? authColors.danger
                    : tone === 'warning'
                        ? authColors.warning
                        : authColors.success}
            />
            <Text style={[styles.messageText, styles[`messageText_${tone}`]]}>{children}</Text>
        </View>
    );
}

export function PrivacyNote() {
    return (
        <View style={styles.privacy}>
            <Ionicons name="shield-checkmark-outline" size={22} color={authColors.primary} />
            <Text style={styles.privacyText}>
                Tu información se protege y sólo se usa para tu cuenta.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    background: { flex: 1 },
    safeArea: { flex: 1 },
    decorations: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' },
    fill: { flex: 1, borderRadius: 999 },
    topBlob: {
        position: 'absolute',
        width: 270,
        height: 270,
        borderRadius: 135,
        left: -145,
        top: -125,
    },
    bottomBlob: {
        position: 'absolute',
        width: 170,
        height: 170,
        borderRadius: 85,
        right: -86,
        bottom: 50,
    },
    rings: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        borderWidth: 1,
        borderColor: 'rgba(78,95,190,0.08)',
        right: -105,
        top: 120,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: authLayout.horizontalPadding,
        paddingVertical: 24,
    },
    scrollContentCompact: { justifyContent: 'flex-start', paddingTop: 12, paddingBottom: 18 },
    content: { width: '100%', maxWidth: authLayout.maxWidth, alignSelf: 'center' },
    brand: { alignItems: 'center', marginBottom: 18 },
    brandCompact: { marginBottom: 10 },
    logoCanvas: { position: 'relative', alignSelf: 'center' },
    signal: { ...StyleSheet.absoluteFillObject },
    bubble: {
        position: 'absolute',
        width: 72,
        height: 60,
        borderRadius: 28,
        left: 2,
        bottom: 7,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: authColors.primary,
        shadowOpacity: 0.25,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 7,
    },
    bubbleCompact: { width: 62, height: 52, borderRadius: 24, bottom: 5 },
    tail: {
        position: 'absolute',
        left: 7,
        bottom: 2,
        width: 0,
        height: 0,
        borderTopWidth: 15,
        borderRightWidth: 15,
        borderTopColor: authColors.indigo,
        borderRightColor: 'transparent',
        transform: [{ rotate: '-8deg' }],
    },
    tailCompact: { borderTopWidth: 13, borderRightWidth: 13 },
    dots: { flexDirection: 'row', gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: authColors.white },
    wave: {
        position: 'absolute',
        borderWidth: 3,
        borderColor: authColors.cyan,
        borderLeftColor: 'transparent',
        borderBottomColor: 'transparent',
        transform: [{ rotate: '-10deg' }],
    },
    waveLarge: { width: 74, height: 74, borderRadius: 40, right: 0, top: 0 },
    waveLargeCompact: { width: 62, height: 62, borderRadius: 32, right: 2 },
    waveMedium: { width: 52, height: 52, borderRadius: 28, right: 11, top: 11 },
    waveMediumCompact: { width: 44, height: 44, borderRadius: 24, right: 11, top: 9 },
    sparkle: { position: 'absolute', right: 17, top: 27 },
    wordmark: {
        color: authColors.ink,
        fontSize: 38,
        fontWeight: '900',
        letterSpacing: 8,
        marginLeft: 8,
        marginTop: 2,
    },
    wordmarkCompact: { fontSize: 31, letterSpacing: 7 },
    tagline: { color: authColors.inkSoft, fontSize: 15, marginTop: 2 },
    buildLabel: {
        color: '#795400',
        backgroundColor: '#fff6d6',
        borderColor: '#f5df8b',
        borderWidth: 1,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 999,
        alignSelf: 'center',
        marginBottom: 12,
        fontSize: 11,
        fontWeight: '800',
    },
    card: {
        backgroundColor: authColors.surface,
        borderColor: 'rgba(199,207,238,0.72)',
        borderWidth: 1,
        borderRadius: authLayout.radiusCard,
        padding: 20,
        shadowColor: '#263b97',
        shadowOpacity: 0.13,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
    },
    segmented: {
        flexDirection: 'row',
        backgroundColor: '#f3f5fd',
        borderRadius: 16,
        padding: 4,
        marginBottom: 18,
    },
    segment: {
        flex: 1,
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 13,
    },
    segmentSelected: {
        backgroundColor: authColors.white,
        shadowColor: '#384b9d',
        shadowOpacity: 0.11,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    segmentText: { color: authColors.inkSoft, fontSize: 15, fontWeight: '600' },
    segmentTextSelected: { color: authColors.primary, fontWeight: '800' },
    segmentIndicator: {
        position: 'absolute',
        height: 3,
        width: '72%',
        borderRadius: 2,
        bottom: 0,
        backgroundColor: authColors.primary,
    },
    field: {
        minHeight: 58,
        borderWidth: 1.5,
        borderColor: authColors.border,
        borderRadius: authLayout.radiusControl,
        backgroundColor: authColors.white,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    fieldIcon: { marginLeft: 16, marginRight: 11 },
    fieldInput: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 15,
        paddingRight: 12,
        color: authColors.ink,
        fontSize: 16,
    },
    eyeButton: { paddingHorizontal: 15, minHeight: 56, justifyContent: 'center' },
    primaryButtonFrame: {
        borderRadius: 17,
        marginTop: 6,
        shadowColor: authColors.primary,
        shadowOpacity: 0.27,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 9 },
        elevation: 7,
    },
    primaryButton: {
        minHeight: 58,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    primaryButtonText: { color: authColors.white, fontSize: 17, fontWeight: '800' },
    primaryButtonIcon: {
        position: 'absolute',
        right: 10,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.13)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabled: { opacity: 0.68, shadowOpacity: 0 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.995 }] },
    message: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 11,
        borderRadius: 12,
        marginBottom: 12,
    },
    message_error: { backgroundColor: authColors.dangerSurface },
    message_warning: { backgroundColor: authColors.warningSurface },
    message_success: { backgroundColor: authColors.successSurface },
    message_info: { backgroundColor: '#eef3ff' },
    messageText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    messageText_error: { color: authColors.danger },
    messageText_warning: { color: authColors.warning },
    messageText_success: { color: authColors.success },
    messageText_info: { color: '#3650a3' },
    privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 },
    privacyText: { color: authColors.inkSoft, fontSize: 12, lineHeight: 17, maxWidth: 260, textAlign: 'center' },
});
