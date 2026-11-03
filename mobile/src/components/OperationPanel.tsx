import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { useAuth } from '../context/AuthContext';
import { getAgreementParticipantName, getAgreementResponseLabel } from '../utils/agreement';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';

interface OperationPanelProps {
    loading?: boolean;
    activeCommitment?: any;
    pinnedMessage?: any;
    checklists?: any[];
    checklist?: any;
    openTasksCount?: number;
    onOpenPinnedMessage: (messageId: string) => void;
    onClearPinnedMessage: () => void;
    onToggleChecklistItem: (itemId: string, result: 'good' | 'regular' | 'bad' | 'na' | 'high' | 'medium' | 'low' | 'yes' | 'no' | null) => void;
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
                                <Ionicons name="close" size={24} color={colors.textFaint} />
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
                                    placeholderTextColor={colors.textFaint}
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
    const accepted = normalizeCommitmentStatus(commitment?.status) === 'accepted';

    if (completed) return { key: 'completed', label: 'Terminado', color: colors.success, bg: colors.successTint };
    if (arrived) return { key: 'arrived', label: 'En sitio', color: colors.accentBright, bg: colors.accentTint };
    if (acknowledged) return { key: 'started', label: 'Iniciada', color: colors.accentBright, bg: colors.accentTint };
    if (accepted) return { key: 'ready', label: 'Lista', color: colors.success, bg: colors.successTint };
    return { key: 'pending', label: 'Pendiente', color: colors.textSoft, bg: colors.glassRaised };
}

function getCommitmentMeta(commitment?: any) {
    if (!commitment) return '';

    const due = commitment.due_at
        ? format(new Date(commitment.due_at), 'dd/MM · HH:mm', { locale: es })
        : null;
    const responsible = commitment.assigned_to_user_id
        ? (commitment.assignee?.full_name || 'Responsable')
        : 'Todos';

    return [due, responsible].filter(Boolean).join(' · ');
}

function ChecklistSheet({
    visible,
    checklists,
    checklist,
    selectedChecklistId,
    onSelectChecklist,
    onClose,
    onToggleChecklistItem,
}: any) {
    const resultOptionsByType = {
        condition: [
            { key: 'good', label: 'Bueno', color: colors.success, bg: colors.successTint },
            { key: 'regular', label: 'Regular', color: colors.warning, bg: colors.warningTint },
            { key: 'bad', label: 'Malo', color: colors.danger, bg: colors.dangerTint },
            { key: 'na', label: 'N/A', color: colors.textSoft, bg: colors.glassRaised },
        ],
        severity: [
            { key: 'high', label: 'Alto', color: colors.danger, bg: colors.dangerTint },
            { key: 'medium', label: 'Medio', color: colors.warning, bg: colors.warningTint },
            { key: 'low', label: 'Bajo', color: colors.success, bg: colors.successTint },
            { key: 'na', label: 'N/A', color: colors.textSoft, bg: colors.glassRaised },
        ],
        yes_no: [
            { key: 'yes', label: 'Si', color: colors.success, bg: colors.successTint },
            { key: 'no', label: 'No', color: colors.danger, bg: colors.dangerTint },
            { key: 'na', label: 'N/A', color: colors.textSoft, bg: colors.glassRaised },
        ],
        text: [],
    } as const;

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
                                <Ionicons name="close" size={24} color={colors.textFaint} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                            {checklists?.length ? (
                                <View style={styles.sheetSection}>
                                    <View style={styles.sheetSectionHeader}>
                                        <Text style={styles.sheetSectionTitle}>Plantillas</Text>
                                    </View>
                                    <View style={styles.templateRow}>
                                        {checklists.map((list: any) => (
                                            <TouchableOpacity
                                                key={list.id}
                                                style={[styles.templateChip, selectedChecklistId === list.id && styles.templateChipActive]}
                                                onPress={() => onSelectChecklist(list.id)}
                                            >
                                                <Text style={[styles.templateChipText, selectedChecklistId === list.id && styles.templateChipTextActive]} numberOfLines={1}>
                                                    {list.title}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            ) : null}

                            {checklist?.run?.items?.length ? (
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sheetSectionTitle}>Checklist de hoy</Text>

                                    {checklist.run.items.map((item: any) => (
                                        <View key={item.id} style={styles.sheetCheckCard}>
                                            <View style={styles.sheetCheckRow}>
                                                <Ionicons
                                                    name={item.result ? 'checkmark-circle' : 'ellipse-outline'}
                                                    size={20}
                                                    color={item.result ? colors.success : colors.textFaint}
                                                />
                                                <Text style={[styles.sheetCheckText, item.result && styles.sheetCheckTextDone]}>{item.label}</Text>
                                            </View>
                                            {item.response_type === 'text' ? (
                                                <Text style={styles.sheetHintText}>Este item usa texto libre. Lo dejamos preparado para una siguiente iteración.</Text>
                                            ) : (
                                                <View style={styles.sheetResultRow}>
                                                    {(resultOptionsByType[item.response_type as keyof typeof resultOptionsByType] || resultOptionsByType.condition).map((option) => (
                                                        <TouchableOpacity
                                                            key={option.key}
                                                            style={[
                                                                styles.resultChip,
                                                                item.result === option.key && { backgroundColor: option.bg, borderColor: option.bg },
                                                            ]}
                                                            onPress={() => onToggleChecklistItem(item.id, item.result === option.key ? null : option.key)}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.resultChipText,
                                                                    item.result === option.key && { color: option.color },
                                                                ]}
                                                            >
                                                                {option.label}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}
                                            {item.checked_at ? (
                                                <Text style={styles.sheetAuditText}>
                                                    {item.profiles?.full_name || item.profiles?.email?.split('@')[0] || 'Alguien'} · {formatShortDate(item.checked_at)}
                                                </Text>
                                            ) : null}
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sheetSectionTitle}>Checklist</Text>
                                    <Text style={styles.sheetHintText}>Este grupo todavía no tiene una plantilla disponible. Pide a un administrador que la cree desde la información del grupo.</Text>
                                </View>
                            )}
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
    checklists = [],
    checklist,
    openTasksCount = 0,
    onOpenPinnedMessage,
    onClearPinnedMessage,
    onToggleChecklistItem,
    onCommitmentAction,
    onClearActiveCommitment,
    pendingAction = null,
    feedbackMessage = null,
}: OperationPanelProps) {
    const { user } = useAuth();
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [completionNote, setCompletionNote] = useState('');
    const [completionOutcome, setCompletionOutcome] = useState<'resolved' | 'pending_followup' | 'needs_review'>('resolved');
    const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(checklist?.id || null);

    const state = useMemo(() => getOperationState(activeCommitment), [activeCommitment]);
    const selectedChecklist = useMemo(() => {
        return checklists.find((item: any) => item.id === selectedChecklistId) || checklist || checklists[0] || null;
    }, [checklists, selectedChecklistId, checklist]);
    const primaryActionLabel = state.key === 'ready'
        ? 'Dar inicio'
        : pendingAction === 'acknowledged'
            ? 'Marcando...'
            : 'Iniciada';
    const checklistProgress = useMemo(() => {
        const items = selectedChecklist?.run?.items || [];
        if (!items.length) return null;
        const done = items.filter((item: any) => item.is_checked).length;
        return `${done}/${items.length}`;
    }, [selectedChecklist]);

    useEffect(() => {
        if (checklists.length > 0 && !selectedChecklistId) {
            setSelectedChecklistId(checklists[0].id);
        }
    }, [checklists, selectedChecklistId]);

    useEffect(() => {
        if (pendingAction || feedbackMessage) {
            setIsExpanded(true);
        }
    }, [pendingAction, feedbackMessage]);

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
                {loading ? <ActivityIndicator size="small" color={colors.accentBright} /> : null}

                <View style={styles.heroCard}>
                    <View style={styles.heroHeader}>
                        <Text style={styles.eyebrow}>{activeCommitment ? 'Operacion activa' : 'Modo operacion'}</Text>
                        <View style={styles.headerActions}>
                            <TouchableOpacity style={styles.expandButton} onPress={() => setIsExpanded((value) => !value)}>
                                <Text style={styles.expandButtonText}>{isExpanded ? 'Ocultar' : 'Ver operacion'}</Text>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accentBright} />
                            </TouchableOpacity>
                            {activeCommitment ? (
                                <TouchableOpacity style={styles.headerAction} onPress={onClearActiveCommitment}>
                                    <Ionicons name="close-circle-outline" size={18} color={colors.textFaint} />
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

                                    {Array.isArray(activeCommitment.agreement_responses) && activeCommitment.agreement_responses.length > 0 ? (
                                        <View style={styles.participantsSection}>
                                            <Text style={styles.participantsTitle}>Personas involucradas</Text>
                                            {activeCommitment.agreement_responses.map((response: any) => (
                                                <View key={response.participant_user_id} style={styles.participantRow}>
                                                    <Text style={styles.participantName}>
                                                        {getAgreementParticipantName(response, user?.id)}
                                                    </Text>
                                                    <Text style={[
                                                        styles.participantStatus,
                                                        response.status === 'rejected' && styles.participantStatusRejected,
                                                        response.status === 'pending' && styles.participantStatusPending,
                                                    ]}>
                                                        {getAgreementResponseLabel(response.status)}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : null}

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
                                            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
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
                                <Text style={styles.helperTextCompact}>Ver operacion para revisar la tarea activa y su checklist.</Text>
                            )}
                        </>
                    )}

                    {isExpanded && pinnedMessage ? (
                        <View style={styles.pinnedRow}>
                            <TouchableOpacity style={styles.pinnedPreview} activeOpacity={0.8} onPress={() => onOpenPinnedMessage(pinnedMessage.id)}>
                                <Ionicons name="pin" size={14} color={colors.accentBright} />
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
                            <Text style={styles.quickActionSubtitle}>{checklists.length > 1 ? `${checklists.length} listas · ${checklistProgress || '0/0'}` : (checklistProgress || 'Crear')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
            </View>

            <ChecklistSheet
                visible={showChecklistModal}
                checklists={checklists}
                checklist={selectedChecklist}
                selectedChecklistId={selectedChecklistId}
                onSelectChecklist={(id: string) => {
                    setSelectedChecklistId(id);
                }}
                onClose={() => setShowChecklistModal(false)}
                onToggleChecklistItem={onToggleChecklistItem}
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
        backgroundColor: colors.bubbleThem,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.accent,
        padding: 12,
        gap: 8,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
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
        fontFamily: fonts.extrabold,
        color: colors.accent,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        backgroundColor: colors.accentTint,
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
        fontFamily: fonts.bold,
        color: colors.accent,
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
        fontFamily: fonts.bold,
        color: colors.text,
    },
    helperText: { fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 17,
        color: colors.textSoft,
    },
    helperTextCompact: { fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 16,
        color: colors.textSoft,
    },
    commitmentMeta: { fontFamily: fonts.regular,
        fontSize: 13,
        color: colors.textSoft,
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
        fontFamily: fonts.bold,
    },
    participantsSection: {
        gap: 6,
        padding: 10,
        borderRadius: 12,
        backgroundColor: colors.bubbleThem,
        borderWidth: 1,
        borderColor: colors.separator,
    },
    participantsTitle: {
        fontSize: 11,
        fontFamily: fonts.extrabold,
        textTransform: 'uppercase',
        color: colors.textFaint,
    },
    participantRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    participantName: {
        flex: 1,
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.text,
    },
    participantStatus: {
        fontSize: 11,
        fontFamily: fonts.extrabold,
        color: colors.success,
    },
    participantStatusRejected: {
        color: colors.danger,
    },
    participantStatusPending: {
        color: colors.warning,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        backgroundColor: colors.bubbleThem,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.accentTint,
    },
    actionButtonPrimary: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    actionButtonText: {
        fontSize: 13,
        fontFamily: fonts.bold,
        color: colors.text,
    },
    actionButtonTextPrimary: {
        color: colors.onAccent,
    },
    feedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    feedbackText: {
        fontSize: 12,
        color: colors.success,
        fontFamily: fonts.semibold,
    },
    pinnedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: colors.separator,
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
        color: colors.text,
        fontFamily: fonts.semibold,
    },
    pinnedAction: {
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.accent,
    },
    quickActionsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    quickAction: {
        flex: 1,
        backgroundColor: colors.bubbleThem,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.accentTint,
    },
    quickActionTitle: {
        fontSize: 12,
        fontFamily: fonts.extrabold,
        color: colors.text,
        marginBottom: 3,
    },
    quickActionSubtitle: { fontFamily: fonts.regular,
        fontSize: 12,
        color: colors.textSoft,
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
        backgroundColor: colors.glassRaised,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    outcomeChipActive: {
        backgroundColor: colors.accentTint,
        borderColor: colors.accent,
    },
    outcomeChipText: {
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.textSoft,
    },
    outcomeChipTextActive: {
        color: colors.accentBright,
    },
    templateRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    templateChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: colors.glassRaised,
        borderWidth: 1,
        borderColor: colors.accent,
        maxWidth: '100%',
    },
    templateChipActive: {
        backgroundColor: colors.accentTint,
        borderColor: colors.accent,
    },
    templateChipText: {
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.textSoft,
    },
    templateChipTextActive: {
        color: colors.accentBright,
    },
    modalRoot: {
        flex: 1,
        backgroundColor: colors.scrim,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFill,
    },
    sheetHost: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: colors.surfaceSolid,
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
        borderBottomColor: colors.separator,
    },
    sheetTitle: {
        fontSize: 18,
        fontFamily: fonts.bold,
        color: colors.text,
    },
    sheetContent: {
        padding: 20,
        gap: 18,
        paddingBottom: 220,
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
        fontFamily: fonts.bold,
        color: colors.text,
    },
    sheetHintText: { fontFamily: fonts.regular,
        fontSize: 13,
        lineHeight: 19,
        color: colors.textSoft,
    },
    sheetLink: {
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.accent,
    },
    sheetCheckCard: {
        backgroundColor: colors.glassRaised,
        borderRadius: 14,
        padding: 12,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    sheetCheckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sheetCheckText: { fontFamily: fonts.regular,
        flex: 1,
        fontSize: 15,
        color: colors.text,
    },
    sheetCheckTextDone: {
        color: colors.text,
        fontFamily: fonts.bold,
    },
    sheetResultRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    resultChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: colors.surfaceSolid,
        borderWidth: 1,
        borderColor: colors.accentTint,
    },
    resultChipText: {
        fontSize: 12,
        fontFamily: fonts.bold,
        color: colors.textSoft,
    },
    sheetAuditText: { fontFamily: fonts.regular,
        fontSize: 11,
        color: colors.textFaint,
    },
    latestBody: { fontFamily: fonts.regular,
        fontSize: 14,
        lineHeight: 20,
        color: colors.text,
    },
    latestMeta: { fontFamily: fonts.regular,
        fontSize: 12,
        color: colors.textFaint,
    },
    input: { fontFamily: fonts.regular,
        backgroundColor: colors.glassRaised,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    textArea: {
        minHeight: 140,
    },
    primaryButton: {
        backgroundColor: colors.accent,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: colors.onAccent,
        fontFamily: fonts.bold,
    },
});
