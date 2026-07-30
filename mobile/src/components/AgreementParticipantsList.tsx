import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppTheme } from '../theme/ThemeContext';
import {
    getAgreementResponseLabel,
    getInvolvedParticipants,
    type AgreementResponse,
} from '../utils/agreement';

interface AgreementParticipantsListProps {
    responses?: AgreementResponse[] | null;
    fallbackParticipants?: any[] | null;
    currentUserId?: string | null;
}

function formatProposedDate(value: string) {
    return format(new Date(value), "dd MMM yyyy · HH:mm", { locale: es }).replace('.', '');
}

export function AgreementParticipantsList({
    responses = [],
    fallbackParticipants = [],
    currentUserId,
}: AgreementParticipantsListProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const participants = getInvolvedParticipants(
        responses || [],
        fallbackParticipants || [],
        currentUserId,
    );

    // Una única persona sin acuerdo registrado es un compromiso personal,
    // no un acuerdo compartido. No añadimos ruido visual en ese caso.
    if (participants.length === 0 || (responses?.length === 0 && participants.length < 2)) {
        return null;
    }

    return (
        <View style={styles.section} testID="commitment-involved-participants">
            <Text style={styles.title}>Personas involucradas</Text>
            {participants.map((participant) => {
                const status = participant.status;
                const colors = status === 'approved'
                    ? { color: '#15803d', background: '#dcfce7', icon: 'checkmark-circle' as const }
                    : status === 'rejected'
                        ? { color: '#b91c1c', background: '#fee2e2', icon: 'close-circle' as const }
                        : status === 'counter_proposed'
                            ? { color: '#7c3aed', background: '#ede9fe', icon: 'time' as const }
                            : status === 'pending'
                                ? { color: '#b45309', background: '#fef3c7', icon: 'hourglass-outline' as const }
                                : { color: theme.colors.text.muted, background: theme.colors.surfaceMuted, icon: 'remove-circle-outline' as const };
                const label = participant.hasRecordedResponse
                    ? getAgreementResponseLabel(status)
                    : 'Sin respuesta registrada';

                return (
                    <View key={participant.id} style={styles.row}>
                        <View style={styles.person}>
                            <Ionicons name={colors.icon} size={18} color={colors.color} />
                            <View style={styles.copy}>
                                <Text style={styles.name}>{participant.name}</Text>
                                {status === 'counter_proposed' && participant.proposed_due_at ? (
                                    <Text style={styles.date}>{formatProposedDate(participant.proposed_due_at)}</Text>
                                ) : null}
                            </View>
                        </View>
                        <View style={[styles.badge, { backgroundColor: colors.background }]}>
                            <Text style={[styles.badgeText, { color: colors.color }]}>{label}</Text>
                        </View>
                    </View>
                );
            })}
            {responses?.length === 0 ? (
                <Text style={styles.legacyNote}>
                    Este compromiso es anterior al registro de respuestas por participante.
                </Text>
            ) : null}
        </View>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    section: {
        marginBottom: 12,
        gap: 8,
    },
    title: {
        color: theme.colors.text.muted,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    row: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.colors.separator,
    },
    person: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    copy: {
        flex: 1,
    },
    name: {
        color: theme.colors.text.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    date: {
        color: theme.colors.text.muted,
        fontSize: 11,
        marginTop: 2,
    },
    badge: {
        maxWidth: '48%',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        textAlign: 'center',
    },
    legacyNote: {
        color: theme.colors.text.muted,
        fontSize: 11,
        lineHeight: 15,
    },
});
