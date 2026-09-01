import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { apiClient } from '../api/client';
import { useContacts, useCreateContact } from '../api/queries';
import { formatSuggestionDueAt } from '../utils/timeZone';

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
            'Nombre del contacto (sin cuenta en Ping):',
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
    const onDateChange = (event: any, selectedDate?: Date) => {
        if (event.type === 'dismissed') {
            setShowPicker(false);
            return;
        }

        if (selectedDate) {
            if (Platform.OS === 'ios') {
                // In iOS datetime mode, selectedDate has everything
                onUpdateData({ ...suggestionData, dueAt: selectedDate.toISOString() });
            } else {
                const currentSelected = new Date(suggestionData.dueAt);
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
        }
    };

    if (!suggestionData) return null;

    const isMeetingRaw = suggestionData.type === 'meeting';
    const isMeeting = isMeetingRaw || /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(suggestionData.title || '');
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

    // Safe date parsing
    const formattedDate = formatSuggestionDueAt(suggestionData.dueAt);

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.suggestionModal}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            {isCounterProposal
                                ? 'Sugerir otro horario'
                                : isEditing
                                    ? `✏️ Editar ${typeLabel}`
                                    : 'Agendar'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
                            <Ionicons name="close" size={24} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView 
                        style={styles.modalScroll} 
                        contentContainerStyle={styles.modalScrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.modalBody}>
                            {!isCounterProposal && (
                                <>
                                    <Text style={styles.inputLabel}>TÍTULO DE LA {typeLabel}</Text>
                                    <TextInput
                                        style={styles.modalInput}
                                        value={suggestionData.title}
                                        onChangeText={(t) => onUpdateData({ ...suggestionData, title: t })}
                                        placeholder={`Escribe el nombre de la ${typeLabel.toLowerCase()}...`}
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
                                <Ionicons name={isMeeting ? "calendar" : "list"} size={20} color={isMeeting ? "#8b5cf6" : "#6366f1"} />
                                <Text style={[styles.dateText, isMeeting && { color: '#8b5cf6' }]}>
                                    {formattedDate}
                                </Text>
                                <Ionicons name="pencil" size={14} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>

                            {showPicker && (
                                <View style={styles.pickerWrapper}>
                                    <DateTimePicker
                                        value={new Date(suggestionData.dueAt)}
                                        mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                                        is24Hour={true}
                                        display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                        onChange={(event, date) => {
                                            if (date) onDateChange(event, date);
                                        }}
                                        themeVariant="light"
                                        {...(Platform.OS === 'android' ? { textColor: '#1e1b4b' } : {})}
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
                                        <ActivityIndicator size="small" color="#6366f1" />
                                        <Text style={styles.checkingText}>Verificando conflictos...</Text>
                                    </View>
                                )}

                                {conflicts.length > 0 && !isCheckingConflicts && (
                                    <View style={styles.conflictBanner}>
                                        <Ionicons name="warning" size={16} color="#ef4444" />
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
                                            <View style={[styles.assigneeAvatar, { backgroundColor: '#10b981' }]}>
                                                <Ionicons name="people" size={24} color="white" />
                                            </View>
                                            <Text style={[styles.assigneeOptionText, suggestionData.assignedToUserId === null && !suggestionData.counterpartyContactId && styles.assigneeTextActive]}>Todos</Text>
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.assigneeOption, suggestionData.assignedToUserId === user?.id && styles.assigneeOptionActive]}
                                        onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: user?.id, counterpartyContactId: null })}
                                    >
                                        <View style={[styles.assigneeAvatar, { backgroundColor: isMeeting ? '#8b5cf6' : '#6366f1' }]}>
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
                                        <Text style={{ fontSize: 12, color: '#94a3b8', marginLeft: 10, alignSelf: 'center' }}>Cargando participantes...</Text>
                                    )}

                                    {/* Parte 12: contraparte externa sin cuenta en Ping (tabla contacts). */}
                                    {(myContacts || []).map((c: any) => (
                                        <TouchableOpacity
                                            key={c.id}
                                            style={[styles.assigneeOption, suggestionData.counterpartyContactId === c.id && styles.assigneeOptionActive]}
                                            onPress={() => onUpdateData({ ...suggestionData, counterpartyContactId: c.id, assignedToUserId: null })}
                                        >
                                            <View style={[styles.assigneeAvatar, { backgroundColor: '#f59e0b' }]}>
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
                                        <View style={[styles.assigneeAvatar, { backgroundColor: '#e2e8f0' }]}>
                                            <Ionicons name="person-add" size={20} color="#64748b" />
                                        </View>
                                        <Text style={styles.assigneeOptionText}>Contacto{'\n'}nuevo</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>

                            <View style={styles.currentAssigneeBadge}>
                                <Ionicons name="checkmark-circle" size={16} color={isMeeting ? "#8b5cf6" : "#6366f1"} />
                                <Text style={styles.currentAssigneeText}>Seleccionado: <Text style={{ fontWeight: '700' }}>{assigneeName}</Text></Text>
                            </View>
                            </>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.acceptBtn, isMeeting && { backgroundColor: '#8b5cf6' }, (!isCounterProposal && isGroup
                                ? (suggestionData.assignedToUserId === undefined && !suggestionData.counterpartyContactId && { opacity: 0.5 })
                                : (!isCounterProposal && !suggestionData.assignedToUserId && !suggestionData.counterpartyContactId && { opacity: 0.5 }))]}
                            onPress={onConfirm}
                            disabled={!isCounterProposal && (isGroup
                                ? (suggestionData.assignedToUserId === undefined && !suggestionData.counterpartyContactId)
                                : (!suggestionData.assignedToUserId && !suggestionData.counterpartyContactId))}
                        >
                            <Text style={styles.acceptBtnText}>
                                {isCounterProposal ? 'Enviar nuevo horario' : isEditing ? 'Guardar cambios' : 'Agendar'}
                            </Text>
                        </TouchableOpacity>

                        {isEditing && onCancel && !showCancelConfirmation && (
                            <TouchableOpacity
                                style={styles.cancelCommitmentBtn}
                                onPress={() => setShowCancelConfirmation(true)}
                                disabled={isCancelling || isSubmittingCancellation}
                            >
                                <Ionicons name="ban-outline" size={19} color="#dc2626" />
                                <Text style={styles.cancelCommitmentBtnText}>
                                    Cancelar {isMeeting ? 'reunión' : 'compromiso'}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {isEditing && onCancel && showCancelConfirmation && (
                            <View style={styles.cancelConfirmation}>
                                <View style={styles.cancelConfirmationTitleRow}>
                                    <Ionicons name="warning-outline" size={20} color="#b91c1c" />
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
                                    placeholderTextColor="#9ca3af"
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
                                            <ActivityIndicator size="small" color="white" />
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
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20,
    },
    suggestionModal: {
        backgroundColor: 'white', 
        borderRadius: 24, 
        width: '100%', 
        padding: 24, 
        shadowColor: '#000', 
        shadowOpacity: 0.2, 
        shadowRadius: 10, 
        elevation: 5,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b' },
    modalCloseBtn: { padding: 4 },
    modalScroll: {
        flexGrow: 0,
    },
    modalScrollContent: {
        paddingBottom: 20,
    },
    modalBody: { marginBottom: 12 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' },
    modalInput: {
        backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16,
    },
    datePreview: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 12, padding: 12, gap: 10,
    },
    dateText: { fontSize: 14, fontWeight: '500', color: '#c2410c' },
    conflictBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fee2e2',
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
        color: '#6366f1',
        fontWeight: '500',
    },
    assigneeSelectorContainer: { marginTop: 4, marginBottom: 16 },
    assigneeList: { paddingVertical: 4, gap: 12 },
    assigneeOption: { alignItems: 'center', width: 70, opacity: 0.6 },
    assigneeOptionActive: { opacity: 1 },
    assigneeAvatar: {
        width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6, borderWidth: 2, borderColor: 'transparent',
    },
    assigneeAvatarText: { color: 'white', fontSize: 16, fontWeight: '700' },
    assigneeOptionText: { fontSize: 11, color: '#6b7280', textAlign: 'center' },
    assigneeTextActive: { color: '#6366f1', fontWeight: '700' },
    currentAssigneeBadge: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f3ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start', gap: 6,
    },
    currentAssigneeText: { fontSize: 13, color: '#4b5563' },
    conflictText: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 8,
        flex: 1,
        lineHeight: 16,
    },
    acceptBtn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    acceptBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
    cancelCommitmentBtn: {
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: '#fff7f7',
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    cancelCommitmentBtnText: {
        color: '#dc2626',
        fontSize: 15,
        fontWeight: '700',
    },
    cancelConfirmation: {
        marginTop: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: '#fff7f7',
        padding: 14,
    },
    cancelConfirmationTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cancelConfirmationTitle: {
        color: '#991b1b',
        fontSize: 15,
        fontWeight: '800',
    },
    cancelConfirmationText: {
        color: '#7f1d1d',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    cancelReasonInput: {
        minHeight: 64,
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: 'white',
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#111827',
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
        borderColor: '#d1d5db',
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: 'white',
    },
    keepCommitmentBtnText: {
        color: '#374151',
        fontSize: 14,
        fontWeight: '700',
    },
    confirmCancellationBtn: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: '#dc2626',
    },
    confirmCancellationBtnText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
    },
    pickerWrapper: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        padding: 8,
        marginTop: 8,
    },
    confirmPickerBtn: {
        backgroundColor: '#6366f1',
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    confirmPickerBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    }
});
