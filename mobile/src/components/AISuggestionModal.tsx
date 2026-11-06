import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../api/client';
import { useContacts, useCreateContact } from '../api/queries';
import { formatSuggestionDueAt } from '../utils/timeZone';
import { colors, gradients } from '../design/tokens';
import { fonts } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';

interface AISuggestionModalProps {
    visible: boolean;
    suggestionData: any;
    user: any;
    isGroup: boolean;
    groupParticipants: any[];
    onClose: () => void;
    onConfirm: () => void;
    onUpdateData: (data: any) => void;
    avatarColor: (str: string) => string;
    isEditing?: boolean;
    isCounterProposal?: boolean;
    onCancel?: (reason?: string) => Promise<void> | void;
    isCancelling?: boolean;
}

export const AISuggestionModal: React.FC<AISuggestionModalProps> = ({
    visible,
    suggestionData,
    user,
    isGroup,
    groupParticipants,
    onClose,
    onConfirm,
    onUpdateData,
    avatarColor,
    isEditing,
    isCounterProposal = false,
    onCancel,
    isCancelling = false,
}) => {
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
    const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);
    const { data: myContacts } = useContacts();
    const { mutateAsync: createContact, isPending: isCreatingContact } = useCreateContact();

    const handleCreateContact = () => {
        Alert.prompt(
            'Nuevo contacto',
            'Nombre del contacto (sin cuenta en Vorian):',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Crear',
                    onPress: async (name?: string) => {
                        if (!name?.trim()) return;
                        const contact = await createContact({ display_name: name.trim() });
                        onUpdateData({ ...suggestionData, counterpartyContactId: contact.id, assignedToUserId: null });
                    },
                },
            ],
            'plain-text'
        );
    };

    const checkConflicts = React.useCallback(async () => {
        try {
            setIsCheckingConflicts(true);
            const excludeParam = suggestionData.id ? `&excludeId=${suggestionData.id}` : '';
            const res = await apiClient.get(`/commitments/check-conflict?dueAt=${encodeURIComponent(suggestionData.dueAt)}${excludeParam}`);
            setConflicts(res || []);
        } catch (err) {
            console.error('[AISuggestionModal] Conflict check failed:', err);
        } finally {
            setIsCheckingConflicts(false);
        }
    }, [suggestionData?.dueAt, suggestionData?.id]);

    useEffect(() => {
        if (visible && suggestionData?.dueAt) {
            checkConflicts();
        } else {
            setConflicts([]);
        }
    }, [visible, suggestionData?.dueAt, suggestionData?.assignedToUserId, checkConflicts]);

    useEffect(() => {
        if (!visible) {
            setShowCancelConfirmation(false);
            setCancelReason('');
            setIsSubmittingCancellation(false);
        }
    }, [visible]);

    const handleCancelCommitment = async () => {
        if (!onCancel || isCancelling || isSubmittingCancellation) return;
        try {
            setIsSubmittingCancellation(true);
            await onCancel(cancelReason.trim() || undefined);
        } finally {
            setIsSubmittingCancellation(false);
        }
    };
    // @react-native-community/datetimepicker v9: `onChange` está deprecado a
    // favor de `onValueChange` (siempre trae `date`, nunca opcional) +
    // `onDismiss` (cancelación/back) como callbacks separados -- ya no hace
    // falta inspeccionar `event.type === 'dismissed'` manualmente, eso ahora
    // es exactamente lo que dispara `onDismiss`.
    // Without a date yet, the picker starts at the next full hour.
    const pickerBase = () => {
        if (suggestionData?.dueAt) return new Date(suggestionData.dueAt);
        const next = new Date();
        next.setHours(next.getHours() + 1, 0, 0, 0);
        return next;
    };

    const onDateChange = (selectedDate: Date) => {
        if (Platform.OS === 'ios') {
            // In iOS datetime mode, selectedDate has everything
            onUpdateData({ ...suggestionData, dueAt: selectedDate.toISOString() });
        } else {
            const currentSelected = pickerBase();
            if (pickerMode === 'date') {
                currentSelected.setFullYear(selectedDate.getFullYear());
                currentSelected.setMonth(selectedDate.getMonth());
                currentSelected.setDate(selectedDate.getDate());

                setShowPicker(false);
                setTimeout(() => {
                    setPickerMode('time');
                    setShowPicker(true);
                }, 100);
            } else {
                currentSelected.setHours(selectedDate.getHours());
                currentSelected.setMinutes(selectedDate.getMinutes());
                setShowPicker(false);
                onUpdateData({ ...suggestionData, dueAt: currentSelected.toISOString() });
            }
        }
    };

    if (!suggestionData) return null;

    const isMeeting = suggestionData.type === 'meeting';
    const typeLabel = isMeeting ? 'REUNIÓN' : 'TAREA';

    const currentAssignee = groupParticipants.find(p => p.id === suggestionData.assignedToUserId);
    const currentContact = (myContacts || []).find((c: any) => c.id === suggestionData.counterpartyContactId);
    const assigneeName = suggestionData.counterpartyContactId
        ? (currentContact?.display_name || 'Contacto externo')
        : suggestionData.assignedToUserId === null
            ? 'Todos'
            : suggestionData.assignedToUserId === user?.id
                ? 'Para ti'
                : (currentAssignee?.full_name || 'Sin asignar');

    const missingTitle = !isCounterProposal && !suggestionData.title?.trim();

    // Safe date parsing
    const formattedDate = suggestionData.dueAt ? formatSuggestionDueAt(suggestionData.dueAt) : 'Sin fecha · toca para elegir';

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.suggestionModal}>
                    <SheetFill />
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            {isCounterProposal
                                ? 'Sugerir otro horario'
                                : isEditing
                                    ? `✏️ Editar ${typeLabel}`
                                    : suggestionData.messageId ? 'Crear compromiso' : 'Nuevo compromiso'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
                            <Ionicons name="close" size={24} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView 
                        style={styles.modalScroll} 
                        contentContainerStyle={styles.modalScrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.modalBody}>
                            {!isCounterProposal && !isEditing && (
                                <View style={styles.typeRow}>
                                    {(['task', 'meeting'] as const).map((kind) => {
                                        const selected = (kind === 'meeting') === isMeeting;
                                        return (
                                            <TouchableOpacity
                                                key={kind}
                                                style={[styles.typeChip, selected && styles.typeChipActive]}
                                                onPress={() => onUpdateData({ ...suggestionData, type: kind })}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected }}
                                            >
                                                <Ionicons
                                                    name={kind === 'meeting' ? 'people-outline' : 'checkbox-outline'}
                                                    size={16}
                                                    color={selected ? colors.onAccent : colors.textSoft}
                                                />
                                                <Text style={[styles.typeChipText, selected && styles.typeChipTextActive]}>
                                                    {kind === 'meeting' ? 'Reunión' : 'Tarea'}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                            {!isCounterProposal && (
                                <>
                                    <Text style={styles.inputLabel}>TÍTULO DE LA {typeLabel}</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        value={suggestionData.title}
                                        onChangeText={(t) => onUpdateData({ ...suggestionData, title: t })}
                                        placeholder={`Nombre de la ${typeLabel.toLowerCase()}`}
                                    />
                                </>
                            )}

                            <Text style={styles.inputLabel}>FECHA Y HORA (Toca para cambiar)</Text>
                            <TouchableOpacity 
                                style={styles.datePreview} 
                                onPress={() => {
                                    setPickerMode('date');
                                    setShowPicker(true);
                                }}
                            >
                                <Ionicons name={isMeeting ? "calendar" : "list"} size={20} color={colors.accentBright} />
                                <Text style={[styles.dateText, isMeeting && { color: colors.accentBright }]}>
                                    {formattedDate}
                                </Text>
                                <Ionicons name="pencil" size={14} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>

                            {showPicker && (
                                <View style={styles.pickerWrapper}>
                                    <DateTimePicker
                                        value={pickerBase()}
                                        mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                                        is24Hour={true}
                                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                        onValueChange={(_, date) => onDateChange(date)}
                                        onDismiss={() => setShowPicker(false)}
                                        themeVariant="light"
                                        {...(Platform.OS === 'android' ? { textColor: colors.accentBright } : {})}
                                    />
                                    {Platform.OS === 'ios' && (
                                        <TouchableOpacity 
                                            style={styles.confirmPickerBtn} 
                                            onPress={() => setShowPicker(false)}
                                        >
                                            <Text style={styles.confirmPickerBtnText}>Confirmar Fecha y Hora</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}

                            <View style={styles.statusContainer}>
                                {isCheckingConflicts && (
                                    <View style={styles.checkingContainer}>
                                        <ActivityIndicator size="small" color={colors.accentBright} />
                                        <Text style={styles.checkingText}>Verificando conflictos...</Text>
                                    </View>
                                )}

                                {conflicts.length > 0 && !isCheckingConflicts && (
                                    <View style={styles.conflictBanner}>
                                        <Ionicons name="warning" size={16} color={colors.danger} />
                                        <Text style={styles.conflictText} numberOfLines={2}>
                                            Conflicto: ya tienes {conflicts.length === 1 ? 'un compromiso' : 'compromisos'} a esta hora ({conflicts.map((c: any) => c.title).join(', ')})
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {!isCounterProposal && (
                            <>
                            <Text style={styles.inputLabel}>RESPONSABLE</Text>
                            <View style={styles.assigneeSelectorContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assigneeList}>
                                    {isGroup && (
                                        <TouchableOpacity
                                            style={[styles.assigneeOption, suggestionData.assignedToUserId === null && !suggestionData.counterpartyContactId && styles.assigneeOptionActive]}
                                            onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: null, counterpartyContactId: null })}
                                        >
                                            <View style={[styles.assigneeAvatar, { backgroundColor: colors.successTint }]}>
                                                <Ionicons name="people" size={24} color={colors.onAccent} />
                                            </View>
                                            <Text style={[styles.assigneeOptionText, suggestionData.assignedToUserId === null && !suggestionData.counterpartyContactId && styles.assigneeTextActive]}>Todos</Text>
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.assigneeOption, suggestionData.assignedToUserId === user?.id && styles.assigneeOptionActive]}
                                        onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: user?.id, counterpartyContactId: null })}
                                    >
                                        <View style={[styles.assigneeAvatar, { backgroundColor: isMeeting ? colors.accentBright : colors.accentBright }]}>
                                            <Text style={styles.assigneeAvatarText}>Yo</Text>
                                        </View>
                                        <Text style={[styles.assigneeOptionText, suggestionData.assignedToUserId === user?.id && styles.assigneeTextActive]}>Para ti</Text>
                                    </TouchableOpacity>

                                    {groupParticipants.length > 0 ? groupParticipants.filter(p => p.id !== user?.id).map((p) => (
                                        <TouchableOpacity
                                            key={p.id}
                                            style={[styles.assigneeOption, suggestionData.assignedToUserId === p.id && styles.assigneeOptionActive]}
                                            onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: p.id, counterpartyContactId: null })}
                                        >
                                            <View style={[styles.assigneeAvatar, { backgroundColor: avatarColor(p.email) }]}>
                                                <Text style={styles.assigneeAvatarText}>{p.full_name?.substring(0, 1).toUpperCase() || p.email[0].toUpperCase()}</Text>
                                            </View>
                                            <Text style={[styles.assigneeOptionText, suggestionData.assignedToUserId === p.id && styles.assigneeTextActive]} numberOfLines={1}>
                                                {p.full_name?.split(' ')[0] || p.email.split('@')[0]}
                                            </Text>
                                        </TouchableOpacity>
                                    )) : (
                                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, marginLeft: 10, alignSelf: 'center' }}>Cargando participantes...</Text>
                                    )}

                                    {/* Parte 12: contraparte externa sin cuenta en Ping (tabla contacts). */}
                                    {(myContacts || []).map((c: any) => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.assigneeOption, suggestionData.counterpartyContactId === c.id && styles.assigneeOptionActive]}
                                            onPress={() => onUpdateData({ ...suggestionData, counterpartyContactId: c.id, assignedToUserId: null })}
                                        >
                                            <View style={[styles.assigneeAvatar, { backgroundColor: colors.warningTint }]}>
                                                <Text style={styles.assigneeAvatarText}>{c.display_name?.substring(0, 1).toUpperCase() || '?'}</Text>
                                            </View>
                                            <Text style={[styles.assigneeOptionText, suggestionData.counterpartyContactId === c.id && styles.assigneeTextActive]} numberOfLines={1}>
                                                {c.display_name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}

                                    <TouchableOpacity
                                        style={styles.assigneeOption}
                                        onPress={handleCreateContact}
                                        disabled={isCreatingContact}
                                    >
                                        <View style={[styles.assigneeAvatar, { backgroundColor: colors.glassRaised }]}>
                                            <Ionicons name="person-add" size={20} color={colors.textFaint} />
                                        </View>
                                        <Text style={styles.assigneeOptionText}>Contacto{'\n'}nuevo</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>

                            <View style={styles.currentAssigneeBadge}>
                                <Ionicons name="checkmark-circle" size={16} color={colors.accentBright} />
                                <Text style={styles.currentAssigneeText}>Seleccionado: <Text style={{ fontFamily: fonts.bold }}>{assigneeName}</Text></Text>
                            </View>
                            </>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.acceptBtn, missingTitle && { opacity: 0.5 }, (!isCounterProposal && isGroup
                                ? (suggestionData.assignedToUserId === undefined && !suggestionData.counterpartyContactId && { opacity: 0.5 })
                                : (!isCounterProposal && !suggestionData.assignedToUserId && !suggestionData.counterpartyContactId && { opacity: 0.5 }))]}
                            onPress={onConfirm}
                            disabled={missingTitle || !isCounterProposal && (isGroup
                                ? (suggestionData.assignedToUserId === undefined && !suggestionData.counterpartyContactId)
                                : (!suggestionData.assignedToUserId && !suggestionData.counterpartyContactId))}
                        >
                            <LinearGradient
                                pointerEvents="none"
                                colors={gradients.accent}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <Text style={styles.acceptBtnText}>
                                {isCounterProposal ? 'Enviar nuevo horario' : isEditing ? 'Guardar cambios' : 'Crear'}
                            </Text>
                        </TouchableOpacity>

                        {isEditing && onCancel && !showCancelConfirmation && (
                            <TouchableOpacity
                                style={styles.cancelCommitmentBtn}
                                onPress={() => setShowCancelConfirmation(true)}
                                disabled={isCancelling || isSubmittingCancellation}
                            >
                                <Ionicons name="ban-outline" size={19} color={colors.danger} />
                                <Text style={styles.cancelCommitmentBtnText}>
                                    Cancelar {isMeeting ? 'reunión' : 'compromiso'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {isEditing && onCancel && showCancelConfirmation && (
                            <View style={styles.cancelConfirmation}>
                                <View style={styles.cancelConfirmationTitleRow}>
                                    <Ionicons name="warning-outline" size={20} color={colors.danger} />
                                    <Text style={styles.cancelConfirmationTitle}>Confirmar cancelación</Text>
                                </View>
                                <Text style={styles.cancelConfirmationText}>
                                    Se conservará el historial y las personas del chat verán que fue cancelada.
                                </Text>
                                <TextInput
                                    style={styles.cancelReasonInput}
                                    value={cancelReason}
                                    onChangeText={setCancelReason}
                                    placeholder="Motivo opcional, por ejemplo: se resolvió antes"
                                    placeholderTextColor={colors.textFaint}
                                    maxLength={500}
                                    multiline
                                    editable={!isCancelling && !isSubmittingCancellation}
                                />
                                <View style={styles.cancelConfirmationActions}>
                                    <TouchableOpacity
                                        style={styles.keepCommitmentBtn}
                                        onPress={() => {
                                            setShowCancelConfirmation(false);
                                            setCancelReason('');
                                        }}
                                        disabled={isCancelling || isSubmittingCancellation}
                                    >
                                        <Text style={styles.keepCommitmentBtnText}>Volver</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.confirmCancellationBtn}
                                        onPress={handleCancelCommitment}
                                        disabled={isCancelling || isSubmittingCancellation}
                                    >
                                        {(isCancelling || isSubmittingCancellation) ? (
                                            <ActivityIndicator size="small" color={colors.onAccent} />
                                        ) : (
                                            <Text style={styles.confirmCancellationBtnText}>Sí, cancelar</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    suggestionModal: {
        borderRadius: 24, 
        width: '100%', 
        padding: 24, 
        shadowColor: colors.ink, 
        shadowOpacity: 0.2, 
        shadowRadius: 10, 
        elevation: 5,
        maxHeight: '90%',
        ...sheetSurface,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
    },
    modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.accentBright },
    modalCloseBtn: { padding: 4 },
    modalScroll: {
        flexGrow: 0,
    },
    modalScrollContent: {
        paddingBottom: 20,
    },
    modalBody: { marginBottom: 12 },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    typeChip: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12, backgroundColor: colors.glassRaised,
    },
    typeChipActive: { backgroundColor: colors.accent },
    typeChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft },
    typeChipTextActive: { color: colors.onAccent },
    inputLabel: { fontSize: 12, fontFamily: fonts.bold, color: colors.textFaint, marginBottom: 8, textTransform: 'uppercase' },
    modalInput: { fontFamily: fonts.regular,
        backgroundColor: colors.glassRaised, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text, marginBottom: 16,
    },
    datePreview: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentTint, borderRadius: 12, padding: 12, gap: 10,
    },
    dateText: { fontSize: 14, fontFamily: fonts.medium, color: colors.accentBright },
    conflictBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.dangerTint,
        padding: 10,
        borderRadius: 12,
        gap: 8,
    },
    statusContainer: {
        minHeight: 40,
        justifyContent: 'center',
        marginVertical: 4,
    },
    checkingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 8,
    },
    checkingText: {
        fontSize: 12,
        color: colors.accentBright,
        fontFamily: fonts.medium,
    },
    assigneeSelectorContainer: { marginTop: 4, marginBottom: 16 },
    assigneeList: { paddingVertical: 4, gap: 12 },
    assigneeOption: { alignItems: 'center', width: 70, opacity: 0.6 },
    assigneeOptionActive: { opacity: 1 },
    assigneeAvatar: {
        width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6, borderWidth: 2, borderColor: 'transparent',
    },
    assigneeAvatarText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bold },
    assigneeOptionText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint, textAlign: 'center' },
    assigneeTextActive: { color: colors.accentBright, fontFamily: fonts.bold },
    currentAssigneeBadge: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentTint, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start', gap: 6,
    },
    currentAssigneeText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSoft },
    conflictText: {
        color: colors.danger,
        fontSize: 12,
        fontFamily: fonts.medium,
        marginLeft: 8,
        flex: 1,
        lineHeight: 16,
    },
    acceptBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center', overflow: 'hidden' },
    acceptBtnText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bold },
    cancelCommitmentBtn: {
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.dangerTint,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    cancelCommitmentBtnText: {
        color: colors.danger,
        fontSize: 15,
        fontFamily: fonts.bold,
    },
    cancelConfirmation: {
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.dangerTint,
        padding: 14,
    },
    cancelConfirmationTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cancelConfirmationTitle: {
        color: colors.danger,
        fontSize: 15,
        fontFamily: fonts.extrabold,
    },
    cancelConfirmationText: { fontFamily: fonts.regular,
        color: colors.danger,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    cancelReasonInput: { fontFamily: fonts.regular,
        minHeight: 64,
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.glassRaised,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: colors.text,
        fontSize: 14,
        textAlignVertical: 'top',
    },
    cancelConfirmationActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    keepCommitmentBtn: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: colors.glassRaised,
    },
    keepCommitmentBtnText: {
        color: colors.text,
        fontSize: 14,
        fontFamily: fonts.bold,
    },
    confirmCancellationBtn: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: colors.danger,
    },
    confirmCancellationBtnText: {
        color: colors.onAccent,
        fontSize: 14,
        fontFamily: fonts.extrabold,
    },
    pickerWrapper: {
        backgroundColor: colors.glassRaised,
        borderRadius: 16,
        padding: 8,
        marginTop: 8,
    },
    confirmPickerBtn: {
        backgroundColor: colors.accent,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    confirmPickerBtnText: {
        color: colors.onAccent,
        fontFamily: fonts.bold,
        fontSize: 14,
    }
});
