import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { colors, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
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
                const tone = status === 'approved'
                    ? { color: colors.success, background: colors.successTint, icon: 'checkmark-circle' as const }
                    : status === 'rejected'
                        ? { color: colors.danger, background: colors.dangerTint, icon: 'close-circle' as const }
                        : status === 'counter_proposed'
                            ? { color: colors.accentBright, background: colors.accentTint, icon: 'time' as const }
                            : status === 'pending'
                                ? { color: colors.warning, background: colors.warningTint, icon: 'hourglass-outline' as const }
                                : { color: colors.textFaint, background: colors.glassRaised, icon: 'remove-circle-outline' as const };
                const label = participant.hasRecordedResponse
                    ? getAgreementResponseLabel(status)
                    : 'Sin respuesta registrada';

                return (
                    <View key={participant.id} style={styles.row}>
                        <View style={styles.person}>
                            <Ionicons name={tone.icon} size={18} color={tone.color} />
                            <View style={styles.copy}>
                                <Text style={styles.name}>{participant.name}</Text>
                                {status === 'counter_proposed' && participant.proposed_due_at ? (
                                    <Text style={styles.date}>{formatProposedDate(participant.proposed_due_at)}</Text>
                                ) : null}
                            </View>
                        </View>
                        <View style={[styles.badge, { backgroundColor: tone.background }]}>
                            <Text style={[styles.badgeText, { color: tone.color }]}>{label}</Text>
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

const styles = StyleSheet.create({
    section: { marginBottom: space.md, gap: space.sm },
    title: { ...type.overline },
    row: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: radius.md,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
    copy: { flex: 1 },
    name: { fontFamily: fonts.semibold, color: colors.text, fontSize: 13 },
    date: { fontFamily: fonts.regular, color: colors.textFaint, fontSize: 11, marginTop: 2 },
    badge: { maxWidth: '48%', borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 5 },
    badgeText: { fontFamily: fonts.bold, fontSize: 10, textAlign: 'center' },
    legacyNote: { fontFamily: fonts.regular, color: colors.textFaint, fontSize: 11, lineHeight: 15 },
});
