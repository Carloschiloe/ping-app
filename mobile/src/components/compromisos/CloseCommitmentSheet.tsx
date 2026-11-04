import React, { useEffect, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, TextInput,
    KeyboardAvoidingView, Platform, ActivityIndicator, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { colors, radius, space } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';
import { remainingDueOptions, type CloseOutcome } from '../../utils/commitmentClosing';

export { closingResult, type CloseOutcome } from '../../utils/commitmentClosing';

const OPTIONS: { outcome: CloseOutcome; icon: keyof typeof Ionicons.glyphMap; color: string; task: string; meeting: string }[] = [
    { outcome: 'done', icon: 'checkmark-circle-outline', color: colors.accentBright, task: 'Hecho', meeting: 'Se hizo' },
    { outcome: 'partial', icon: 'ellipsis-horizontal-circle-outline', color: colors.warning, task: 'Hecho a medias, falta algo', meeting: 'Quedó algo pendiente' },
    { outcome: 'not_done', icon: 'close-circle-outline', color: colors.danger, task: 'No se hizo', meeting: 'No se hizo' },
];

interface CloseCommitmentSheetProps {
    item: any | null;
    // Only the owner can call it off; anyone else just closes it.
    canCancel: boolean;
    isSaving?: boolean;
    // Set while going through the overdue items one by one.
    progress?: { index: number; total: number } | null;
    onClose: () => void;
    // Half done comes with the date for what is left.
    onSubmit: (outcome: CloseOutcome, note: string, dueAt: Date | null) => void;
    onReschedule?: (item: any) => void;
    onSkip?: () => void;
    // Inside a list the sheet needs its own window; on a full screen it is
    // drawn over the screen so it reaches the bottom edge.
    inModal?: boolean;
}

export function CloseCommitmentSheet({
    item, canCancel, isSaving = false, progress, onClose, onSubmit, onReschedule, onSkip, inModal = false,
}: CloseCommitmentSheetProps) {
    const [outcome, setOutcome] = useState<CloseOutcome>('done');
    const [note, setNote] = useState('');
    const [dueAt, setDueAt] = useState<Date | null>(null);
    const [picking, setPicking] = useState(false);
    const insets = useSafeAreaInsets();
    const itemId = item?.id;

    useEffect(() => {
        setOutcome('done');
        setNote('');
        setDueAt(null);
        setPicking(false);
    }, [itemId]);

    const open = !!item;
    useEffect(() => {
        if (!open || inModal) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
        return () => sub.remove();
    }, [open, inModal, onClose]);

    if (!item) return null;
    const isMeeting = item.type === 'meeting';
    const options = OPTIONS.filter((o) => o.outcome !== 'not_done' || canCancel);
    const quickDates = remainingDueOptions(new Date());
    const chosenDue = dueAt ?? quickDates[0].date;
    const isQuick = (d: Date) => chosenDue.getTime() === d.getTime();

    const sheet = (
        <>
            <Pressable style={styles.overlay} onPress={onClose} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.dock} pointerEvents="box-none">
                <View style={[styles.card, { paddingBottom: space.xl + (inModal ? 0 : insets.bottom) }]}>
                    <SheetFill />
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={styles.title}>¿Cómo quedó?</Text>
                        {!!progress && <Text style={styles.progress}>{progress.index + 1} de {progress.total}</Text>}
                        <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar">
                            <Ionicons name="close" size={20} color={colors.textSoft} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.subtitle} numberOfLines={2}>{item.title}</Text>

                    {options.map((o) => {
                        const selected = outcome === o.outcome;
                        return (
                            <TouchableOpacity
                                key={o.outcome}
                                style={[styles.option, selected && styles.optionSelected]}
                                onPress={() => setOutcome(o.outcome)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                            >
                                <Ionicons name={o.icon} size={20} color={o.color} />
                                <Text style={styles.optionText}>{isMeeting ? o.meeting : o.task}</Text>
                                {selected && <Ionicons name="checkmark" size={18} color={colors.accentBright} />}
                            </TouchableOpacity>
                        );
                    })}

                    <TextInput
                        style={styles.note}
                        value={note}
                        onChangeText={setNote}
                        placeholder={outcome === 'partial' ? 'Qué falta' : outcome === 'not_done' ? 'Por qué no se hizo' : 'Cómo quedó (opcional)'}
                        placeholderTextColor={colors.textFaint}
                        selectionColor={colors.accent}
                        multiline
                        maxLength={500}
                    />

                    {outcome === 'partial' && (
                        <>
                            <Text style={styles.label}>¿Para cuándo?</Text>
                            <View style={styles.dates}>
                                {quickDates.map((d) => (
                                    <TouchableOpacity
                                        key={d.label}
                                        style={[styles.dateChip, isQuick(d.date) && styles.dateChipOn]}
                                        onPress={() => setDueAt(d.date)}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: isQuick(d.date) }}
                                    >
                                        <Text style={[styles.dateText, isQuick(d.date) && styles.dateTextOn]}>{d.label}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={[styles.dateChip, !quickDates.some((d) => isQuick(d.date)) && styles.dateChipOn]}
                                    onPress={() => setPicking(true)}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="calendar-outline" size={14} color={colors.text} />
                                    <Text style={[styles.dateText, !quickDates.some((d) => isQuick(d.date)) && styles.dateTextOn]}>
                                        {quickDates.some((d) => isQuick(d.date)) ? 'Otra fecha' : format(chosenDue, "d 'de' MMM", { locale: es })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {picking && (
                                <DateTimePicker
                                    value={chosenDue}
                                    mode="date"
                                    minimumDate={new Date()}
                                    onValueChange={(_, date) => {
                                        const next = new Date(date);
                                        next.setHours(10, 0, 0, 0);
                                        setDueAt(next);
                                        setPicking(false);
                                    }}
                                    onDismiss={() => setPicking(false)}
                                />
                            )}
                        </>
                    )}

                    {outcome === 'not_done' && !!onReschedule && (
                        <TouchableOpacity onPress={() => onReschedule(item)} accessibilityRole="button">
                            <Text style={styles.link}>Mejor cambiar la fecha</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.saveBtn, isSaving && styles.saving]}
                        onPress={() => onSubmit(outcome, note, outcome === 'partial' ? chosenDue : null)}
                        disabled={isSaving}
                        accessibilityRole="button"
                    >
                        {isSaving
                            ? <ActivityIndicator color={colors.onAccent} />
                            : <Text style={styles.saveText}>Guardar</Text>}
                    </TouchableOpacity>

                    {progress ? (
                        <View style={styles.reviewRow}>
                            {!!onReschedule && (
                                <TouchableOpacity onPress={() => onReschedule(item)} accessibilityRole="button">
                                    <Text style={styles.link}>Cambiar fecha</Text>
                                </TouchableOpacity>
                            )}
                            {!!onSkip && (
                                <TouchableOpacity onPress={onSkip} accessibilityRole="button">
                                    <Text style={styles.link}>Todavía no</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : null}
                </View>
            </KeyboardAvoidingView>
        </>
    );

    return inModal
        ? <Modal visible transparent animationType="fade" onRequestClose={onClose}>{sheet}</Modal>
        : <View style={styles.screen}>{sheet}</View>;
}

const styles = StyleSheet.create({
    screen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, elevation: 30 },
    overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
    dock: { flex: 1, justifyContent: 'flex-end' },
    card: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: space.xl,
        gap: 10,
        ...sheetSurface,
    },
    handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, marginBottom: 4 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.text },
    progress: { fontSize: 13, fontFamily: fonts.medium, color: colors.textSoft },
    subtitle: { fontSize: 14, fontFamily: fonts.medium, color: colors.textSoft, marginBottom: 4 },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassDim,
    },
    optionSelected: { borderColor: colors.accentBright, backgroundColor: colors.accentTint },
    optionText: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: colors.text },
    note: {
        minHeight: 48,
        maxHeight: 120,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassDim,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        fontFamily: fonts.regular,
        color: colors.text,
        textAlignVertical: 'top',
    },
    label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textSoft, marginTop: 2 },
    dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dateChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: radius.full,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassDim,
    },
    dateChipOn: { borderColor: colors.accentBright, backgroundColor: colors.accentTint },
    dateText: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },
    dateTextOn: { color: colors.accentBright },
    link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.accentBright, textAlign: 'center', paddingVertical: 4 },
    saveBtn: {
        minHeight: 48,
        borderRadius: radius.full,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    saving: { opacity: 0.6 },
    saveText: { fontSize: 16, fontFamily: fonts.bold, color: colors.onAccent },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-around' },
});
