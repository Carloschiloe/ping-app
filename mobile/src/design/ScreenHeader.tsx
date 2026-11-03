import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from './Glass';
import { colors, gradients, space } from './tokens';
import { fonts } from './typography';

// The same metallic tone for a name every time it appears.
export const avatarGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return gradients.avatar[Math.abs(hash) % gradients.avatar.length];
};

type ScreenHeaderProps = {
    title: string;
    subtitle?: string;
    onBack: () => void;
    right?: React.ReactNode;
};

// Frosted top bar for the screens you open from a chat or the chat list.
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
    const insets = useSafeAreaInsets();
    return (
        <Glass style={[styles.bar, { paddingTop: insets.top + space.xs }]} intensity={60}>
            <TouchableOpacity
                onPress={onBack}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Volver"
                hitSlop={8}
            >
                <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.titleWrap}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            {right}
        </Glass>
    );
}

// Round glass button for the right side of a ScreenHeader.
export function HeaderButton({ icon, label, onPress, disabled }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Ionicons name={icon} size={18} color={colors.text} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.sm,
        paddingBottom: space.sm + 2,
        borderWidth: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        zIndex: 10,
    },
    backBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
    titleWrap: { flex: 1, justifyContent: 'center', marginLeft: 2 },
    title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2, color: colors.text },
    subtitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 1 },
    iconBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    iconBtnDisabled: { opacity: 0.5 },
});
