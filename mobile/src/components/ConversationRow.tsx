import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
// `Pressable` from react-native-gesture-handler (not core react-native) — this row lives
// inside a `Swipeable`, whose pan/tap recognition runs entirely on RNGH's native gesture
// manager. Core RN's touchables use the legacy JS responder system, a separate,
// uncoordinated touch pipeline; nesting them inside Swipeable's gesture tree makes the
// swipe gesture intermittently fail to activate. RNGH's Pressable is accounted for by the
// same manager Swipeable uses, removing the dual-system race entirely.
import { Pressable } from 'react-native-gesture-handler';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { deriveIsGroup, deriveIsSelf } from '../utils/conversationCompat';
import { resolveMessageMetadata } from '../utils/messageCompat';
import {
    getFreshProfileAvatarUrl,
    useProfileAvatarUrl,
} from '../hooks/useProfileAvatarUrl';
import { DeliveryTicks } from './chat/DeliveryTicks';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';

const AVATAR_SIZE = 52;

const avatarInitials = (email?: string) => {
    if (!email) return '?';
    return email.substring(0, 2).toUpperCase();
};

const avatarGradient = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return gradients.avatar[Math.abs(hash) % gradients.avatar.length];
};

type ConversationRowProps = {
    item: any;
    userId?: string;
    typingUsers: Record<string, { name: string; isRecording: boolean }[]>;
    onPress: () => void;
    onAvatarPress?: (url: string) => void;
    formatTime: (iso: string) => string;
    isOnline: (lastSeen?: string) => boolean;
    pinned?: boolean;
    previewOverride?: string;
};

export const ConversationRow = React.memo(function ConversationRow({ item, userId, typingUsers, onPress, onAvatarPress, formatTime, isOnline, pinned = false, previewOverride }: ConversationRowProps) {
    const isGroup = deriveIsGroup(item);
    const isSelf = deriveIsSelf(item);
    const otherUser = item.otherUser;
    const groupMeta = item.groupMetadata;
    const lastMsg = item.lastMessage;
    const isSystem = resolveMessageMetadata(lastMsg)?.isSystem;
    const isByMe = lastMsg && lastMsg.sender_id === userId;
    const unreadCount = item.unreadCount || 0;
    // isUnread drives visual weight and includes the manual "mark as unread"
    // preference; the numeric badge stays keyed to unreadCount alone so a
    // manually-flagged, fully-read conversation never shows a fabricated count.
    const isUnread = unreadCount > 0 || !!item.manuallyUnread;
    const typers = typingUsers[item.id] || [];
    const isTyping = typers.length > 0;
    const isOperation = item.mode === 'operation';

    let displayName = 'Chat';
    let initials = '?';
    let colorStr = 'chat';
    let avatarUrl: string | null = null;
    let online = false;

    if (isSelf) {
        displayName = 'Para mí';
        initials = 'PM';
        colorStr = 'para-mi';
    } else if (isGroup && groupMeta) {
        displayName = groupMeta.name;
        colorStr = groupMeta.name;
        avatarUrl = groupMeta.avatar_url;
        const words = groupMeta.name.split(' ').filter((w: string) => w.length > 0);
        if (words.length >= 2) initials = (words[0][0] + words[1][0]).toUpperCase();
        else initials = groupMeta.name.substring(0, 2).toUpperCase();
    } else if (otherUser) {
        displayName = otherUser.full_name || otherUser.email?.split('@')[0] || 'Usuario';
        colorStr = otherUser.email || 'user';
        avatarUrl = otherUser.avatar_url;
        online = isOnline(otherUser.last_seen);
        if (otherUser.full_name) {
            const parts = otherUser.full_name.trim().split(/\s+/).filter((p: string) => p.length > 0);
            if (parts.length >= 2) initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            else if (parts.length === 1) initials = parts[0].substring(0, 2).toUpperCase();
        } else {
            initials = avatarInitials(otherUser.email);
        }
    }

    const resolvedAvatarUrl = useProfileAvatarUrl(
        !isSelf && !isGroup ? otherUser?.id : null,
        avatarUrl
    );
    const preview = previewOverride ?? (isTyping
        ? (typers[0].isRecording ? 'Grabando audio…' : 'Escribiendo…')
        : (lastMsg && !isSystem ? lastMsg.text : 'Sin mensajes aún'));

    const press = useSharedValue(0);
    const pressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 - press.value * 0.02 }],
        backgroundColor: interpolateColor(press.value, [0, 1], ['rgba(255,255,255,0)', colors.glassPressed]),
    }));

    const ticks = (() => {
        if (isTyping || !isByMe || !lastMsg) return null;
        if (lastMsg.status === 'pending_offline') return <Ionicons name="time-outline" size={15} color={colors.textFaint} style={styles.tickGap} />;
        const state = lastMsg.status === 'read' ? 'read'
            : (lastMsg.status === 'delivered' || lastMsg.status === 'received') ? 'delivered' : 'sent';
        return <View style={styles.tickGap}><DeliveryTicks state={state} /></View>;
    })();

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => { press.value = withSpring(1, { damping: 20 }); }}
            onPressOut={() => { press.value = withSpring(0, { damping: 20 }); }}
            accessibilityRole="button"
            accessibilityLabel={pinned ? `Para mí, conversación fijada` : `Abrir conversación con ${displayName}`}
        >
            <Animated.View style={[styles.row, pressStyle]}>
                <Pressable
                    style={styles.avatarWrap}
                    onPress={async () => {
                        const freshUrl = await getFreshProfileAvatarUrl(
                            !isSelf && !isGroup ? otherUser?.id : null,
                            avatarUrl
                        );
                        if (freshUrl) onAvatarPress?.(freshUrl);
                    }}
                    disabled={!resolvedAvatarUrl}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="Ver foto de perfil"
                >
                    <View style={[styles.avatar, isOperation && styles.avatarOperation]}>
                        {resolvedAvatarUrl ? (
                            <Image source={{ uri: resolvedAvatarUrl }} style={styles.avatarImage} />
                        ) : (
                            <LinearGradient colors={avatarGradient(colorStr)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill}>
                                {isSelf
                                    ? <Ionicons name="bookmark" size={20} color={colors.accentBright} />
                                    : <Text style={styles.avatarText}>{initials}</Text>}
                            </LinearGradient>
                        )}
                    </View>
                    {online && <View style={styles.onlineDot} />}
                </Pressable>

                <View style={styles.info}>
                    <View style={styles.topRow}>
                        <View style={styles.nameRow}>
                            <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>{displayName}</Text>
                            {pinned && <Ionicons name="pin" size={13} color={colors.textFaint} style={styles.pin} />}
                        </View>
                        {lastMsg && <Text style={[styles.time, isUnread && styles.timeUnread]}>{formatTime(lastMsg.created_at)}</Text>}
                    </View>
                    <View style={styles.bottomRow}>
                        <View style={styles.previewWrap}>
                            {ticks}
                            <Text style={[styles.preview, isUnread && styles.previewUnread, isTyping && styles.previewTyping]} numberOfLines={1}>{preview}</Text>
                        </View>
                        {unreadCount > 0 ? (
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
                                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                            </LinearGradient>
                        ) : isUnread ? <View style={styles.unreadDot} /> : null}
                    </View>
                </View>
            </Animated.View>
        </Pressable>
    );
});

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
        gap: 14,
    },
    avatarWrap: { position: 'relative' },
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: 18, overflow: 'hidden' },
    avatarOperation: { borderWidth: 1.5, borderColor: colors.accent },
    avatarFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { fontFamily: fonts.bold, fontSize: 17, color: colors.silver, letterSpacing: 0.5 },
    onlineDot: {
        position: 'absolute', right: -2, bottom: -2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.ink,
    },
    info: {
        flex: 1,
        paddingVertical: 2,
    },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: space.sm },
    name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, flexShrink: 1, letterSpacing: -0.2 },
    nameUnread: { fontFamily: fonts.extrabold },
    pin: { marginLeft: 6 },
    time: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint },
    timeUnread: { fontFamily: fonts.bold, color: colors.accentBright },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    previewWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: space.md },
    tickGap: { marginRight: 5 },
    preview: { fontFamily: fonts.regular, fontSize: 14, color: colors.textFaint, flexShrink: 1 },
    previewUnread: { fontFamily: fonts.semibold, color: colors.textSoft },
    previewTyping: { fontFamily: fonts.semibold, color: colors.accentBright },
    badge: { minWidth: 22, height: 22, borderRadius: radius.full, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
    badgeText: { fontFamily: fonts.extrabold, fontSize: 11.5, color: colors.onAccent },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
