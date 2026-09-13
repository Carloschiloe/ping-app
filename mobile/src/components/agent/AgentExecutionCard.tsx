import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { AgentExecutionFailureCode, AgentExecutionResult, AgentPlanPresentation } from '../../api/query-modules/agent';
import { useAppTheme } from '../../theme/ThemeContext';

interface AgentExecutionCardProps {
    result: AgentExecutionResult;
    presentation: AgentPlanPresentation;
}

const STATUS_TITLES: Record<AgentExecutionResult['status'], string> = {
    done: 'Acción completada',
    partially_done: 'Completado parcialmente',
    waiting: 'En espera',
    blocked: 'Acción bloqueada',
    needs_reauthorization: 'Necesita una nueva confirmación',
    failed: 'No se pudo completar',
};

function failureCopy(code?: AgentExecutionFailureCode): string {
    switch (code) {
        case 'authorization_expired': return 'La confirmación expiró.';
        case 'authorization_revoked': return 'La confirmación fue revocada.';
        case 'authorization_mismatch':
        case 'plan_changed':
        case 'entity_changed': return 'El plan o su objetivo cambió.';
        case 'invalid_lifecycle': return 'El elemento ya no está en un estado válido para esta acción.';
        case 'not_authorized':
        case 'policy_blocked': return 'Tu permiso actual no permite esta acción.';
        case 'verification_failed': return 'No se pudo verificar el resultado.';
        case 'transient_failure': return 'Hubo un problema temporal.';
        default: return 'Este paso no pudo completarse.';
    }
}

// PING — COMPLETE AGENT COPY UX FOR STRUCTURED CARDS: builds ONLY
// human-readable visible prose (the exact same lines rendered as <Text>
// below) -- never authorizationId/stepId/toolId/failureCode/internal
// entity refs.
function buildExecutionCopyText(result: AgentExecutionResult, labelFor: (stepId: string) => string): string {
    const lines: string[] = [STATUS_TITLES[result.status]];
    for (const step of result.executedSteps) lines.push(`✓ ${labelFor(step.stepId)} — verificado`);
    for (const step of result.failedSteps) {
        lines.push(`✕ ${labelFor(step.stepId)}`);
        lines.push(failureCopy(step.failureCode));
    }
    for (const step of result.waitingSteps) {
        lines.push(`◷ ${labelFor(step.stepId)}`);
        lines.push(step.waitingOn || 'Depende de una condición futura.');
    }
    if (result.requiresFurtherAuthorization) {
        lines.push('La acción futura no se ejecutará automáticamente; requerirá una nueva confirmación.');
    }
    return lines.join('\n');
}

export function AgentExecutionCard({ result, presentation }: AgentExecutionCardProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const labelFor = (stepId: string) => presentation.stepPresentations.find((step) => step.stepId === stepId)?.headline || 'Acción del plan';

    const handleCopy = async () => {
        await Clipboard.setStringAsync(buildExecutionCopyText(result, labelFor));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    return (
        <View style={styles.card} accessibilityRole="summary" accessibilityLabel={STATUS_TITLES[result.status]}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>{STATUS_TITLES[result.status]}</Text>
                <TouchableOpacity
                    onPress={handleCopy}
                    style={styles.copyButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Copiar resultado"
                >
                    <Ionicons name="copy-outline" size={16} color={theme.colors.text.muted} />
                    <Text style={styles.copyText}>Copiar</Text>
                </TouchableOpacity>
            </View>
            {result.executedSteps.map((step) => (
                <Text key={`ok-${step.stepId}`} style={styles.success}>✓ {labelFor(step.stepId)} — verificado</Text>
            ))}
            {result.failedSteps.map((step) => (
                <View key={`failed-${step.stepId}`} style={styles.row}>
                    <Text style={styles.failure}>✕ {labelFor(step.stepId)}</Text>
                    <Text style={styles.detail}>{failureCopy(step.failureCode)}</Text>
                </View>
            ))}
            {result.waitingSteps.map((step) => (
                <View key={`waiting-${step.stepId}`} style={styles.row}>
                    <Text style={styles.waiting}>◷ {labelFor(step.stepId)}</Text>
                    <Text style={styles.detail}>{step.waitingOn || 'Depende de una condición futura.'}</Text>
                </View>
            ))}
            {result.requiresFurtherAuthorization && (
                <Text style={styles.notice}>La acción futura no se ejecutará automáticamente; requerirá una nueva confirmación.</Text>
            )}
        </View>
    );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
    return StyleSheet.create({
        card: { width: '100%', minWidth: 0, borderRadius: 16, padding: 14, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
        headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
        title: { color: theme.colors.text.primary, fontSize: 16, lineHeight: 22, fontWeight: '700' },
        copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 4 },
        copyText: { color: theme.colors.text.muted, fontSize: 12, fontWeight: '600' },
        row: { marginTop: 8 },
        success: { color: theme.colors.success, fontSize: 14, lineHeight: 20, marginTop: 5 },
        failure: { color: theme.colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '600' },
        waiting: { color: theme.colors.info, fontSize: 14, lineHeight: 20, fontWeight: '600' },
        detail: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginLeft: 18 },
        notice: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 12 },
    });
}
