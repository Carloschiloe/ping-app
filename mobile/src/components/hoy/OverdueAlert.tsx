import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAppTheme } from '../../theme/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface OverdueItem {
    id: string;
    title: string;
    due_at: string;
}

interface OverdueAlertProps {
    items: OverdueItem[];
    /** Max items shown before collapse */
    maxVisible?: number;
    onViewAll?: () => void;
}

export function OverdueAlert({ items, maxVisible = 3, onViewAll }: OverdueAlertProps) {
    const { theme } = useAppTheme();
    const [expanded, setExpanded] = useState(false);

    if (items.length === 0) return null;

    const visible = expanded ? items : items.slice(0, maxVisible);
    const hiddenCount = items.length - maxVisible;

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(e => !e);
    };

    const formatRelative = (isoDate: string): string => {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return `hoy ${format(date, 'HH:mm')}`;
        if (diffDays === 1) return `ayer ${format(date, 'HH:mm')}`;
        return `hace ${diffDays} días`;
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: `${theme.colors.warning}40` }]}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={[styles.iconBg, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                        <Ionicons name="alert-circle" size={15} color={theme.colors.warning} />
                    </View>
                    <Text style={[styles.headerTitle, { color: theme.colors.warning }]}>
                        Necesita atención ({items.length})
                    </Text>
                </View>
                {items.length > maxVisible && (
                    <TouchableOpacity onPress={toggleExpand} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={theme.colors.text.secondary}
                        />
                    </TouchableOpacity>
                )}
            </View>

            {visible.map((item, idx) => (
                <View
                    key={item.id}
                    style={[
                        styles.row,
                        idx < visible.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }
                    ]}
                >
                    <View style={[styles.warningDot, { backgroundColor: theme.colors.warning }]} />
                    <Text style={[styles.itemTitle, { color: theme.colors.text.primary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={[styles.itemTime, { color: theme.colors.text.secondary }]}>
                        {formatRelative(item.due_at)}
                    </Text>
                </View>
            ))}

            {/* In-place expand/collapse CTA */}
            {items.length > maxVisible && (
                <View style={[styles.footer, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}>
                    {!expanded ? (
                        <TouchableOpacity style={styles.expandBtn} onPress={toggleExpand}>
                            <Text style={[styles.expandText, { color: theme.colors.accent }]}>
                                Ver {hiddenCount} más
                            </Text>
                            <Ionicons name="chevron-down" size={13} color={theme.colors.accent} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.expandBtn} onPress={toggleExpand}>
                            <Text style={[styles.expandText, { color: theme.colors.text.secondary }]}>
                                Mostrar menos
                            </Text>
                            <Ionicons name="chevron-up" size={13} color={theme.colors.text.secondary} />
                        </TouchableOpacity>
                    )}

                    {onViewAll && (
                        <TouchableOpacity style={styles.navigateBtn} onPress={onViewAll}>
                            <Text style={[styles.navigateText, { color: theme.colors.accent }]}>
                                Ver todos en Compromisos
                            </Text>
                            <Ionicons name="arrow-forward" size={12} color={theme.colors.accent} />
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconBg: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    warningDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        flexShrink: 0,
    },
    itemTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
    },
    itemTime: {
        fontSize: 11,
        fontWeight: '500',
        flexShrink: 0,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    expandBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    expandText: {
        fontSize: 12,
        fontWeight: '600',
    },
    navigateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    navigateText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
