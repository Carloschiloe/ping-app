import React, { ReactNode, useState } from 'react';
import {
    ActivityIndicator,
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
    Image,
    View,
    ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, gradients, radius, space } from '../../design/tokens';
import { fonts, type } from '../../design/typography';
import { Glass, GlassBackdrop } from '../../design/Glass';
import type { AuthMode } from '../../utils/authForm';

// The sign-in screens share Ping's glass look: silver waves behind, the aura
// on top and one frosted card holding the form.

const MAX_WIDTH = 480;

type AuthScaffoldProps = {
    children: ReactNode;
    buildLabel?: string;
    condensedBrand?: boolean;
};

export function AuthScaffold({ children, buildLabel, condensedBrand = false }: AuthScaffoldProps) {
    const { height, width } = useWindowDimensions();
    const compact = height < 760 || width < 360;

    return (
        <GlassBackdrop moving>
            <StatusBar style="light" />
            <View pointerEvents="none" style={styles.glow} />
            <SafeAreaView style={styles.flex}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
                >
                    <ScrollView
                        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
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
        </GlassBackdrop>
    );
}

const VORIAN_MARK = require('../../../assets/images/vorian-mark.png');

export function AuthBrand({ compact = false }: { compact?: boolean }) {
    return (
        <View style={[styles.brand, compact && styles.brandCompact]} accessible accessibilityLabel="Vorian">
            <Image source={VORIAN_MARK} style={compact ? styles.markCompact : styles.mark} resizeMode="contain" />
            <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>VORIAN</Text>
            <Text style={styles.tagline}>Conversaciones que se convierten en compromisos cumplidos.</Text>
        </View>
    );
}

export function AuthCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return (
        <Glass style={[styles.card, style]} intensity={50} tint={colors.glassTintLight}>
            {/* Lit from above: a silver sheen and a faint blue glow under the top edge. */}
            <LinearGradient pointerEvents="none" colors={gradients.cardSheen} style={StyleSheet.absoluteFill} />
            <LinearGradient
                pointerEvents="none"
                colors={gradients.sheetGlow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.4 }}
                style={StyleSheet.absoluteFill}
            />
            {children}
        </Glass>
    );
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
                        <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
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
    const [focused, setFocused] = useState(false);
    return (
        <View style={[styles.field, focused && styles.fieldFocused]}>
            <LinearGradient pointerEvents="none" colors={gradients.fieldSheen} style={StyleSheet.absoluteFill} />
            <Ionicons name={icon} size={20} color={focused ? colors.accentBright : colors.textFaint} style={styles.fieldIcon} />
            <TextInput
                {...props}
                onFocus={(event) => {
                    setFocused(true);
                    props.onFocus?.(event);
                }}
                onBlur={(event) => {
                    setFocused(false);
                    props.onBlur?.(event);
                }}
                style={[styles.fieldInput, style]}
                placeholderTextColor={colors.textFaint}
                secureTextEntry={secure && hidden}
                selectionColor={colors.accent}
            />
            {secure && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
                    hitSlop={10}
                    onPress={() => setHidden((current) => !current)}
                    style={styles.eyeButton}
                >
                    <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={21} color={colors.textSoft} />
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
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
                {loading ? (
                    <ActivityIndicator color={colors.onAccent} />
                ) : (
                    <>
                        <Text style={styles.primaryButtonText}>{label}</Text>
                        <Ionicons name={icon} size={20} color={colors.onAccent} />
                    </>
                )}
            </LinearGradient>
        </Pressable>
    );
}

const MESSAGE_TONES = {
    error: { icon: 'alert-circle', color: colors.danger, tint: colors.dangerTint },
    warning: { icon: 'time', color: colors.warning, tint: colors.warningTint },
    success: { icon: 'checkmark-circle', color: colors.success, tint: colors.successTint },
    info: { icon: 'information-circle', color: colors.accentBright, tint: colors.accentTint },
} as const;

export function AuthMessage({
    tone,
    children,
}: {
    tone: 'error' | 'warning' | 'success' | 'info';
    children: ReactNode;
}) {
    const look = MESSAGE_TONES[tone];
    return (
        <View style={[styles.message, { backgroundColor: look.tint }]}>
            <Ionicons name={look.icon} size={18} color={look.color} />
            <Text style={[styles.messageText, { color: look.color }]}>{children}</Text>
        </View>
    );
}

export function PrivacyNote() {
    return (
        <View style={styles.privacy}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textFaint} />
            <Text style={styles.privacyText}>Tu información está protegida y solo se usa para tu cuenta.</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    // A soft blue light behind the aura.
    glow: {
        position: 'absolute',
        top: -120,
        alignSelf: 'center',
        width: 420,
        height: 420,
        borderRadius: 210,
        backgroundColor: colors.accentTint,
        opacity: 0.55,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: space.xl,
        paddingVertical: space.xl,
    },
    scrollContentCompact: { justifyContent: 'flex-start', paddingTop: space.md, paddingBottom: space.lg },
    content: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
    brand: { alignItems: 'center', marginBottom: space.xl },
    brandCompact: { marginBottom: space.md },
    mark: { width: 128, height: 128 },
    markCompact: { width: 96, height: 96 },
    wordmark: {
        fontFamily: fonts.bold,
        fontSize: 30,
        letterSpacing: 10,
        marginLeft: 10,
        marginTop: space.xs,
        color: colors.text,
    },
    wordmarkCompact: { fontSize: 26, letterSpacing: 9 },
    tagline: { ...type.subhead, textAlign: 'center', marginTop: space.xs, maxWidth: 300, lineHeight: 20 },
    buildLabel: {
        ...type.caption,
        color: colors.warning,
        backgroundColor: colors.warningTint,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: radius.full,
        alignSelf: 'center',
        marginBottom: space.md,
        overflow: 'hidden',
    },
    card: { borderRadius: radius.xl, padding: space.xl, borderTopColor: colors.glassEdge },
    segmented: {
        flexDirection: 'row',
        backgroundColor: colors.glassPressed,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        borderRadius: radius.md,
        padding: 3,
        marginBottom: space.lg,
    },
    segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm + 1 },
    segmentSelected: {
        backgroundColor: colors.silverTint,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassEdge,
    },
    segmentText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSoft },
    segmentTextSelected: { fontFamily: fonts.semibold, color: colors.text },
    field: {
        minHeight: 52,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        borderTopColor: colors.glassEdge,
        borderRadius: radius.md,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: space.md,
    },
    fieldFocused: { borderColor: colors.accentBright, borderTopColor: colors.accentBright },
    fieldIcon: { marginLeft: space.lg, marginRight: space.md },
    fieldInput: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 14,
        paddingRight: space.md,
        fontFamily: fonts.regular,
        fontSize: 16,
        color: colors.text,
    },
    eyeButton: { paddingHorizontal: space.lg, minHeight: 50, justifyContent: 'center' },
    primaryButtonFrame: { borderRadius: radius.full, overflow: 'hidden', marginTop: space.xs },
    primaryButton: {
        minHeight: 52,
        flexDirection: 'row',
        gap: space.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
    },
    primaryButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
    message: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        padding: 11,
        borderRadius: radius.sm,
        marginBottom: space.md,
    },
    messageText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
    privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.xl },
    privacyText: { ...type.caption, color: colors.textFaint, lineHeight: 17, maxWidth: 260, textAlign: 'center' },
});
