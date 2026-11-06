import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAgentConversationTurns } from '../api/query-modules/agent';
import { Glass } from '../design/Glass';
import { colors, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';

function resultSummary(result: any): string {
    if (result?.kind === 'response') return result.response?.answer || 'Vorian respondió en esta conversación.';
    if (result?.kind === 'plan') return result.presentation?.summary || 'Vorian preparó una propuesta para confirmar.';
    if (result?.kind === 'clarification') return result.questions?.[0]?.question || 'Vorian necesita una aclaración.';
    if (result?.kind === 'unsupported') return result.reason || 'Vorian indicó un límite de capacidad.';
    return 'Vorian procesó esta interacción.';
}

export function PingActivityCard({ conversationId, onOpen }: { conversationId: string; onOpen: () => void }) {
    const { data } = useAgentConversationTurns(conversationId);
    const latest = data?.turns[data.turns.length - 1];

    if (!latest) return null;
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Abrir historial de Vorian"
            style={styles.wrap}
            onPress={onOpen}
            activeOpacity={0.82}
        >
            <Glass style={styles.card} intensity={40}>
                <View style={styles.iconWrap}><Ionicons name="sparkles" size={15} color={colors.accentBright} /></View>
                <View style={styles.copy}>
                    <Text style={styles.title}>Vorian en esta conversación</Text>
                    <Text style={styles.text} numberOfLines={2}>{resultSummary(latest.result)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Glass>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrap: { marginHorizontal: space.md, marginTop: space.sm + 2, marginBottom: space.xs },
    card: {
        padding: space.md - 1,
        borderRadius: radius.md,
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
        marginRight: space.sm + 1,
    },
    copy: { flex: 1 },
    title: { fontFamily: fonts.semibold, color: colors.text, fontSize: 12 },
    text: { fontFamily: fonts.regular, color: colors.textSoft, fontSize: 12, marginTop: 2 },
});
