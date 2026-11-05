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
    const pending = counts.pending ? `${counts.pending} pendiente${counts.pending > 1 ? 's' : ''}` : null;
    const late = counts.overdue ? `${counts.overdue} atrasado${counts.overdue > 1 ? 's' : ''}` : null;
    const text = [pending, late].filter(Boolean).join(' · ') || 'Compromisos al día';
    return { pending, late, text };
}

export function CommitmentsStrip({ items, onPress }: { items: any[]; onPress: () => void }) {
    const label = stripLabel(items);
    if (!label) return null;
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
    text: { flex: 1 },
    title: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
    soft: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },
    late: { fontFamily: fonts.semibold, fontSize: 13, color: colors.warning },
    more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    moreText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentBright },
});
