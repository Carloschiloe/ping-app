import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface OperationPanelProps {
    loading?: boolean;
    activeCommitment?: any;
    pinnedMessage?: any;
    checklist?: any;
    latestLocation?: any;
    latestShiftReport?: any;
    openTasksCount?: number;
    onOpenPinnedMessage: (messageId: string) => void;
    onClearPinnedMessage: () => void;
    onSaveChecklist: (data: { title: string; items: string[] }) => Promise<any> | void;
    onToggleChecklistItem: (itemId: string, isChecked: boolean) => void;
    onCreateShiftReport: (body: string) => Promise<any> | void;
    onShareLocation: () => Promise<any> | void;
    onCommitmentAction: (payload: {
        action: 'acknowledged' | 'arrived' | 'completed';
        completionNote?: string | null;
        completionOutcome?: 'resolved' | 'pending_followup' | 'needs_review' | null;
    }) => void;
    onClearActiveCommitment: () => void;
    pendingAction?: 'acknowledged' | 'arrived' | 'completed' | null;
    feedbackMessage?: string | null;
}

function CompletionSheet({
    visible,
    note,
    setNote,
    outcome,
    setOutcome,
    onClose,
    onConfirm,
}: any) {
    const outcomes = [
        { key: 'resolved', label: 'Resuelto' },
        { key: 'pending_followup', label: 'Queda pendiente' },
        { key: 'needs_review', label: 'Requiere revision' },
    ];

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <SafeAreaView style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                    style={styles.sheetHost}
                >
                    <View style={styles.sheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Cerrar tarea</Text>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                            <View style={styles.sheetSection}>
                                <Text style={styles.sheetSectionTitle}>Resultado</Text>
                                <View style={styles.outcomeRow}>
                                    {outcomes.map((item) => (
                                        <TouchableOpacity
                                            key={item.key}
                                            style={[styles.outcomeChip, outcome === item.key && styles.outcomeChipActive]}
                                            onPress={() => setOutcome(item.key)}
                                        >
                                            <Text style={[styles.outcomeChipText, outcome === item.key && styles.outcomeChipTextActive]}>{item.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.sheetSection}>
                                <Text style={styles.sheetSectionTitle}>Observacion final</Text>
                                <TextInput
                                    value={note}
                                    onChangeText={setNote}
                                    placeholder="Que paso al cerrar la tarea"
                                    style={[styles.input, styles.textArea]}
                                    placeholderTextColor="#94a3b8"
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>

                            <TouchableOpacity style={styles.primaryButton} onPress={onConfirm}>
                                <Text style={styles.primaryButtonText}>Confirmar cierre</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

function formatShortDate(iso?: string | null) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getOperationState(commitment?: any) {
    const operational = commitment?.meta?.operational || {};
    const completed = !!operational.completed_at || commitment?.status === 'completed';
    const arrived = !!operational.arrived_at;
    const acknowledged = !!operational.acknowledged_at;
    const accepted = commitment?.status === 'accepted' || commitment?.status === 'in_progress';

    if (completed) return { key: 'completed', label: 'Terminado', color: '#166534', bg: '#dcfce7' };
    if (arrived) return { key: 'arrived', label: 'En sitio', color: '#1d4ed8', bg: '#dbeafe' };
    if (acknowledged) return { key: 'started', label: 'Iniciada', color: '#7c3aed', bg: '#ede9fe' };
    if (accepted) return { key: 'ready', label: 'Lista', color: '#0f766e', bg: '#ccfbf1' };
    return { key: 'pending', label: 'Pendiente', color: '#475569', bg: '#e2e8f0' };
}

function getCommitmentMeta(commitment?: any) {
    if (!commitment) return '';

    const due = commitment.due_at
        ? format(new Date(commitment.due_at), 'HH:mm', { locale: es })
        : null;
    const responsible = commitment.assigned_to_user_id
        ? (commitment.assignee?.full_name || 'Responsable')
        : 'Todos';

    return [due, responsible].filter(Boolean).join(' · ');
}

function ChecklistSheet({
    visible,
    checklist,
    checklistTitle,
    checklistItemsText,
    setChecklistTitle,
    setChecklistItemsText,
    onClose,
    onSave,
    onToggleChecklistItem,
}: any) {
    const [isEditingTemplate, setIsEditingTemplate] = useState(!checklist);

    useEffect(() => {
        setIsEditingTemplate(!checklist);
    }, [checklist, visible]);

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <SafeAreaView style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                    style={styles.sheetHost}
                >
                    <View style={styles.sheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Checklist</Text>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                            {checklist?.run?.items?.length ? (
                                <View style={styles.sheetSection}>
                                    <View style={styles.sheetSectionHeader}>
                                        <Text style={styles.sheetSectionTitle}>Checklist de hoy</Text>
                                        <TouchableOpacity onPress={() => setIsEditingTemplate((value) => !value)}>
                                            <Text style={styles.sheetLink}>{isEditingTemplate ? 'Cerrar edición' : 'Editar lista'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {checklist.run.items.map((item: any) => (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={styles.sheetCheckRow}
                                            activeOpacity={0.8}
                                            onPress={() => onToggleChecklistItem(item.id, !item.is_checked)}
                                        >
                                            <Ionicons
                                                name={item.is_checked ? 'checkmark-circle' : 'ellipse-outline'}
                                                size={20}
                                                color={item.is_checked ? '#16a34a' : '#64748b'}
                                            />
                                            <Text style={[styles.sheetCheckText, item.is_checked && styles.sheetCheckTextDone]}>{item.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : null}

                            {isEditingTemplate ? (
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sheetSectionTitle}>{checklist ? 'Actualizar plantilla' : 'Crear checklist'}</Text>
                                    <TextInput
                                        value={checklistTitle}
                                        onChangeText={setChecklistTitle}
                                        placeholder="Titulo"
                                        style={styles.input}
                                        placeholderTextColor="#94a3b8"
                                    />
                                    <TextInput
                                        value={checklistItemsText}
                                        onChangeText={setChecklistItemsText}
                                        placeholder="Un item por linea"
                                        style={[styles.input, styles.textArea]}
                                        placeholderTextColor="#94a3b8"
                                        multiline
                                        textAlignVertical="top"
                                    />
                                    <TouchableOpacity style={styles.primaryButton} onPress={onSave}>
                                        <Text style={styles.primaryButtonText}>Guardar checklist</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

function ShiftSheet({ visible, latestShiftReport, shiftBody, setShiftBody, onClose, onSave }: any) {
    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <SafeAreaView style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                    style={styles.sheetHost}
                >
                    <View style={styles.sheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Registro</Text>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                            {latestShiftReport?.body ? (
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sheetSectionTitle}>Ultimo registro</Text>
                                    <Text style={styles.latestBody}>{latestShiftReport.body}</Text>
                                    <Text style={styles.latestMeta}>{formatShortDate(latestShiftReport.created_at)}</Text>
                                </View>
                            ) : null}

                            <View style={styles.sheetSection}>
                                <Text style={styles.sheetSectionTitle}>Registrar ahora</Text>
                                <TextInput
                                    value={shiftBody}
                                    onChangeText={setShiftBody}
                                    placeholder="Que paso, que se hizo o que debe quedar registrado"
                                    style={[styles.input, styles.textArea]}
                                    placeholderTextColor="#94a3b8"
                                    multiline
                                    textAlignVertical="top"
                                />
                                <TouchableOpacity style={styles.primaryButton} onPress={onSave}>
                                    <Text style={styles.primaryButtonText}>Guardar resumen</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

export function OperationPanel({
    loading,
    activeCommitment,
    pinnedMessage,
    checklist,
    latestLocation,
    latestShiftReport,
    openTasksCount = 0,
    onOpenPinnedMessage,
    onClearPinnedMessage,
    onSaveChecklist,
    onToggleChecklistItem,
    onCreateShiftReport,
    onShareLocation,
    onCommitmentAction,
    onClearActiveCommitment,
    pendingAction = null,
    feedbackMessage = null,
}: OperationPanelProps) {
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [checklistTitle, setChecklistTitle] = useState(checklist?.title || 'Checklist diario');
    const [checklistItemsText, setChecklistItemsText] = useState('');
    const [shiftBody, setShiftBody] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [completionNote, setCompletionNote] = useState('');
    const [completionOutcome, setCompletionOutcome] = useState<'resolved' | 'pending_followup' | 'needs_review'>('resolved');

    const state = useMemo(() => getOperationState(activeCommitment), [activeCommitment]);
    const primaryActionLabel = state.key === 'ready'
        ? 'Dar inicio'
        : pendingAction === 'acknowledged'
            ? 'Marcando...'
            : 'Iniciada';
    const checklistProgress = useMemo(() => {
        const items = checklist?.run?.items || [];
        if (!items.length) return null;
        const done = items.filter((item: any) => item.is_checked).length;
        return `${done}/${items.length}`;
    }, [checklist]);

    useEffect(() => {
        if (!checklist) {
            setChecklistTitle('Checklist diario');
            setChecklistItemsText('');
            return;
        }

        setChecklistTitle(checklist.title || 'Checklist diario');
        setChecklistItemsText((checklist.run?.items || []).map((item: any) => item.label).join('\n'));
    }, [checklist]);

    useEffect(() => {
        if (pendingAction || feedbackMessage) {
            setIsExpanded(true);
        }
    }, [pendingAction, feedbackMessage]);

    const saveChecklist = async () => {
        const items = checklistItemsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);

        if (!items.length) return;

        await onSaveChecklist({
            title: checklistTitle.trim() || 'Checklist diario',
            items,
        });
        setShowChecklistModal(false);
    };

    const saveShift = async () => {
        if (!shiftBody.trim()) return;
        await onCreateShiftReport(shiftBody.trim());
        setShiftBody('');
        setShowShiftModal(false);
    };

    const handleConfirmCompletion = () => {
        onCommitmentAction({
            action: 'completed',
            completionNote: completionNote.trim() || null,
            completionOutcome,
        });
        setCompletionNote('');
        setCompletionOutcome('resolved');
        setShowCompletionModal(false);
    };

    return (
        <>
            <View style={styles.panel}>
                {loading ? <ActivityIndicator size="small" color="#2563eb" /> : null}

                <View style={styles.heroCard}>
                    <View style={styles.heroHeader}>
                        <Text style={styles.eyebrow}>{activeCommitment ? 'Operacion activa' : 'Modo operacion'}</Text>
                        <View style={styles.headerActions}>
                            <TouchableOpacity style={styles.expandButton} onPress={() => setIsExpanded((value) => !value)}>
                                <Text style={styles.expandButtonText}>{isExpanded ? 'Ocultar' : 'Ver operacion'}</Text>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#2563eb" />
                            </TouchableOpacity>
                            {activeCommitment ? (
                                <TouchableOpacity style={styles.headerAction} onPress={onClearActiveCommitment}>
                                    <Ionicons name="close-circle-outline" size={18} color="#64748b" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    {activeCommitment ? (
                        <>
                            <View style={styles.heroCompactRow}>
                                <View style={styles.heroTextWrap}>
                                    <Text style={styles.heroTitle} numberOfLines={1}>{activeCommitment.title}</Text>
                                    <Text style={styles.commitmentMeta} numberOfLines={1}>{getCommitmentMeta(activeCommitment)}</Text>
                                </View>
                                <View style={[styles.statePill, { backgroundColor: state.bg }]}> 
                                    <Text style={[styles.statePillText, { color: state.color }]}>{state.label}</Text>
                                </View>
                            </View>

                            {isExpanded ? (
                                <>
                                    <Text style={styles.helperText}>Aqui marcas el avance real. La tarjeta del chat queda como respaldo y coordinacion.</Text>

                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity
                                            style={styles.actionButton}
                                            onPress={() => onCommitmentAction({ action: 'acknowledged' })}
                                            disabled={!!pendingAction || state.key !== 'ready'}
                                        >
                                            <Text style={styles.actionButtonText}>{primaryActionLabel}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.actionButton}
                                            onPress={() => onCommitmentAction({ action: 'arrived' })}
                                            disabled={!!pendingAction || !['started', 'arrived'].includes(state.key)}
                                        >
                                            <Text style={styles.actionButtonText}>{pendingAction === 'arrived' ? 'Marcando...' : 'Llegue'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.actionButtonPrimary]}
                                            onPress={() => setShowCompletionModal(true)}
                                            disabled={!!pendingAction || !['started', 'arrived'].includes(state.key)}
                                        >
                                            <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>{pendingAction === 'completed' ? 'Marcando...' : 'Terminado'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {feedbackMessage ? (
                                        <View style={styles.feedbackRow}>
                                            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                                            <Text style={styles.feedbackText}>{feedbackMessage}</Text>
                                        </View>
                                    ) : null}
                                </>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Text style={styles.heroTitle}>Sin actividad activa</Text>
                            {isExpanded ? (
                                <Text style={styles.helperText}>
                                    {openTasksCount > 0
                                        ? 'Elige una tarea del chat y marcala como activa desde su menu.'
                                        : 'Crea o agenda una tarea para usar este modo sin enredar el chat.'}
                                </Text>
                            ) : (
                                <Text style={styles.helperTextCompact}>Ver operacion para checklist, ubicacion y registro.</Text>
                            )}
                        </>
                    )}

                    {isExpanded && pinnedMessage ? (
                        <View style={styles.pinnedRow}>
                            <TouchableOpacity style={styles.pinnedPreview} activeOpacity={0.8} onPress={() => onOpenPinnedMessage(pinnedMessage.id)}>
                                <Ionicons name="pin" size={14} color="#2563eb" />
                                <Text style={styles.pinnedText} numberOfLines={1}>{pinnedMessage.text}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClearPinnedMessage}>
                                <Text style={styles.pinnedAction}>Quitar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>

                {isExpanded ? (
                    <View style={styles.quickActionsRow}>
                        <TouchableOpacity style={styles.quickAction} onPress={() => setShowChecklistModal(true)} activeOpacity={0.85}>
                            <Text style={styles.quickActionTitle}>Checklist</Text>
                            <Text style={styles.quickActionSubtitle}>{checklistProgress || 'Crear'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickAction} onPress={onShareLocation} activeOpacity={0.85}>
                            <Text style={styles.quickActionTitle}>Ubicacion</Text>
                            <Text style={styles.quickActionSubtitle} numberOfLines={1}>
                                {latestLocation?.meta?.location?.label || 'Compartir'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.quickAction} onPress={() => setShowShiftModal(true)} activeOpacity={0.85}>
                            <Text style={styles.quickActionTitle}>Registro</Text>
                            <Text style={styles.quickActionSubtitle} numberOfLines={1}>
                                {latestShiftReport?.created_at ? formatShortDate(latestShiftReport.created_at) : 'Registrar'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
            </View>

            <ChecklistSheet
                visible={showChecklistModal}
                checklist={checklist}
                checklistTitle={checklistTitle}
                checklistItemsText={checklistItemsText}
                setChecklistTitle={setChecklistTitle}
                setChecklistItemsText={setChecklistItemsText}
                onClose={() => setShowChecklistModal(false)}
                onSave={saveChecklist}
                onToggleChecklistItem={onToggleChecklistItem}
            />

            <ShiftSheet
                visible={showShiftModal}
                latestShiftReport={latestShiftReport}
                shiftBody={shiftBody}
                setShiftBody={setShiftBody}
                onClose={() => setShowShiftModal(false)}
                onSave={saveShift}
            />

            <CompletionSheet
                visible={showCompletionModal}
                note={completionNote}
                setNote={setCompletionNote}
                outcome={completionOutcome}
                setOutcome={setCompletionOutcome}
                onClose={() => setShowCompletionModal(false)}
                onConfirm={handleConfirmCompletion}
            />
        </>
    );
}

const styles = StyleSheet.create({
    panel: {
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 6,
    },
    heroCard: {
        backgroundColor: '#eef6ff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#bfdbfe',
        padding: 12,
        gap: 8,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 2,
    },
    heroHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    eyebrow: {
        fontSize: 11,
        fontWeight: '800',
        color: '#1d4ed8',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        backgroundColor: '#dbeafe',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
    },
    expandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 2,
    },
    expandButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    headerAction: {
        padding: 2,
    },
    heroCompactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    heroTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    heroTitle: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '700',
        color: '#172554',
    },
    helperText: {
        fontSize: 12,
        lineHeight: 17,
        color: '#64748b',
    },
    helperTextCompact: {
        fontSize: 12,
        lineHeight: 16,
        color: '#64748b',
    },
    commitmentMeta: {
        fontSize: 13,
        color: '#475569',
        marginTop: 1,
    },
    stateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statePill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    statePillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    actionButtonPrimary: {
        backgroundColor: '#dbeafe',
        borderColor: '#93c5fd',
    },
    actionButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1e293b',
    },
    actionButtonTextPrimary: {
        color: '#1d4ed8',
    },
    feedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    feedbackText: {
        fontSize: 12,
        color: '#166534',
        fontWeight: '600',
    },
    pinnedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#eef2f7',
    },
    pinnedPreview: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pinnedText: {
        flex: 1,
        fontSize: 13,
        color: '#334155',
        fontWeight: '600',
    },
    pinnedAction: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    quickActionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    quickAction: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    quickActionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1e3a5f',
        marginBottom: 3,
    },
    quickActionSubtitle: {
        fontSize: 12,
        color: '#64748b',
    },
    outcomeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    outcomeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    outcomeChipActive: {
        backgroundColor: '#dbeafe',
        borderColor: '#93c5fd',
    },
    outcomeChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    outcomeChipTextActive: {
        color: '#1d4ed8',
    },
    modalRoot: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.35)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    sheetHost: {
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '82%',
        minHeight: 320,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eef2f7',
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    sheetContent: {
        padding: 20,
        gap: 18,
        paddingBottom: 34,
    },
    sheetSection: {
        gap: 12,
    },
    sheetSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sheetSectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
    },
    sheetLink: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    sheetCheckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 4,
    },
    sheetCheckText: {
        flex: 1,
        fontSize: 15,
        color: '#0f172a',
    },
    sheetCheckTextDone: {
        textDecorationLine: 'line-through',
        color: '#64748b',
    },
    latestBody: {
        fontSize: 14,
        lineHeight: 20,
        color: '#0f172a',
    },
    latestMeta: {
        fontSize: 12,
        color: '#64748b',
    },
    input: {
        backgroundColor: '#f8fafc',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#0f172a',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    textArea: {
        minHeight: 140,
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '700',
    },
});
