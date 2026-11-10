import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass } from '../design/Glass';
import { colors, space } from '../design/tokens';
import { fonts } from '../design/typography';
import { summarize } from '../utils/commitmentOutcome';

// A thin bar under the chat's header: how the commitments of this chat
// stand, one tap from the full list. Hidden while the chat has none.

export function stripLabel(items: any[], now: Date = new Date()): { pending: string | null; late: string | null; text: string } | null {
    if (!items.length) return null;
    const { counts } = summarize(items, now);
    const open = counts.pending + counts.expired;
    const pending = open ? `${open} pendiente${open > 1 ? 's' : ''}` : null;
    const late = counts.overdue ? `${counts.overdue} atrasado${counts.overdue > 1 ? 's' : ''}` : null;
    const text = [pending, late].filter(Boolean).join(' · ') || 'Compromisos al día';
    return { pending, late, text };
}

// How many of these are waiting on this person's answer: a shared proposal
// they have not answered yet, or one given to them that is still proposed.
export function awaitingMyAnswer(items: any[], userId?: string | null): number {
    const me = userId?.toLowerCase();
    if (!me) return 0;
    return items.filter((item) => {
        if (item?._isAgreementProposal) {
            const responses = Array.isArray(item.agreement_responses) ? item.agreement_responses : [];
            return responses.some((r: any) => r?.participant_user_id?.toLowerCase() === me && r?.status === 'pending');
        }
        return (item?.status === 'proposed' || item?.status === 'counter_proposal')
            && item?.assigned_to_user_id?.toLowerCase() === me;
    }).length;
}

export function CommitmentsStrip({ items, onPress, userId }: { items: any[]; onPress: () => void; userId?: string | null }) {
    const label = stripLabel(items);
    if (!label) return null;
    const waiting = awaitingMyAnswer(items, userId);
    if (waiting > 0) {
        const text = waiting === 1 ? '1 compromiso espera tu respuesta' : `${waiting} compromisos esperan tu respuesta`;
        return (
            <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={text}>
                <Glass style={[styles.strip, styles.stripAwaiting]} intensity={40}>
                    <Ionicons name="hand-left-outline" size={16} color={colors.accentBright} />
                    <Text style={[styles.text, styles.title]} numberOfLines={1}>{text}</Text>
                    <View style={styles.more}>
                        <Text style={styles.moreText}>Responder</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.accentBright} />
                    </View>
                </Glass>
            </TouchableOpacity>
        );
    }
    return (
        <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Compromisos: ${label.text}`}>
            <Glass style={styles.strip} intensity={40}>
                <Ionicons name="checkmark-done-outline" size={16} color={colors.accentBright} />
                <Text style={styles.text} numberOfLines={1}>
                    {label.pending || label.late ? (
                        <>
                            {label.pending && <Text style={styles.title}>{label.pending}</Text>}
                            {label.pending && label.late && <Text style={styles.soft}>{' · '}</Text>}
                            {label.late && <Text style={styles.late}>{label.late}</Text>}
                        </>
                    ) : <Text style={styles.soft}>{label.text}</Text>}
                </Text>
                <View style={styles.more}>
                    <Text style={styles.moreText}>Ver</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.accentBright} />
                </View>
            </Glass>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    strip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: 9,
        borderWidth: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    stripAwaiting: { backgroundColor: colors.accentTint },
    text: { flex: 1 },
    title: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
    soft: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },
    late: { fontFamily: fonts.semibold, fontSize: 13, color: colors.warning },
    more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    moreText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentBright },
});
