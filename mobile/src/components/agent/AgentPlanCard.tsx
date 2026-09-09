import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AgentPlanPresentation } from '../../api/query-modules/agent';
import { useAppTheme } from '../../theme/ThemeContext';

interface AgentPlanCardProps {
    presentation: AgentPlanPresentation;
    active: boolean;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function AgentPlanCard({ presentation, active, busy, onConfirm, onCancel }: AgentPlanCardProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.card} accessibilityRole="summary" accessibilityLabel={presentation.headline}>
            <Text style={styles.eyebrow}>Plan para confirmar</Text>
            <Text style={styles.headline}>{presentation.headline}</Text>

            {presentation.stepPresentations.map((step, index) => (
                <View key={step.stepId} style={styles.step}>
                    <Text style={styles.stepIndex}>{step.phase === 'conditional' ? 'Después, si se cumple' : `Paso ${index + 1}`}</Text>
                    <Text style={styles.stepHeadline}>{step.headline}</Text>
                    {step.recipientLabel && <Text style={styles.detail}>Persona: {step.recipientLabel}</Text>}
                    {step.contentPreview && <Text style={styles.preview}>“{step.contentPreview}”</Text>}
                    {step.dateLabel && <Text style={styles.detail}>Cuándo: {step.dateLabel}</Text>}
                    <Text style={styles.effect}>{step.effectDescription}</Text>
                    {step.conditionLabel && <Text style={styles.condition}>Condición: {step.conditionLabel}</Text>}
                </View>
            ))}

            {presentation.riskLabel && <Text style={styles.risk}>{presentation.riskLabel}</Text>}

            {active ? (
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onCancel}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={presentation.cancelLabel}
                    >
                        <Text style={styles.cancelText}>{presentation.cancelLabel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.confirmButton, busy && styles.disabledButton]}
                        onPress={onConfirm}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`${presentation.confirmationLabel}: ${presentation.headline}`}
                    >
                        {busy && <ActivityIndicator size="small" color={theme.colors.white} />}
                        <Text style={styles.confirmText}>{busy ? 'Procesando…' : presentation.confirmationLabel}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <Text style={styles.inactive}>Este plan ya no está disponible para confirmar.</Text>
            )}
        </View>
    );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
    return StyleSheet.create({
        card: {
            width: '100%', minWidth: 0, borderRadius: 16, padding: 14,
            backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        },
        eyebrow: { color: theme.colors.info, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 },
        headline: { color: theme.colors.text.primary, fontSize: 17, lineHeight: 23, fontWeight: '700', marginBottom: 10 },
        step: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
        stepIndex: { color: theme.colors.text.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 },
        stepHeadline: { color: theme.colors.text.primary, fontSize: 15, lineHeight: 21, fontWeight: '600' },
        detail: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
        preview: { color: theme.colors.text.primary, fontSize: 15, lineHeight: 21, marginTop: 7 },
        effect: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
        condition: { color: theme.colors.info, fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 5 },
        risk: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 8 },
        actions: { flexDirection: 'column-reverse', gap: 8, marginTop: 14 },
        cancelButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
        cancelText: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '600' },
        confirmButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: 12, backgroundColor: theme.colors.info, paddingHorizontal: 16 },
        confirmText: { color: theme.colors.white, fontSize: 15, fontWeight: '700', textAlign: 'center' },
        disabledButton: { opacity: 0.55 },
        inactive: { color: theme.colors.text.muted, fontSize: 12, marginTop: 10 },
    });
}
