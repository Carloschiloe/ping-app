import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChecklistManagementSectionProps {
    isAdmin: boolean;
    checklistsFilter: 'active' | 'archived';
    displayedChecklists: any[];
    onChangeFilter: (value: 'active' | 'archived') => void;
    onCreate: () => void;
    onOpenChecklist: (checklist: any) => void;
}

export function ChecklistManagementSection({
    isAdmin,
    checklistsFilter,
    displayedChecklists,
    onChangeFilter,
    onCreate,
    onOpenChecklist,
}: ChecklistManagementSectionProps) {
    return (
        <View style={styles.section}>
            <View style={styles.checklistHeaderRow}>
                <Text style={styles.sectionTitle}>Checklists del grupo</Text>
                {isAdmin && (
                    <TouchableOpacity style={styles.newChecklistBtn} onPress={onCreate}>
                        <Ionicons name="add" size={16} color="white" />
                        <Text style={styles.newChecklistBtnText}>Nuevo</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.checklistsFilterRow}>
                <TouchableOpacity
                    style={[styles.checklistsFilterChip, checklistsFilter === 'active' && styles.checklistsFilterChipActive]}
                    onPress={() => onChangeFilter('active')}
                >
                    <Text style={[styles.checklistsFilterChipText, checklistsFilter === 'active' && styles.checklistsFilterChipTextActive]}>Activos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.checklistsFilterChip, checklistsFilter === 'archived' && styles.checklistsFilterChipActive]}
                    onPress={() => onChangeFilter('archived')}
                >
                    <Text style={[styles.checklistsFilterChipText, checklistsFilter === 'archived' && styles.checklistsFilterChipTextActive]}>Archivados</Text>
                </TouchableOpacity>
            </View>

            {displayedChecklists.length ? (
                displayedChecklists.map((list: any) => (
                    <TouchableOpacity
                        key={list.id}
                        style={styles.checklistCard}
                        activeOpacity={0.85}
                        onPress={() => onOpenChecklist(list)}
                    >
                        <View style={styles.checklistCardHeader}>
                            <Text style={styles.checklistCardTitle}>{list.title}</Text>
                            <Text style={styles.checklistCardCount}>{list.run?.items?.length || 0} items</Text>
                        </View>
                        <Text style={styles.checklistCardMeta}>
                            {list.category_label || 'General'} · {list.responsible_role_label || 'Sin rol'} · {list.frequency || 'manual'}
                        </Text>
                        {list.run?.items?.length ? (
                            <Text style={styles.checklistCardSubtext} numberOfLines={2}>
                                {list.run.items.map((item: any) => item.label).join(' · ')}
                            </Text>
                        ) : null}
                    </TouchableOpacity>
                ))
            ) : (
                <View style={styles.emptyWrap}>
                    <Ionicons name="checkmark-done-outline" size={44} color="#9ca3af" />
                    <Text style={styles.emptyText}>{checklistsFilter === 'active' ? 'Aún no hay checklists activos en este grupo' : 'No hay checklists archivados'}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        backgroundColor: 'white',
        marginTop: 8,
        padding: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e5e7eb',
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
    checklistHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    newChecklistBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#2563eb',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
    },
    newChecklistBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 12,
    },
    checklistsFilterRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    checklistsFilterChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#f3f4f6',
    },
    checklistsFilterChipActive: {
        backgroundColor: '#dbeafe',
    },
    checklistsFilterChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    checklistsFilterChipTextActive: {
        color: '#2563eb',
    },
    checklistCard: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        backgroundColor: '#f8fafc',
    },
    checklistCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    checklistCardTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    checklistCardCount: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    checklistCardMeta: {
        marginTop: 6,
        fontSize: 12,
        color: '#64748b',
    },
    checklistCardSubtext: {
        marginTop: 8,
        fontSize: 12,
        color: '#475569',
        lineHeight: 18,
    },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, opacity: 0.6 },
    emptyText: { marginTop: 12, color: '#6b7280', fontSize: 14, fontWeight: '500' },
});
