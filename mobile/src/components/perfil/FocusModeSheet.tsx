import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';
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
                            paddingBottom: Math.max(insets.bottom, 24) + 12,
                        },
                    ]}
                >
                    <SheetFill />
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Modo Foco</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={24} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.description, { color: colors.textSoft }]}>
                        Reduce interrupciones dentro de Vorian durante un tiempo determinado.
                    </Text>

                    {focusActive ? (
                        <View style={styles.activeContainer}>
                            <View style={[styles.activeBadge, { backgroundColor: colors.glassRaised, borderColor: colors.accent }]}>
                                <Ionicons name="moon" size={22} color={colors.accentBright} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.activeTitle, { color: colors.text }]}>Modo Foco Activo</Text>
                                    <Text style={[styles.activeMeta, { color: colors.textSoft }]}>
                                        {focusRemainingLabel ? `Quedan ${focusRemainingLabel}` : 'Activo'}
                                    </Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.cancelBtn, { backgroundColor: colors.glassRaised, borderColor: colors.danger }]}
                                onPress={async () => {
                                    await onCancelFocus();
                                    onClose();
                                }}
                            >
                                <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Desactivar Modo Foco</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.optionsContainer}>
                            <Text style={[styles.optionsLabel, { color: colors.textFaint }]}>DURACIÓN</Text>
                            <View style={styles.chipsRow}>
                                {focusDurations.map(opt => (
                                    <TouchableOpacity
                                        key={opt.minutes}
                                        style={[
                                            styles.chip,
                                            { backgroundColor: colors.glassRaised, borderColor: colors.separator },
                                        ]}
                                        onPress={async () => {
                                            await onActivateFocus(opt.minutes);
                                            onClose();
                                        }}
                                    >
                                        <Ionicons name="timer-outline" size={16} color={colors.accentBright} />
                                        <Text style={[styles.chipText, { color: colors.text }]}>{opt.label}</Text>
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
        backgroundColor: colors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
        // No explicit height — grows with content only
        ...sheetSurface,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.glassRaised,
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
        fontFamily: fonts.bold,
    },
    closeBtn: {
        padding: 4,
    },
    description: { fontFamily: fonts.regular,
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
        fontFamily: fonts.bold,
    },
    activeMeta: { fontFamily: fonts.regular,
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
        fontFamily: fonts.bold,
    },
    optionsContainer: {
        marginBottom: 16,
    },
    optionsLabel: {
        fontSize: 11,
        fontFamily: fonts.bold,
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
        fontFamily: fonts.semibold,
    },
});
