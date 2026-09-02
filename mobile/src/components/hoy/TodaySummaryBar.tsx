import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { format } from 'date-fns';

interface TodaySummaryBarProps {
    totalToday: number;
    overdueCount: number;
    nextItemTime: string | null; // ISO string or null
    selectedDate: Date;
    isToday: boolean;
    /** Reserved for future Ping Agent briefing text (replaces default text when set) */
    agentBriefing?: string | null;
}

export function TodaySummaryBar({
    totalToday,
    overdueCount,
    nextItemTime,
    selectedDate,
    isToday,
    agentBriefing,
}: TodaySummaryBarProps) {
    const { theme } = useAppTheme();

    const buildSummary = (): string => {
        if (agentBriefing) return agentBriefing;

        if (!isToday) {
            if (totalToday === 0) return `Sin compromisos para el ${format(selectedDate, 'd MMM')}.`;
            return `${totalToday} compromiso${totalToday > 1 ? 's' : ''} programado${totalToday > 1 ? 's' : ''} para este día.`;
        }

        if (totalToday === 0 && overdueCount === 0) {
            return 'Día libre · Sin compromisos para hoy';
        }

        const parts: string[] = [];
        if (overdueCount > 0) {
            parts.push(`${overdueCount} vencida${overdueCount > 1 ? 's' : ''}`);
        }

        if (totalToday > 0) {
            parts.push(`${totalToday} para hoy`);
        } else if (overdueCount > 0) {
            parts.push('Sin compromisos programados hoy');
        }

        const summary = parts.join(' · ');

        if (nextItemTime) {
            const time = format(new Date(nextItemTime), 'HH:mm');
            return `${summary} · Próximo a las ${time}`;
        }

        return summary;
    };

    const hasUrgency = overdueCount > 0;

    return (
        <View style={[
            styles.container,
            { backgroundColor: hasUrgency ? 'rgba(245,158,11,0.08)' : theme.colors.surfaceMuted }
        ]}>
            <Ionicons
                name={hasUrgency ? 'alert-circle-outline' : 'sunny-outline'}
                size={14}
                color={hasUrgency ? theme.colors.warning : theme.colors.text.secondary}
                style={styles.icon}
            />
            <Text
                style={[
                    styles.text,
                    { color: hasUrgency ? theme.colors.warning : theme.colors.text.secondary }
                ]}
                numberOfLines={1}
            >
                {buildSummary()}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        marginHorizontal: 16,
        marginBottom: 4,
        gap: 6,
    },
    icon: {
        flexShrink: 0,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
        flex: 1,
    },
});
