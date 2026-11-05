import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../design/Glass';
import { colors, gradients, space } from '../design/tokens';
import { fonts } from '../design/typography';
import {
    getFreshProfileAvatarUrl,
    useProfileAvatarUrl,
} from '../hooks/useProfileAvatarUrl';

interface ChatHeaderProps {
    chatTitle: string;
    subtitle?: string | null;
    online?: boolean;
    avatarUrl?: string;
    profileId?: string;
    isGroup: boolean;
    isSelf?: boolean;
    onBack: () => void;
    onPing: () => void;
    onCommitments: () => void;
    onInfo: () => void;
    onMenu: () => void;
    onAvatarPress?: (url: string) => void;
}

// The conversation's frosted top bar: back, photo, name with a live status
// line, and the commitments, Ping and the menu on the right.
export const ChatHeader: React.FC<ChatHeaderProps> = ({
    chatTitle,
    subtitle,
    online = false,
    avatarUrl,
    profileId,
    isGroup,
    isSelf = false,
    onBack,
    onPing,
    onCommitments,
    onInfo,
    onMenu,
    onAvatarPress,
}) => {
    const insets = useSafeAreaInsets();
    const resolvedAvatarUrl = useProfileAvatarUrl(
        isGroup ? null : profileId,
        avatarUrl
    );

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

            {resolvedAvatarUrl ? (
                <TouchableOpacity
                    style={styles.avatarWrap}
                    onPress={async () => {
                        const freshUrl = await getFreshProfileAvatarUrl(
                            isGroup ? null : profileId,
                            avatarUrl
                        );
                        if (freshUrl) onAvatarPress?.(freshUrl);
                    }}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="Ver foto de perfil"
                >
                    <CachedImage uri={resolvedAvatarUrl} style={styles.avatar} />
                    {online && <View style={styles.onlineDot} />}
                </TouchableOpacity>
            ) : (
                <View style={styles.avatarWrap}>
                    <LinearGradient colors={gradients.avatar[0]} style={styles.avatar}>
                        <Ionicons name={isSelf ? 'bookmark' : isGroup ? 'people' : 'person'} size={18} color={colors.silver} />
                    </LinearGradient>
                    {online && <View style={styles.onlineDot} />}
                </View>
            )}

            <TouchableOpacity style={styles.titleWrap} onPress={onInfo} activeOpacity={0.7}>
                <Text style={styles.title} numberOfLines={1}>{chatTitle}</Text>
                {subtitle ? (
                    <Text style={[styles.subtitle, online && styles.subtitleOnline]} numberOfLines={1}>{subtitle}</Text>
                ) : null}
            </TouchableOpacity>

            <TouchableOpacity
                onPress={onCommitments}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Ver los compromisos de esta conversación"
            >
                <Ionicons name="checkmark-done-outline" size={19} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onPing}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Hablar con Ping en esta conversación"
            >
                <Ionicons name="sparkles" size={18} color={colors.accentBright} />
            </TouchableOpacity>
            <TouchableOpacity
                onPress={onMenu}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Más opciones"
            >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
            </TouchableOpacity>
        </Glass>
    );
};

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
    avatarWrap: { width: 40, height: 40 },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    onlineDot: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 13,
        height: 13,
        borderRadius: 7,
        backgroundColor: colors.online,
        borderWidth: 2.5,
        borderColor: colors.ink,
    },
    titleWrap: { flex: 1, justifyContent: 'center', marginLeft: 2 },
    title: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.2, color: colors.text },
    subtitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 1 },
    subtitleOnline: { color: colors.online },
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
});
