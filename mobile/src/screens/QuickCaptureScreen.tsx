import React, { useState, useCallback } from 'react';
import {
    View, Text, TextInput, StyleSheet, TouchableOpacity,
    ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSendMessage } from '../api/queries';
import * as Haptics from 'expo-haptics';

const PRESET_LABELS = ['Llamar', 'Enviar', 'Reunión', 'Entregar', 'Ver', 'Confirmar'];

export default function QuickCaptureScreen() {
    const navigation = useNavigation();
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const { mutateAsync: sendMessage } = useSendMessage();

    const handleSave = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
            await sendMessage(trimmed);
            Alert.alert('✅ Capturado', 'Tu nota fue guardada en Mis Recordatorios.', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo guardar la nota.');
        } finally {
            setSaving(false);
        }
    }, [text, navigation, sendMessage]);

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
                <Text style={styles.title}>Captura Rápida</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={styles.card}>
                    <Ionicons name="flash" size={28} color="#f59e0b" style={styles.flashIcon} />
                    <Text style={styles.hint}>¿Qué necesitas recordar? Ping detectará si hay un compromiso y lo guardará automáticamente.</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Ej: «Llamar a María el lunes a las 10am»"
                        placeholderTextColor="#9ca3af"
                        multiline
                        numberOfLines={4}
                        value={text}
                        onChangeText={setText}
                        autoFocus
                    />

                    {/* Quick preset chips */}
                    <View style={styles.chips}>
                        {PRESET_LABELS.map(label => (
                            <TouchableOpacity
                                key={label}
                                style={styles.chip}
                                onPress={() => setText(prev => prev ? prev + ' ' + label.toLowerCase() : label)}
                            >
                                <Text style={styles.chipText}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.saveBtn, (!text.trim() || saving) && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!text.trim() || saving}
                    activeOpacity={0.8}
                >
                    <Ionicons name="save" size={20} color="white" />
                    <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar en Mis Recordatorios'}</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    },
    closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '700', color: '#111827' },
    content: { padding: 20, gap: 20 },
    card: {
        backgroundColor: 'white', borderRadius: 20, padding: 20,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    flashIcon: { marginBottom: 8 },
    hint: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 18 },
    input: {
        borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 14, padding: 14,
        fontSize: 16, color: '#111827', minHeight: 100, textAlignVertical: 'top',
        backgroundColor: '#fafafa', marginBottom: 12,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        backgroundColor: '#eff6ff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
        borderWidth: 1, borderColor: '#bfdbfe',
    },
    chipText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
    saveBtn: {
        backgroundColor: '#f59e0b', borderRadius: 16, padding: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        shadowColor: '#f59e0b', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
