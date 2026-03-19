import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ChecklistItemType = 'condition' | 'severity' | 'yes_no' | 'text';

interface ChecklistEditorModalProps {
    visible: boolean;
    editingChecklist: any;
    checklistTitle: string;
    checklistCategory: string;
    checklistRole: string;
    checklistFrequency: 'manual' | 'daily' | 'shift';
    checklistItems: { label: string; responseType: ChecklistItemType }[];
    draftChecklistItem: string;
    draftChecklistItemType: ChecklistItemType;
    checklistCategorySuggestions: string[];
    checklistRoleSuggestions: string[];
    checklistItemSuggestions: string[];
    checklistTypeOptions: readonly { key: ChecklistItemType; label: string }[];
    isSavingChecklist?: boolean;
    onClose: () => void;
    onSave: () => void;
    onChangeTitle: (value: string) => void;
    onChangeCategory: (value: string) => void;
    onChangeRole: (value: string) => void;
    onChangeFrequency: (value: 'manual' | 'daily' | 'shift') => void;
    onChangeDraftItem: (value: string) => void;
    onChangeDraftItemType: (value: ChecklistItemType) => void;
    onAddChecklistItem: () => void;
    onRemoveChecklistItem: (index: number) => void;
}

export function ChecklistEditorModal(props: ChecklistEditorModalProps) {
    const {
        visible,
        editingChecklist,
        checklistTitle,
        checklistCategory,
        checklistRole,
        checklistFrequency,
        checklistItems,
        draftChecklistItem,
        draftChecklistItemType,
        checklistCategorySuggestions,
        checklistRoleSuggestions,
        checklistItemSuggestions,
        checklistTypeOptions,
        isSavingChecklist,
        onClose,
        onSave,
        onChangeTitle,
        onChangeCategory,
        onChangeRole,
        onChangeFrequency,
        onChangeDraftItem,
        onChangeDraftItemType,
        onAddChecklistItem,
        onRemoveChecklistItem,
    } = props;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
                    style={styles.modalKeyboardHost}
                >
                    <View style={styles.checklistModalCard}>
                        <View style={styles.modalHeaderRow}>
                            <Text style={styles.modalTitleText}>{editingChecklist ? 'Editar checklist' : 'Nuevo checklist'}</Text>
                            <TouchableOpacity onPress={onClose}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
                            <Text style={styles.blockTitle}>Información</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Nombre del checklist"
                                value={checklistTitle}
                                onChangeText={onChangeTitle}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Categoría (ej. Operación)"
                                value={checklistCategory}
                                onChangeText={onChangeCategory}
                            />
                            <View style={styles.suggestionRow}>
                                {checklistCategorySuggestions.map((suggestion) => (
                                    <TouchableOpacity key={suggestion} style={styles.suggestionChip} onPress={() => onChangeCategory(suggestion)}>
                                        <Text style={styles.suggestionChipText}>{suggestion}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Responsable / rol (ej. Supervisor)"
                                value={checklistRole}
                                onChangeText={onChangeRole}
                            />
                            <View style={styles.suggestionRow}>
                                {checklistRoleSuggestions.map((suggestion) => (
                                    <TouchableOpacity key={suggestion} style={styles.suggestionChip} onPress={() => onChangeRole(suggestion)}>
                                        <Text style={styles.suggestionChipText}>{suggestion}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.frequencyRow}>
                                {(['manual', 'daily', 'shift'] as const).map((frequency) => (
                                    <TouchableOpacity
                                        key={frequency}
                                        style={[styles.frequencyChip, checklistFrequency === frequency && styles.frequencyChipActive]}
                                        onPress={() => onChangeFrequency(frequency)}
                                    >
                                        <Text style={[styles.frequencyChipText, checklistFrequency === frequency && styles.frequencyChipTextActive]}>
                                            {frequency === 'manual' ? 'Manual' : frequency === 'daily' ? 'Diario' : 'Por turno'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.blockTitle}>Items</Text>
                            <TextInput
                                style={styles.modalTextArea}
                                placeholder="Nuevo item"
                                value={draftChecklistItem}
                                onChangeText={onChangeDraftItem}
                                multiline
                                textAlignVertical="top"
                            />
                            <Text style={styles.modalHelperText}>Tipo de respuesta del item</Text>
                            <View style={styles.frequencyRow}>
                                {checklistTypeOptions.map((option) => (
                                    <TouchableOpacity
                                        key={option.key}
                                        style={[styles.frequencyChip, draftChecklistItemType === option.key && styles.frequencyChipActive]}
                                        onPress={() => onChangeDraftItemType(option.key)}
                                    >
                                        <Text style={[styles.frequencyChipText, draftChecklistItemType === option.key && styles.frequencyChipTextActive]}>{option.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={styles.addChecklistItemBtn} onPress={onAddChecklistItem}>
                                <Text style={styles.addChecklistItemBtnText}>Agregar item</Text>
                            </TouchableOpacity>

                            <Text style={styles.modalHelperText}>Sugerencias rápidas</Text>
                            <View style={styles.suggestionRow}>
                                {checklistItemSuggestions.map((suggestion) => (
                                    <TouchableOpacity key={suggestion} style={styles.suggestionChip} onPress={() => onChangeDraftItem(suggestion)}>
                                        <Text style={styles.suggestionChipText}>{suggestion}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {checklistItems.length ? (
                                <View style={styles.createdItemsWrap}>
                                    {checklistItems.map((item, index) => {
                                        const typeLabel = checklistTypeOptions.find((option) => option.key === item.responseType)?.label || 'Bueno/Regular/Malo';
                                        return (
                                            <View key={`${item.label}-${index}`} style={styles.createdItemCard}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.createdItemTitle}>{item.label}</Text>
                                                    <Text style={styles.createdItemMeta}>{typeLabel}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => onRemoveChecklistItem(index)}>
                                                    <Ionicons name="close-circle" size={20} color="#94a3b8" />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}

                            <TouchableOpacity
                                style={[styles.saveChecklistBtn, isSavingChecklist && { opacity: 0.6 }]}
                                onPress={onSave}
                                disabled={isSavingChecklist}
                            >
                                <Text style={styles.saveChecklistBtnText}>{isSavingChecklist ? 'Guardando...' : 'Guardar checklist'}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalKeyboardHost: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checklistModalCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        maxWidth: 440,
        maxHeight: '82%',
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitleText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    modalScrollContent: {
        paddingBottom: 40,
    },
    blockTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#374151',
        marginBottom: 10,
        marginTop: 4,
        textTransform: 'uppercase',
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        marginBottom: 10,
        color: '#111827',
    },
    modalTextArea: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        minHeight: 100,
        color: '#111827',
        marginBottom: 14,
    },
    frequencyRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    frequencyChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#f3f4f6',
    },
    frequencyChipActive: {
        backgroundColor: '#dbeafe',
    },
    frequencyChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    frequencyChipTextActive: {
        color: '#2563eb',
    },
    addChecklistItemBtn: {
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    addChecklistItemBtnText: {
        color: '#2563eb',
        fontWeight: '700',
        fontSize: 14,
    },
    modalHelperText: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 8,
        fontWeight: '600',
    },
    suggestionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    suggestionChip: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#eff6ff',
    },
    suggestionChipText: {
        color: '#2563eb',
        fontSize: 12,
        fontWeight: '700',
    },
    createdItemsWrap: {
        gap: 8,
        marginBottom: 14,
    },
    createdItemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    createdItemTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    createdItemMeta: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    saveChecklistBtn: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveChecklistBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 15,
    },
});
