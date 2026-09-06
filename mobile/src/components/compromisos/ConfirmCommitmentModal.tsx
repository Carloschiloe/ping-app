import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { isCommitmentOverdue } from '../../utils/commitmentDisplay';

// M-1H v4 — hallazgo real de staging: tocar "Confirmar" ejecutaba la acción
// de inmediato, sin modal, sin loading state, sin feedback de éxito/error.
// Si la request fallaba silenciosamente (o tardaba en refrescar la lista),
// el usuario percibía "no pasó nada" -- indistinguible de un bug real. Este
// modal es la única puerta de entrada a la acción de escritura: nunca se
// ejecuta nada en el primer tap de la fila, siempre pasa por Cancelar/Confirmar
// aquí, con loading state explícito y resultado siempre visible (ver
// InsightsScreen.tsx/TaskDashboardScreen.tsx#handleConfirmSubmit).
export interface ConfirmCommitmentModalProps {
    // El commitment/proposal pendiente de confirmar, o null si el modal está cerrado.
    commitment: any | null;
    isPending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function ConfirmCommitmentModal({ commitment, isPending, onCancel, onConfirm }: ConfirmCommitmentModalProps) {
    const { theme } = useAppTheme();
    const styles = createStyles(theme);
    const visible = !!commitment;
    // isCommitmentOverdue ya excluye status cerrados -- un item aquí siempre
    // está en un status abierto (proposed), así que esto sólo depende de la fecha.
    const isOverdueItem = !!commitment && isCommitmentOverdue(commitment);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!isPending) onCancel(); }}>
            <Pressable style={styles.overlay} onPress={() => { if (!isPending) onCancel(); }}>
                {/* Evita que el tap dentro de la tarjeta se propague al overlay y la cierre por accidente. */}
                <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.title}>¿Confirmar compromiso?</Text>
                    <Text style={styles.commitmentTitle} numberOfLines={3}>{commitment?.title}</Text>
                    <Text style={styles.body}>Al confirmar, este compromiso quedará aceptado y activo.</Text>
                    {isOverdueItem && (
                        <Text style={styles.warning}>Este compromiso está vencido.</Text>
                    )}
                    <View style={styles.buttonsRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onCancel}
                            disabled={isPending}
                        >
                            <Text style={[styles.buttonText, { color: theme.colors.text.secondary }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.confirmButton, { backgroundColor: theme.colors.accent }, isPending && styles.buttonDisabled]}
                            onPress={onConfirm}
                            disabled={isPending}
                        >
                            {isPending
                                ? <ActivityIndicator size="small" color={theme.colors.white} />
                                : <Text style={[styles.buttonText, { color: theme.colors.white }]}>Confirmar</Text>}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
    return StyleSheet.create({
        overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
        card: { width: '100%', maxWidth: 340, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20 },
        title: { fontSize: 16, fontWeight: '700', color: theme.colors.text.primary, marginBottom: 8 },
        commitmentTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.accent, marginBottom: 8 },
        body: { fontSize: 13, color: theme.colors.text.secondary, lineHeight: 18 },
        warning: { fontSize: 13, color: theme.colors.danger, fontWeight: '600', marginTop: 8 },
        buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
        button: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
        cancelButton: { backgroundColor: theme.colors.background },
        confirmButton: {},
        buttonDisabled: { opacity: 0.6 },
        buttonText: { fontSize: 14, fontWeight: '700' },
    });
}
