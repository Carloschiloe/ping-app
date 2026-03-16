import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface OperationPanelProps {
    loading?: boolean;
    pinnedMessage?: any;
    checklist?: any;
    latestLocation?: any;
    latestShiftReport?: any;
    activeCommitment?: any;
    onOpenPinnedMessage: (messageId: string) => void;
    onSaveChecklist: (data: { title: string; items: string[] }) => Promise<any> | void;
    onToggleChecklistItem: (itemId: string, isChecked: boolean) => void;
    onCreateShiftReport: (body: string) => Promise<any> | void;
    onShareLocation: () => Promise<any> | void;
    onCommitmentAction: (action: 'acknowledged' | 'arrived' | 'completed') => void;
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

function getStatus(meta: any) {
    const operational = meta?.operational || {};
    return {
        acknowledged: !!operational.acknowledged_at,
        arrived: !!operational.arrived_at,
        completed: !!operational.completed_at,
    };
}

export function OperationPanel({
    loading,
    pinnedMessage,
    checklist,
    latestLocation,
    latestShiftReport,
    activeCommitment,
    onOpenPinnedMessage,
    onSaveChecklist,
    onToggleChecklistItem,
    onCreateShiftReport,
    onShareLocation,
    onCommitmentAction,
}: OperationPanelProps) {
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [checklistTitle, setChecklistTitle] = useState(checklist?.title || 'Checklist diario');
    const [checklistItemsText, setChecklistItemsText] = useState('');
    const [shiftBody, setShiftBody] = useState('');

    const status = useMemo(() => getStatus(activeCommitment?.meta), [activeCommitment?.meta]);

    useEffect(() => {
        if (!checklist) return;
        setChecklistTitle(checklist.title || 'Checklist diario');
        const itemsText = (checklist.run?.items || []).map((item: any) => item.label).join('\n');
        setChecklistItemsText(itemsText);
    }, [checklist]);

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
        setChecklistItemsText('');
    };

    const saveShift = async () => {
        if (!shiftBody.trim()) return;
        await onCreateShiftReport(shiftBody.trim());
        setShiftBody('');
        setShowShiftModal(false);
    };

    return (
        <>
            <View style={styles.panel}>
                {loading ? <ActivityIndicator size="small" color="#3b82f6" /> : null}

                {pinnedMessage ? (
                    <TouchableOpacity style={styles.block} onPress={() => onOpenPinnedMessage(pinnedMessage.id)} activeOpacity={0.8}>
                        <View style={styles.blockHeader}>
                            <Text style={styles.blockLabel}>Fijado principal</Text>
                            <Ionicons name="pin" size={14} color="#2563eb" />
                        </View>
                        <Text style={styles.primaryText} numberOfLines={2}>{pinnedMessage.text || 'Mensaje fijado'}</Text>
                        <Text style={styles.metaText}>{formatShortDate(pinnedMessage.created_at)}</Text>
                    </TouchableOpacity>
                ) : null}

                <View style={styles.block}>
                    <View style={styles.blockHeader}>
                        <Text style={styles.blockLabel}>Checklist activo</Text>
                        <TouchableOpacity onPress={() => setShowChecklistModal(true)}>
                            <Text style={styles.linkText}>{checklist ? 'Editar' : 'Crear'}</Text>
                        </TouchableOpacity>
                    </View>

                    {checklist?.run?.items?.length ? (
                        checklist.run.items.slice(0, 4).map((item: any) => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.checkRow}
                                onPress={() => onToggleChecklistItem(item.id, !item.is_checked)}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={item.is_checked ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={18}
                                    color={item.is_checked ? '#16a34a' : '#64748b'}
                                />
                                <Text style={[styles.checkText, item.is_checked && styles.checkTextDone]} numberOfLines={1}>{item.label}</Text>
                            </TouchableOpacity>
                        ))
                    ) : (
                        <Text style={styles.secondaryText}>Sin checklist del dia.</Text>
                    )}
                </View>

                <View style={styles.block}>
                    <View style={styles.blockHeader}>
                        <Text style={styles.blockLabel}>Estado rapido</Text>
                        <Text style={styles.metaText}>{activeCommitment?.title ? 'Sobre tarea activa' : 'Sin tarea activa'}</Text>
                    </View>

                    {activeCommitment?.title ? <Text style={styles.primaryText} numberOfLines={2}>{activeCommitment.title}</Text> : null}

                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={[styles.actionChip, status.acknowledged && styles.actionChipDone]}
                            onPress={() => onCommitmentAction('acknowledged')}
                            disabled={!activeCommitment || status.acknowledged}
                        >
                            <Text style={[styles.actionChipText, status.acknowledged && styles.actionChipTextDone]}>Entendido</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionChip, status.arrived && styles.actionChipDone]}
                            onPress={() => onCommitmentAction('arrived')}
                            disabled={!activeCommitment || status.arrived}
                        >
                            <Text style={[styles.actionChipText, status.arrived && styles.actionChipTextDone]}>Llegue</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionChip, status.completed && styles.actionChipDone]}
                            onPress={() => onCommitmentAction('completed')}
                            disabled={!activeCommitment || status.completed}
                        >
                            <Text style={[styles.actionChipText, status.completed && styles.actionChipTextDone]}>Terminado</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.block}>
                    <View style={styles.blockHeader}>
                        <Text style={styles.blockLabel}>Ubicacion compartida</Text>
                        <TouchableOpacity onPress={onShareLocation}>
                            <Text style={styles.linkText}>Compartir</Text>
                        </TouchableOpacity>
                    </View>
                    {latestLocation?.meta?.location?.label ? (
                        <>
                            <Text style={styles.primaryText} numberOfLines={1}>{latestLocation.meta.location.label}</Text>
                            <Text style={styles.metaText}>{formatShortDate(latestLocation.created_at)}</Text>
                        </>
                    ) : (
                        <Text style={styles.secondaryText}>Sin ubicacion reciente.</Text>
                    )}
                </View>

                <View style={styles.block}>
                    <View style={styles.blockHeader}>
                        <Text style={styles.blockLabel}>Resumen de turno</Text>
                        <TouchableOpacity onPress={() => setShowShiftModal(true)}>
                            <Text style={styles.linkText}>Registrar</Text>
                        </TouchableOpacity>
                    </View>
                    {latestShiftReport?.body ? (
                        <>
                            <Text style={styles.primaryText} numberOfLines={2}>{latestShiftReport.body}</Text>
                            <Text style={styles.metaText}>{formatShortDate(latestShiftReport.created_at)}</Text>
                        </>
                    ) : (
                        <Text style={styles.secondaryText}>Sin cierre de turno aun.</Text>
                    )}
                </View>
            </View>

            <Modal visible={showChecklistModal} transparent animationType="slide" onRequestClose={() => setShowChecklistModal(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowChecklistModal(false)}>
                    <Pressable style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Checklist diario</Text>
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
                        <TouchableOpacity style={styles.primaryButton} onPress={saveChecklist}>
                            <Text style={styles.primaryButtonText}>Guardar checklist</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={showShiftModal} transparent animationType="slide" onRequestClose={() => setShowShiftModal(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowShiftModal(false)}>
                    <Pressable style={styles.sheet}>
                        <Text style={styles.sheetTitle}>Registrar turno</Text>
                        <TextInput
                            value={shiftBody}
                            onChangeText={setShiftBody}
                            placeholder="Que paso en el turno"
                            style={[styles.input, styles.textArea]}
                            placeholderTextColor="#94a3b8"
                            multiline
                            textAlignVertical="top"
                        />
                        <TouchableOpacity style={styles.primaryButton} onPress={saveShift}>
                            <Text style={styles.primaryButtonText}>Guardar resumen</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    panel: {
        backgroundColor: '#f8fafc',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 8,
        gap: 8,
        maxHeight: 280,
    },
    block: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    blockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    blockLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#334155',
        textTransform: 'uppercase',
    },
    linkText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    primaryText: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '600',
        color: '#0f172a',
    },
    secondaryText: {
        fontSize: 13,
        color: '#64748b',
    },
    metaText: {
        fontSize: 11,
        color: '#64748b',
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 4,
    },
    checkText: {
        flex: 1,
        fontSize: 13,
        color: '#0f172a',
    },
    checkTextDone: {
        textDecorationLine: 'line-through',
        color: '#64748b',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    actionChip: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
    },
    actionChipDone: {
        backgroundColor: '#dcfce7',
    },
    actionChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0f172a',
    },
    actionChipTextDone: {
        color: '#166534',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        gap: 12,
    },
    sheetTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
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
        minHeight: 120,
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: 'white',
        fontWeight: '700',
    },
});
