import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { isCommitmentOverdue, isProposalDatePassed } from '../../utils/commitmentDisplay';
import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';

// M-1H v4 — hallazgo real durante validación: tocar "Confirmar" ejecutaba la acción
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
    const visible = !!commitment;
    // M-1H v5 (sección 28 del ticket): este modal SÓLO se abre cuando
    // getCommitmentPrimaryAction ya decidió 'accept' -- nunca aparece para
    // un actor que sólo está esperando a otra persona (caso real Carlos en
    // "Entrenar"), porque esa fila no tiene botón tappable en absoluto (ver
    // CommitmentRow.tsx/TodayItemRow.tsx, rama 'waiting'). Aun así, el copy
    // se adapta explícitamente según el tipo real de entidad: "aceptar una
    // propuesta" (aún no es un commitment) nunca se confunde con "confirmar
    // un commitment" (ya lo es, sólo falta esta transición de estado).
    const isProposalAccept = commitment?._isAgreementProposal === true;
    const title = isProposalAccept ? '¿Aceptar propuesta?' : '¿Confirmar compromiso?';
    const bodyText = isProposalAccept
        ? 'Al aceptar, tu respuesta quedará registrada. El compromiso se activará una vez que todas las personas requeridas acepten.'
        : 'Al confirmar, este compromiso quedará aceptado y activo.';
    const confirmLabel = isProposalAccept ? 'Aceptar' : 'Confirmar';
    // isCommitmentOverdue ya excluye toda commitment_proposal (regla
    // principal) -- por eso isOverdueItem sólo puede ser true para un
    // commitment canónico. Para una proposal, la señal separada y honesta
    // es proposalDatePassed ("la fecha propuesta ya pasó", nunca "vencido").
    const isOverdueItem = !!commitment && isCommitmentOverdue(commitment);
    const datePassed = isProposalAccept && isProposalDatePassed(commitment?.due_at);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!isPending) onCancel(); }}>
            <Pressable style={styles.overlay} onPress={() => { if (!isPending) onCancel(); }}>
                {/* Evita que el tap dentro de la tarjeta se propague al overlay y la cierre por accidente. */}
                <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
                    <SheetFill />
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.commitmentTitle} numberOfLines={3}>{commitment?.title}</Text>
                    <Text style={styles.body}>{bodyText}</Text>
                    {isOverdueItem && (
                        <Text style={styles.warning}>Este compromiso está vencido.</Text>
                    )}
                    {datePassed && (
                        <Text style={styles.warning}>La fecha propuesta ya pasó.</Text>
                    )}
                    <View style={styles.buttonsRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onCancel}
                            disabled={isPending}
                        >
                            <Text style={[styles.buttonText, { color: colors.textSoft }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.confirmButton, { backgroundColor: colors.accent }, isPending && styles.buttonDisabled]}
                            onPress={onConfirm}
                            disabled={isPending}
                        >
                            {isPending
                                ? <ActivityIndicator size="small" color={colors.onAccent} />
                                : <Text style={[styles.buttonText, { color: colors.onAccent }]}>{confirmLabel}</Text>}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 20, ...sheetSurface },
    title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, marginBottom: 8 },
    commitmentTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.accent, marginBottom: 8 },
    body: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSoft, lineHeight: 18 },
    warning: { fontSize: 13, color: colors.danger, fontFamily: fonts.semibold, marginTop: 8 },
    buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    button: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { backgroundColor: colors.glassRaised },
    confirmButton: {},
    buttonDisabled: { opacity: 0.6 },
    buttonText: { fontSize: 14, fontFamily: fonts.bold },
});
