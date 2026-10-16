import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAgentConversationTurns } from '../api/query-modules/agent';
import { useAppTheme } from '../theme/ThemeContext';

function resultSummary(result: any): string {
    if (result?.kind === 'response') return result.response?.answer || 'Ping respondió en esta conversación.';
    if (result?.kind === 'plan') return result.presentation?.summary || 'Ping preparó una propuesta para confirmar.';
    if (result?.kind === 'clarification') return result.questions?.[0]?.question || 'Ping necesita una aclaración.';
    if (result?.kind === 'unsupported') return result.reason || 'Ping indicó un límite de capacidad.';
    return 'Ping procesó esta interacción.';
}

export function PingActivityCard({ conversationId, onOpen }: { conversationId: string; onOpen: () => void }) {
    const { theme } = useAppTheme();
    const { data } = useAgentConversationTurns(conversationId);
    const latest = data?.turns[data.turns.length - 1];
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!latest) return null;
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Abrir historial de Ping"
            style={styles.card}
            onPress={onOpen}
            activeOpacity={0.82}
        >
            <View style={styles.iconWrap}><Ionicons name="sparkles" size={16} color={theme.colors.primary} /></View>
            <View style={styles.copy}>
                <Text style={styles.title}>Ping en esta conversación</Text>
                <Text style={styles.text} numberOfLines={2}>{resultSummary(latest.result)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.secondary} />
        </TouchableOpacity>
    );
}

function createStyles(theme: any) {
    return StyleSheet.create({
        card: {
            marginHorizontal: 12,
            marginTop: 10,
            marginBottom: 4,
            padding: 11,
            borderRadius: 14,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.primary,
        },
        iconWrap: {
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${theme.colors.primary}18`,
            marginRight: 9,
        },
        copy: { flex: 1 },
        title: { color: theme.colors.text.primary, fontSize: 12, fontWeight: '700' },
        text: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 2 },
    });
}
