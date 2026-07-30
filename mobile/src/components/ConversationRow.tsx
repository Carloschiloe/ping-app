import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { deriveIsGroup, deriveIsSelf } from '../utils/conversationCompat';
import { resolveMessageMetadata } from '../utils/messageCompat';
import {
    getFreshProfileAvatarUrl,
    useProfileAvatarUrl,
} from '../hooks/useProfileAvatarUrl';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

const avatarInitials = (email?: string) => {
    if (!email) return '?';
    return email.substring(0, 2).toUpperCase();
};

const avatarColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
};

type ConversationRowProps = {
    item: any;
    userId?: string;
    typingUsers: Record<string, { name: string; isRecording: boolean }[]>;
    onPress: () => void;
    onAvatarPress?: (url: string) => void;
    formatTime: (iso: string) => string;
    isOnline: (lastSeen?: string) => boolean;
    styles: any;
    theme: any;
};

export function ConversationRow({ item, userId, typingUsers, onPress, onAvatarPress, formatTime, isOnline, styles, theme }: ConversationRowProps) {
    const isGroup = deriveIsGroup(item);
    const isSelf = deriveIsSelf(item);
    const otherUser = item.otherUser;
    const groupMeta = item.groupMetadata;
    const lastMsg = item.lastMessage;
    const isSystem = resolveMessageMetadata(lastMsg)?.isSystem;
    const isByMe = lastMsg && lastMsg.sender_id === userId;
    const unreadCount = item.unreadCount || 0;
    const isUnread = unreadCount > 0;
    const typers = typingUsers[item.id] || [];
    const isTyping = typers.length > 0;
    const isOperation = item.mode === 'operation';
    const indicatorOffset = isOperation ? 16 : 14;

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
    const color = avatarColor(colorStr);
    const preview = isTyping
        ? (typers[0].isRecording ? 'Grabando audio…' : 'Escribiendo…')
        : (lastMsg ? (isSystem ? `Sistema · ${lastMsg.text}` : lastMsg.text) : 'Sin mensajes aún');

    return (
        <TouchableOpacity
            style={[styles.row, isUnread && styles.rowUnread]}
            activeOpacity={0.6}
            onPress={onPress}
        >
            <TouchableOpacity
                style={styles.avatarContainer}
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
                {isOperation ? (
                    <View style={styles.avatarOperationWrap}>
                        <View style={styles.avatarOperationInner}>
                            <View style={[styles.avatarSm, !resolvedAvatarUrl && { backgroundColor: color }]}>
                                {resolvedAvatarUrl ? (
                                    <Image source={{ uri: resolvedAvatarUrl }} style={styles.avatarImageSm} />
                                ) : (
                                    <Text style={styles.avatarTextSm}>{initials}</Text>
                                )}
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.avatar, !resolvedAvatarUrl && { backgroundColor: color }]}>
                        {resolvedAvatarUrl ? <Image source={{ uri: resolvedAvatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
                    </View>
                )}
                {online && <View style={[styles.onlineDot, { right: indicatorOffset }]} />}
                {isUnread && !online && <View style={[styles.unreadIndicator, { right: indicatorOffset }]} />}
                {isUnread && online && <View style={[styles.unreadIndicator, { right: indicatorOffset + 14 }]} />}
            </TouchableOpacity>
            <View style={styles.info}>
                <View style={styles.topRow}>
                    <Text style={[styles.name, isUnread && styles.nameUnread]} numberOfLines={1}>{displayName}</Text>
                    {lastMsg && <Text style={[styles.time, isUnread && styles.timeUnread]}>{formatTime(lastMsg.created_at)}</Text>}
                </View>
                <View style={styles.bottomRow}>
                    <View style={styles.previewWrap}>
                        {!isTyping && isByMe && lastMsg && (() => {
                            const status = lastMsg.status;
                            if (status === 'pending_offline') {
                                return <Ionicons name="time-outline" size={18} color="#94a3b8" style={{ marginRight: 6 }} />;
                            }
                            const isRead = status === 'read';
                            const isDelivered = status === 'delivered' || status === 'received' || status === 'read';
                            return (
                                <Ionicons
                                    name={isDelivered ? 'checkmark-done' : 'checkmark'}
                                    size={18}
                                    color={isRead ? '#3b82f6' : '#94a3b8'}
                                    style={{ marginRight: 6 }}
                                />
                            );
                        })()}
                        <Text style={[styles.preview, isUnread && styles.previewUnread, isTyping && styles.previewTyping]} numberOfLines={1}>{preview}</Text>
                    </View>
                    {isUnread && (
                        <LinearGradient colors={['#6366f1', '#8b5cf6']} style={styles.unreadBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                            <Text style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </LinearGradient>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}
