import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';

// The bottom sheet shared by feedback, reports, blocks and account deletion:
// a title, a short explanation, content, and one main button.

type BaseSheetProps = {
    visible: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    actionDisabled?: boolean;
    busy?: boolean;
    danger?: boolean;
};

export function BaseSheet({ visible, onClose, title, description, children, actionLabel, onAction, actionDisabled, busy, danger }: BaseSheetProps) {
    const insets = useSafeAreaInsets();
    const disabled = actionDisabled || busy;
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                    <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
                        <SheetFill />
                        <View style={styles.handle} />
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
                                <Ionicons name="close-circle" size={24} color={colors.textFaint} />
                            </TouchableOpacity>
                        </View>
                        {!!description && <Text style={styles.description}>{description}</Text>}
                        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
                        {!!actionLabel && onAction && (
                            <TouchableOpacity
                                style={[styles.action, danger && styles.actionDanger, disabled && styles.actionDisabled]}
                                onPress={onAction}
                                disabled={disabled}
                                accessibilityRole="button"
                                accessibilityLabel={actionLabel}
                            >
                                {!danger && <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                                {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.actionText}>{actionLabel}</Text>}
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// A choice among a few options, shown as glass chips.
export function ChoiceChips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T | null; onChange: (value: T) => void }) {
    return (
        <View style={styles.chips}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <TouchableOpacity
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={[styles.chip, selected && styles.chipActive]}
                        accessibilityState={{ selected }}
                        accessibilityLabel={option.label}
                    >
                        {selected && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export const sheetStyles = StyleSheet.create({
    input: {
        fontFamily: fonts.regular, fontSize: 15, color: colors.text,
        backgroundColor: colors.glassRaised, borderColor: colors.glassBorder, borderWidth: 1,
        borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    },
    multiline: { minHeight: 110, textAlignVertical: 'top' },
    label: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textSoft, marginTop: 14, marginBottom: 8 },
    hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textFaint, marginTop: 6 },
});

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%', ...sheetSurface },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.glassRaised, marginBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { fontSize: 18, fontFamily: fonts.bold, color: colors.text, flex: 1 },
    description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textSoft, marginBottom: 6 },
    body: { flexGrow: 0, marginBottom: 16 },
    action: { borderRadius: radius.md, padding: 15, alignItems: 'center', overflow: 'hidden' },
    actionDanger: { backgroundColor: colors.danger },
    actionDisabled: { opacity: 0.45 },
    actionText: { color: colors.onAccent, fontFamily: fonts.bold, fontSize: 15 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, overflow: 'hidden',
        backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    chipActive: { borderColor: 'transparent' },
    chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSoft },
    chipTextActive: { color: colors.onAccent, fontFamily: fonts.semibold },
});
