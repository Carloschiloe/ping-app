import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppTheme } from '../../theme/ThemeContext';

interface RescheduleModalProps {
    item: any | null;
    onClose: () => void;
    onSaveDate: (id: string, newDateIso: string) => void;
}

export function RescheduleModal({ item, onClose, onSaveDate }: RescheduleModalProps) {
    const { theme } = useAppTheme();
    const initialDate = item?.due_at ? new Date(item.due_at) : addDays(new Date(), 1);
    const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
    const [showNativePicker, setShowNativePicker] = useState(false);

    if (!item) return null;

    const quickSelect = (daysOffset: number, hour = 10) => {
        const d = addDays(startOfDay(new Date()), daysOffset);
        d.setHours(hour, 0, 0, 0);
        setSelectedDate(d);
    };

    const handleConfirm = () => {
        onSaveDate(item.id, selectedDate.toISOString());
        onClose();
    };

    return (
        <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose} />
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                        {item.due_at ? 'Reprogramar fecha' : 'Agendar compromiso'}
                    </Text>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close" size={20} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                    {item.title}
                </Text>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                    <TouchableOpacity style={[styles.presetBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => quickSelect(0, 18)}>
                        <Text style={[styles.presetText, { color: theme.colors.text.primary }]}>Hoy tarde (18:00)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.presetBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => quickSelect(1, 10)}>
                        <Text style={[styles.presetText, { color: theme.colors.text.primary }]}>Mañana 10:00</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.presetBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => quickSelect(7, 10)}>
                        <Text style={[styles.presetText, { color: theme.colors.text.primary }]}>Próxima semana</Text>
                    </TouchableOpacity>
                </View>

                {/* Selected Date Preview */}
                <TouchableOpacity
                    style={[styles.datePreview, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}
                    onPress={() => setShowNativePicker(true)}
                >
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
                    <Text style={[styles.datePreviewText, { color: theme.colors.text.primary }]}>
                        {format(selectedDate, "eeee d 'de' MMMM · HH:mm", { locale: es })}
                    </Text>
                    <Ionicons name="pencil-outline" size={14} color={theme.colors.text.muted} />
                </TouchableOpacity>

                {showNativePicker && (
                    <DateTimePicker
                        value={selectedDate}
                        mode="datetime"
                        display="default"
                        onChange={(_, date) => {
                            setShowNativePicker(false);
                            if (date) setSelectedDate(date);
                        }}
                    />
                )}

                {/* Footer Buttons */}
                <View style={styles.footer}>
                    <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.colors.border }]} onPress={onClose}>
                        <Text style={{ color: theme.colors.text.secondary, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.colors.accent }]} onPress={handleConfirm}>
                        <Text style={{ color: theme.colors.white, fontWeight: '700' }}>Guardar fecha</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    card: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        borderRadius: 18,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 8,
        gap: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '500',
    },
    presetsRow: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    presetBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    presetText: {
        fontSize: 12,
        fontWeight: '600',
    },
    datePreview: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        gap: 10,
    },
    datePreviewText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 6,
    },
    cancelBtn: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
    },
    saveBtn: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 8,
    },
});
