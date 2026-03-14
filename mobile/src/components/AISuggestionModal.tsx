import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { apiClient } from '../api/client';

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
    avatarColor
}) => {
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

    useEffect(() => {
        if (visible && suggestionData?.dueAt) {
            checkConflicts();
        } else {
            setConflicts([]);
        }
    }, [visible, suggestionData?.dueAt, suggestionData?.assignedToUserId]);

    const checkConflicts = async () => {
        try {
            setIsCheckingConflicts(true);
            const res = await apiClient.get(`/commitments/check-conflict?dueAt=${suggestionData.dueAt}`);
            setConflicts(res || []);
        } catch (err) {
            console.error('[AISuggestionModal] Conflict check failed:', err);
        } finally {
            setIsCheckingConflicts(false);
        }
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        if (event.type === 'dismissed') {
            setShowPicker(false);
            return;
        }

        if (selectedDate) {
            const currentSelected = new Date(suggestionData.dueAt);
            if (pickerMode === 'date') {
                currentSelected.setFullYear(selectedDate.getFullYear());
                currentSelected.setMonth(selectedDate.getMonth());
                currentSelected.setDate(selectedDate.getDate());
                
                if (Platform.OS === 'android') {
                    setShowPicker(false);
                    setTimeout(() => {
                        setPickerMode('time');
                        setShowPicker(true);
                    }, 100);
                } else {
                    onUpdateData({ ...suggestionData, dueAt: currentSelected.toISOString() });
                }
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
    const assigneeName = suggestionData.assignedToUserId === null
        ? 'Todos'
        : suggestionData.assignedToUserId === user?.id
            ? 'Para ti'
            : (currentAssignee?.full_name || 'Sin asignar');

    // Safe date parsing
    const dateObj = new Date(suggestionData.dueAt);
    const formattedDate = format(dateObj, "eeee, d 'de' MMM, HH:mm", { locale: es });

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.suggestionModal}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>✨ Agendar con AI</Text>
                        <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
                            <Ionicons name="close" size={24} color="#6b7280" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                        <Text style={styles.inputLabel}>TÍTULO DE LA {typeLabel}</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={suggestionData.title}
                            onChangeText={(t) => onUpdateData({ ...suggestionData, title: t })}
                            placeholder={`Escribe el nombre de la ${typeLabel.toLowerCase()}...`}
                        />

                        <Text style={styles.inputLabel}>FECHA Y HORA (Toca para cambiar)</Text>
                        <TouchableOpacity 
                            style={styles.datePreview} 
                            onPress={() => {
                                setPickerMode('date');
                                setShowPicker(true);
                            }}
                        >
                            <Ionicons name={isMeeting ? "calendar-outline" : "time-outline"} size={20} color={isMeeting ? "#8b5cf6" : "#6366f1"} />
                            <Text style={[styles.dateText, isMeeting && { color: '#8b5cf6' }]}>
                                {formattedDate}
                            </Text>
                            <Ionicons name="pencil" size={14} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                        </TouchableOpacity>

                        {showPicker && (
                            <DateTimePicker
                                value={new Date(suggestionData.dueAt)}
                                mode={pickerMode}
                                is24Hour={true}
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={onDateChange}
                                textColor="#1e1b4b"
                            />
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
                                    <Text style={styles.conflictText}>
                                        Conflicto: ya tienes {conflicts.length === 1 ? 'un compromiso' : 'compromisos'} a esta hora ({conflicts[0].title.substring(0, 20)}...)
                                    </Text>
                                </View>
                            )}
                        </View>

                        <Text style={styles.inputLabel}>RESPONSABLE</Text>
                        <View style={styles.assigneeSelectorContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assigneeList}>
                                {isGroup && (
                                    <TouchableOpacity
                                        style={[styles.assigneeOption, suggestionData.assignedToUserId === null && styles.assigneeOptionActive]}
                                        onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: null })}
                                    >
                                        <View style={[styles.assigneeAvatar, { backgroundColor: '#10b981' }]}>
                                            <Ionicons name="people" size={24} color="white" />
                                        </View>
                                        <Text style={[styles.assigneeOptionText, suggestionData.assignedToUserId === null && styles.assigneeTextActive]}>Todos</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={[styles.assigneeOption, suggestionData.assignedToUserId === user?.id && styles.assigneeOptionActive]}
                                    onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: user?.id })}
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
                                        onPress={() => onUpdateData({ ...suggestionData, assignedToUserId: p.id })}
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
                            </ScrollView>
                        </View>

                        <View style={styles.currentAssigneeBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={isMeeting ? "#8b5cf6" : "#6366f1"} />
                            <Text style={styles.currentAssigneeText}>Seleccionado: <Text style={{ fontWeight: '700' }}>{assigneeName}</Text></Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.acceptBtn, isMeeting && { backgroundColor: '#8b5cf6' }, (isGroup ? (suggestionData.assignedToUserId === undefined && { opacity: 0.5 }) : (!suggestionData.assignedToUserId && { opacity: 0.5 }))]}
                        onPress={onConfirm}
                        disabled={isGroup ? (suggestionData.assignedToUserId === undefined) : !suggestionData.assignedToUserId}
                    >
                        <Text style={styles.acceptBtnText}>¡Agendar {isMeeting ? 'Reunión' : 'Tarea'}!</Text>
                    </TouchableOpacity>
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
        backgroundColor: 'white', borderRadius: 24, width: '100%', padding: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b' },
    modalCloseBtn: { padding: 4 },
    modalBody: { marginBottom: 24 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' },
    modalInput: {
        backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16,
    },
    datePreview: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 12, padding: 12, gap: 10,
    },
    dateText: { fontSize: 14, fontWeight: '500', color: '#c2410c' },
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
    conflictBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fee2e2',
        padding: 10,
        borderRadius: 12,
        gap: 8,
    },
    conflictText: {
        fontSize: 12,
        color: '#b91c1c',
        fontWeight: '600',
        flex: 1,
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
    acceptBtn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    acceptBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
