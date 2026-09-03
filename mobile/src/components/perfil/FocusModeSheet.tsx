import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';

interface FocusModeSheetProps {
    visible: boolean;
    onClose: () => void;
    focusActive: boolean;
    focusRemainingLabel: string;
    onActivateFocus: (minutes: number) => Promise<void>;
    onCancelFocus: () => Promise<void>;
}

export function FocusModeSheet({
    visible,
    onClose,
    focusActive,
    focusRemainingLabel,
    onActivateFocus,
    onCancelFocus,
}: FocusModeSheetProps) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();

    const focusDurations = [
        { minutes: 15, label: '15 min' },
        { minutes: 30, label: '30 min' },
        { minutes: 60, label: '1 hora' },
        { minutes: 120, label: '2 horas' },
    ];

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            paddingBottom: Math.max(insets.bottom, 24) + 12,
                        },
                    ]}
                >
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Modo Foco</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={24} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.description, { color: theme.colors.text.secondary }]}>
                        Reduce interrupciones dentro de Ping durante un tiempo determinado.
                    </Text>

                    {focusActive ? (
                        <View style={styles.activeContainer}>
                            <View style={[styles.activeBadge, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.accent }]}>
                                <Ionicons name="moon" size={22} color={theme.colors.accent} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.activeTitle, { color: theme.colors.text.primary }]}>Modo Foco Activo</Text>
                                    <Text style={[styles.activeMeta, { color: theme.colors.text.secondary }]}>
                                        {focusRemainingLabel ? `Quedan ${focusRemainingLabel}` : 'Activo'}
                                    </Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.cancelBtn, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.danger }]}
                                onPress={async () => {
                                    await onCancelFocus();
                                    onClose();
                                }}
                            >
                                <Text style={[styles.cancelBtnText, { color: theme.colors.danger }]}>Desactivar Modo Foco</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.optionsContainer}>
                            <Text style={[styles.optionsLabel, { color: theme.colors.text.muted }]}>DURACIÓN</Text>
                            <View style={styles.chipsRow}>
                                {focusDurations.map(opt => (
                                    <TouchableOpacity
                                        key={opt.minutes}
                                        style={[
                                            styles.chip,
                                            { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.separator },
                                        ]}
                                        onPress={async () => {
                                            await onActivateFocus(opt.minutes);
                                            onClose();
                                        }}
                                    >
                                        <Ionicons name="timer-outline" size={16} color={theme.colors.accent} />
                                        <Text style={[styles.chipText, { color: theme.colors.text.primary }]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
        // No explicit height — grows with content only
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    activeContainer: {
        gap: 16,
        marginBottom: 12,
    },
    activeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
    },
    activeTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    activeMeta: {
        fontSize: 13,
        marginTop: 2,
    },
    cancelBtn: {
        paddingVertical: 13,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
    },
    cancelBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    optionsContainer: {
        marginBottom: 16,
    },
    optionsLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginBottom: 12,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
