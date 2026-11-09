import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius, space } from '../../design/tokens';
import { fonts, type } from '../../design/typography';
import { Glass } from '../../design/Glass';

// The pieces Perfil and Ajustes are built from: a labelled glass card of rows,
// each with an icon, a title, an optional line under it, and a switch or arrow.

export function Section({ order, label, children }: { order: number; label?: string; children: React.ReactNode }) {
    return (
        <Reanimated.View entering={FadeInDown.delay(order * 50).duration(380)} style={kit.section}>
            {!!label && <Text style={kit.sectionLabel}>{label}</Text>}
            <View style={kit.card}>
                <Glass style={[StyleSheet.absoluteFill, kit.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                {children}
            </View>
        </Reanimated.View>
    );
}

type RowProps = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    subtitle?: string;
    divider?: boolean;
    onPress?: () => void;
    accessibilityLabel?: string;
    danger?: boolean;
    children?: React.ReactNode;
};

export function Row({ icon, title, subtitle, divider, onPress, accessibilityLabel, danger, children }: RowProps) {
    const body = (
        <>
            {divider && <View pointerEvents="none" style={kit.divider} />}
            <View style={[kit.iconBox, danger && kit.iconBoxDanger]}>
                <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.accentBright} />
            </View>
            <View style={kit.rowBody}>
                <Text style={[kit.rowTitle, danger && kit.rowTitleDanger]}>{title}</Text>
                {!!subtitle && <Text style={kit.rowSubtitle}>{subtitle}</Text>}
            </View>
            {children}
            {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={kit.chevron} />}
        </>
    );
    if (!onPress) return <View style={kit.row}>{body}</View>;
    return (
        <TouchableOpacity style={kit.row} onPress={onPress} accessibilityLabel={accessibilityLabel ?? title}>
            {body}
        </TouchableOpacity>
    );
}

export function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (value: boolean) => void }) {
    return (
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: colors.switchOff, true: colors.accent }}
            thumbColor={value ? colors.onAccent : colors.silver}
        />
    );
}

export const ICON_INSET = space.lg + 34 + space.md;

export const kit = StyleSheet.create({
    section: { marginTop: space.lg, paddingHorizontal: space.lg },
    sectionLabel: { ...type.overline, marginLeft: space.sm, marginBottom: space.sm },
    card: { borderRadius: radius.lg, overflow: 'hidden' },
    cardGlass: { borderRadius: radius.lg, borderTopColor: colors.glassEdge },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: 13,
    },
    divider: {
        position: 'absolute',
        top: 0,
        left: ICON_INSET,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
    },
    iconBox: {
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: space.md,
        backgroundColor: colors.accentTint,
    },
    iconBoxDanger: { backgroundColor: colors.dangerTint },
    rowBody: { flex: 1 },
    rowTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    rowTitleDanger: { color: colors.danger },
    rowSubtitle: { ...type.subhead, fontSize: 13, marginTop: 2 },
    rowStatus: { fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint },
    rowStatusActive: { color: colors.accentBright },
    chevron: { marginLeft: space.xs },
});
