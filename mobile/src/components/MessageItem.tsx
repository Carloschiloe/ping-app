import React, { memo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Image, Animated, Linking, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import AudioPlayer from './AudioPlayer';
import GroupTaskCard from './GroupTaskCard';
import { useAppTheme } from '../theme/ThemeContext';

function buildMapUrl(latitude: number, longitude: number) {
    const query = `${latitude},${longitude}`;
    if (Platform.OS === 'ios') {
        return `http://maps.apple.com/?ll=${query}`;
    }

    return `geo:${query}?q=${query}`;
}

interface MessageItemProps {
    item: any;
    user: any;
    isGroup: boolean;
    isMultiSelecting: boolean;
    isSelected: boolean;
    highlightedMsgId: string | null;
    groupTasks: any[];
    onPress: (item: any) => void;
    onLongPress: (item: any) => void;
    onToggleSelect: (id: string) => void;
    onSwipeLeft: (item: any) => void;
    onViewReactions: (item: any) => void;
    formatTime: (iso: string) => string;
    avatarColor: (str: string) => string;
    swipeableRowRefs: React.MutableRefObject<Map<string, any>>;
    groupParticipants?: any[];
    conversationMode?: 'chat' | 'operation';
    activeCommitmentId?: string | null;
}

const MessageItemComponent = ({
    item, user, isGroup, isMultiSelecting, isSelected,
    highlightedMsgId, groupTasks, onPress, onLongPress,
    onToggleSelect, onSwipeLeft, onViewReactions,
    formatTime, avatarColor, swipeableRowRefs, groupParticipants = [], conversationMode = 'chat', activeCommitmentId = null
}: MessageItemProps) => {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    if (item.type === 'divider') {
        return (
            <View style={styles.dateDivider}>
                <Text style={styles.dateDividerText}>{item.date}</Text>
            </View>
        );
    }

    const isSystem = item.meta?.isSystem;
    const isMe = item.sender_id === user?.id && !isSystem;
    const isOperationMode = conversationMode === 'operation';
    const time = formatTime(item.created_at);
    const msgText: string = item.text || '';

    if (isSystem) {
        const completion = item.meta?.operationCompletion;
        if (item.meta?.messageType === 'operation_completion' && completion) {
            const outcomeMap: Record<string, string> = {
                resolved: 'Resuelto',
                pending_followup: 'Queda pendiente',
                needs_review: 'Requiere revision',
            };

            return (
                <View style={styles.systemWrap}>
                    <View style={styles.systemBubbleSpecial}>
                        <View style={styles.systemBadge}>
                            <Text style={styles.systemBadgeText}>Sistema</Text>
                        </View>
                        <Text style={styles.systemText}>{msgText}</Text>
                        <TouchableOpacity
                            style={styles.systemActionChip}
                            onPress={() => {
                                Alert.alert(
                                    'Cierre de tarea',
                                    [
                                        `Cerro: ${completion.completed_by_name || 'Alguien'}`,
                                        `Resultado: ${outcomeMap[completion.outcome] || 'Resuelto'}`,
                                        `Hora: ${formatTime(completion.completed_at || item.created_at)}`,
                                        completion.note ? `Observacion: ${completion.note}` : 'Sin observacion final',
                                    ].join('\n')
                                );
                            }}
                        >
                            <Text style={styles.systemActionChipText}>Ver cierre</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.systemWrap}>
                <View style={styles.systemBubble}>
                    <View style={styles.systemBadge}>
                        <Text style={styles.systemBadgeText}>Sistema</Text>
                    </View>
                    <Text style={styles.systemText}>{msgText}</Text>
                </View>
            </View>
        );
    }

    const trimmedText = msgText.trim();
    let isImage = trimmedText.startsWith('[imagen]');
    const isAudio = trimmedText.startsWith('[audio]');
    let isVideo = trimmedText.startsWith('[video]');
    const isDocument = trimmedText.startsWith('[document=');
    const isLocationShare = item.meta?.messageType === 'location_share';

    let mediaUrl = null;
    let documentName = '';

    let description = '';
    const extractUrlAndDescription = (text: string, prefixLength: number) => {
        const full = text.slice(prefixLength).trim();
        // Buscamos el primer espacio o el primer salto de línea
        const match = full.match(/^([^\s\n]+)[\s\n]*([\s\S]*)$/);
        if (!match) return { url: full, desc: '' };
        return { url: match[1], desc: match[2].trim() };
    };

    if (isImage) {
        const res = extractUrlAndDescription(msgText, 8);
        mediaUrl = res.url;
        description = res.desc;
    } else if (isAudio) {
        const res = extractUrlAndDescription(msgText, 7);
        mediaUrl = res.url;
        description = res.desc;
    } else if (isVideo) {
        const res = extractUrlAndDescription(msgText, 7);
        mediaUrl = res.url;
        description = res.desc;
    } else if (isDocument) {
        const match = msgText.match(/^\[document=([^\]]+)\](.*)$/);
        if (match) {
            documentName = match[1];
            const fullRest = match[2];
            const firstSpace = fullRest.indexOf(' ');
            if (firstSpace === -1) mediaUrl = fullRest;
            else {
                mediaUrl = fullRest.slice(0, firstSpace);
                description = fullRest.slice(firstSpace + 1);
            }
        }
    }

    if (isImage && mediaUrl && (mediaUrl.toLowerCase().includes('.mp4') || mediaUrl.toLowerCase().includes('.mov'))) {
        isImage = false;
        isVideo = true;
    }

    const closeSwipeable = () => {
        if (item.id && swipeableRowRefs.current.has(item.id)) {
            swipeableRowRefs.current.get(item.id)?.close();
        }
    };

    const renderLeftActions = (progress: any, dragX: any) => {
        const trans = dragX.interpolate({
            inputRange: [0, 50, 100, 101],
            outputRange: [-20, 0, 0, 1],
        });
        return (
            <View style={{ width: 60, justifyContent: 'center', alignItems: 'center' }}>
                <Animated.View style={{ transform: [{ translateX: trans }], width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="arrow-undo" size={18} color={theme.colors.text.secondary} />
                </Animated.View>
            </View>
        );
    };

    return (
        <Swipeable
            key={item.id}
            ref={ref => {
                if (ref && !swipeableRowRefs.current.has(item.id)) {
                    swipeableRowRefs.current.set(item.id, ref);
                }
            }}
            friction={2}
            leftThreshold={40}
            renderLeftActions={renderLeftActions}
            onSwipeableOpen={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSwipeLeft(item);
                closeSwipeable();
            }}
        >
            <View>
                <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { marginBottom: (item.message_reactions?.length > 0) ? 6 : 2 }]}> 
                {isMultiSelecting && (
                    <TouchableOpacity onPress={() => onToggleSelect(item.id)} style={styles.checkbox}>
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color={theme.colors.white} />}
                        </View>
                    </TouchableOpacity>
                )}

                {!isMe && !isSystem && (
                    <View style={styles.senderAvatarContainer}>
                        {(() => {
                            const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
                            const avatarUrl = p?.avatar_url;
                            const email = p?.email || '';
                            const fullName = p?.full_name;

                            let initialsString = '?';
                            if (fullName) {
                                const parts = fullName.trim().split(/\s+/);
                                if (parts.length >= 2) initialsString = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                else initialsString = parts[0].substring(0, 2).toUpperCase();
                            } else {
                                initialsString = email.substring(0, 2).toUpperCase();
                            }

                            const color = avatarColor(email || 'user');

                            return avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.senderAvatar} />
                            ) : (
                                <View style={[styles.senderAvatar, { backgroundColor: color, justifyContent: 'center', alignItems: 'center' }]}>
                                    <Text style={styles.senderAvatarText}>{initialsString}</Text>
                                </View>
                            );
                        })()}
                    </View>
                )}

                <View style={{ maxWidth: '68%', position: 'relative' }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onPress(item)}
                        onLongPress={() => onLongPress(item)}
                        delayLongPress={350}
                        style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            isOperationMode && (isMe ? styles.bubbleOperationMe : styles.bubbleOperationThem),
                            (isImage || isVideo || isAudio) && styles.bubbleMedia,
                            isSelected && styles.bubbleSelected,
                            item.id === highlightedMsgId && styles.bubbleHighlighted,
                            { overflow: 'hidden' }
                        ]}
                    >
                        {/* ─── Quoted Message (Reply) ─── */}
                        {item.reply_to && !Array.isArray(item.reply_to) && (
                            <View style={[styles.quotedContainer, isMe ? styles.quotedMe : styles.quotedThem]}>
                                <Text style={[styles.quotedName, isMe ? { color: theme.colors.white } : { color: theme.colors.secondary }]} numberOfLines={1}>
                                    {(() => {
                                        const p = Array.isArray(item.reply_to.profiles) ? item.reply_to.profiles[0] : item.reply_to.profiles;
                                        return p?.full_name || (p?.email || 'Usuario').split('@')[0];
                                    })()}
                                </Text>
                                <Text style={[styles.quotedText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: theme.colors.text.secondary }]} numberOfLines={1}>
                                    {item.reply_to.text || 'Sin texto'}
                                </Text>
                            </View>
                        )}

                        {!isMe && !isSystem && isGroup && (
                            <Text style={[styles.senderName, item.reply_to && { marginTop: -2, marginBottom: 0 }]} numberOfLines={1}>
                                {(() => {
                                    const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
                                    return p?.full_name || (p?.email || 'Miembro').split('@')[0];
                                })()}
                            </Text>
                        )}

                        {isImage && mediaUrl ? (
                            <View>
                                <Image
                                    source={{ uri: mediaUrl as string }}
                                    style={styles.msgImage}
                                    resizeMode="cover"
                                />
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { padding: 8, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isVideo && mediaUrl ? (
                            <View>
                                <View style={styles.inlineVideoWrap} pointerEvents="none">
                                    <Video
                                        source={{ uri: mediaUrl as string }}
                                        style={styles.msgImage}
                                        useNativeControls={false}
                                        shouldPlay={false}
                                        isMuted={true}
                                        resizeMode={ResizeMode.COVER}
                                    />
                                    <View style={styles.videoPlayOverlay}>
                                        <Ionicons name="play-circle" size={48} color={theme.colors.white} />
                                    </View>
                                </View>
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { padding: 8, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isAudio && mediaUrl ? (
                            <View>
                                <AudioPlayer url={mediaUrl as string} isMe={isMe} />
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13, opacity: 0.8 }]}>{description}</Text> : null}
                            </View>
                        ) : isDocument && mediaUrl ? (
                            <View>
                                <View style={styles.documentBubble}>
                                    <View style={[styles.docIconWrap, isMe ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: theme.colors.background }]}>
                                        <Ionicons name="document-text" size={24} color={isMe ? theme.colors.white : theme.colors.text.secondary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '500' }]} numberOfLines={1}>{documentName}</Text>
                                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontSize: 10 }]}>Documento</Text>
                                    </View>
                                </View>
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { paddingHorizontal: 8, paddingBottom: 4, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isLocationShare ? (
                            <TouchableOpacity
                                style={styles.locationCard}
                                onPress={async () => {
                                    const location = item.meta?.location;
                                    if (!location?.latitude || !location?.longitude) return;
                                    const nativeUrl = buildMapUrl(location.latitude, location.longitude);
                                    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
                                    const targetUrl = await Linking.canOpenURL(nativeUrl) ? nativeUrl : googleUrl;
                                    Linking.openURL(targetUrl);
                                }}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.locationIconWrap, isMe ? styles.locationIconWrapMe : styles.locationIconWrapThem]}>
                                    <Ionicons name="location" size={18} color={isMe ? theme.colors.white : '#2563eb'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '700' }]} numberOfLines={1}>
                                        {item.meta?.location?.label || 'Ubicacion compartida'}
                                    </Text>
                                    <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { marginTop: 2 }]}>Abrir en mapa</Text>
                                </View>
                            </TouchableOpacity>
                        ) : (
                            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, isOperationMode && styles.msgTextOperation]}>
                                {msgText}
                            </Text>
                        )}
                        <View style={styles.metaRow}>
                            {item.reply_to_id && <Text style={{ fontSize: 8, color: isMe ? 'rgba(255,255,255,0.5)' : theme.colors.text.muted, marginRight: 4 }}>R</Text>}
                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>{time}</Text>
                            {isMe && (
                                <View style={{ marginLeft: 4 }}>
                            {item.status === 'pending_offline' ? (
                                <Ionicons
                                    name="time-outline"
                                    size={14}
                                    color="rgba(255,255,255,0.6)"
                                />
                            ) : (
                                <Ionicons
                                    name={(item.status === 'sent' || item.status === 'pending' || !item.status) ? 'checkmark' : 'checkmark-done'}
                                    size={14}
                                    color={item.status === 'read' ? '#34b7f1' : ((item.status === 'delivered' || item.status === 'received') ? theme.colors.text.muted : 'rgba(0,0,0,0.4)')}
                                />
                            )}
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>

                    {/* ─── Reactions ─── */}
                    {item.message_reactions && item.message_reactions.length > 0 && (
                        <View style={[styles.reactionsContainer, isMe ? styles.reactionsMe : styles.reactionsThem]}>
                            {(() => {
                                const counts = item.message_reactions.reduce((acc: any, r: any) => {
                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                    return acc;
                                }, {});
                                return Object.keys(counts).map(emoji => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={styles.reactionPill}
                                        onPress={() => onViewReactions(item)}
                                    >
                                        <Text style={{ fontSize: 13 }}>{emoji}</Text>
                                        {counts[emoji] > 1 && <Text style={styles.reactionCount}>{counts[emoji]}</Text>}
                                    </TouchableOpacity>
                                ));
                            })()}
                        </View>
                    )}
                    {/* ─── AI Suggestion Chip ─── */}
                    {item.meta?.suggestedTask && (
                        <TouchableOpacity
                            style={[styles.suggestionChip, isMe && { alignSelf: 'flex-end' }]}
                            onPress={() => {
                                onPress({ ...item, _isSuggestionTap: true });
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.suggestionIcon}>✨</Text>
                            <Text style={styles.suggestionText} numberOfLines={1}>
                                ¿Agendar: {item.meta.suggestedTask.title}?
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {highlightedMsgId === item.id && (
                    <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: 12 }} />
                )}
            </View>{(() => {
                const tasks = groupTasks.filter((t: any) => t.message_id === item.id);
                if (tasks.length === 0) return null;

                const myTask = tasks.find((t: any) => t.assigned_to_user_id === user?.id);
                const displayTask = myTask || tasks[0];

                return (
                    <GroupTaskCard 
                        key={displayTask.id} 
                        commitment={{ 
                            ...displayTask, 
                            _isEveryoneSummary: !myTask && tasks.length > 1 
                        }} 
                        conversationId={item.conversation_id}
                        groupParticipants={groupParticipants}
                        conversationMode={conversationMode}
                        activeCommitmentId={activeCommitmentId}
                    />
                );
            })()}
            </View>
        </Swipeable>
    );
};

export const MessageItem = memo(MessageItemComponent, (prev, next) => {
    return (
        prev.item.id === next.item.id &&
        prev.isSelected === next.isSelected &&
        prev.isMultiSelecting === next.isMultiSelecting &&
        prev.highlightedMsgId === next.highlightedMsgId &&
        prev.item.status === next.item.status &&
        JSON.stringify(prev.item.message_reactions) === JSON.stringify(next.item.message_reactions) &&
        // EXTREMELY CRITICAL: Deep check for changes in Meta or Tasks
        JSON.stringify(prev.item.meta) === JSON.stringify(next.item.meta) &&
        prev.conversationMode === next.conversationMode &&
        prev.activeCommitmentId === next.activeCommitmentId &&
        prev.groupTasks === next.groupTasks &&
        prev.groupParticipants === next.groupParticipants
    );
});

export default MessageItem;

const createStyles = (theme: any) => StyleSheet.create({
    dateDivider: { alignItems: 'center', marginVertical: theme.spacing.sm + 2 },
    dateDividerText: {
        backgroundColor: theme.colors.surfaceMuted,
        color: theme.colors.text.muted,
        fontSize: 11,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        overflow: 'hidden',
        fontWeight: '600',
    },
    msgRow: { marginVertical: 4, flexDirection: 'row' },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: {
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingTop: 9,
        paddingBottom: 8,
    },
    bubbleMe: { backgroundColor: theme.colors.bubbleMe, borderBottomRightRadius: 4, borderWidth: theme.isDark ? 0 : 1, borderColor: theme.colors.separator },
    bubbleThem: { backgroundColor: theme.colors.bubbleThem, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.separator },
    bubbleOperationMe: { backgroundColor: theme.isDark ? '#123b2b' : '#eef6ff', borderColor: theme.isDark ? '#1f3f35' : '#dbeafe' },
    bubbleOperationThem: { backgroundColor: theme.isDark ? '#121c2a' : '#f8fafc', borderColor: theme.isDark ? '#1e2a3a' : '#e2e8f0' },
    bubbleHighlighted: { backgroundColor: theme.isDark ? '#183b63' : '#bfdbfe' },
    senderAvatarContainer: {
        width: 32, height: 32, marginRight: 8, alignSelf: 'flex-end', marginBottom: 2,
    },
    senderAvatar: { width: 32, height: 32, borderRadius: 16 },
    senderAvatarText: { color: theme.colors.white, fontSize: 12, fontWeight: '700' },
    bubbleMedia: { padding: 3, overflow: 'hidden' },
    senderName: { fontSize: 12, fontWeight: '700', color: theme.colors.success, marginBottom: 2, paddingHorizontal: 8, paddingTop: 4 },
    msgText: { fontSize: 15, lineHeight: 24 },
    msgTextMe: { color: theme.colors.bubbleTextMe },
    msgTextThem: { color: theme.colors.bubbleTextThem },
    msgTextOperation: { letterSpacing: 0.1 },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3, paddingHorizontal: 4 },
    timeText: { fontSize: 11 },
    timeMe: { color: 'rgba(0,0,0,0.5)' },
    timeThem: { color: theme.colors.text.muted },
    msgImage: { width: 220, height: 220, borderRadius: 10 },
    inlineVideoWrap: { position: 'relative', width: 220, height: 220, borderRadius: 10, overflow: 'hidden' },
    videoPlayOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    documentBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 200, maxWidth: 260, paddingVertical: 4, paddingRight: 8 },
    locationCard: { flexDirection: 'row', alignItems: 'center', minWidth: 200, maxWidth: 260, gap: 10 },
    locationIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    locationIconWrapMe: { backgroundColor: 'rgba(255,255,255,0.2)' },
    locationIconWrapThem: { backgroundColor: theme.colors.accentSoft },
    docIconWrap: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    systemWrap: { alignItems: 'center', marginVertical: 6 },
    systemBubble: {
        backgroundColor: theme.colors.surfaceMuted, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 6,
        borderWidth: 1, borderColor: theme.colors.separator, maxWidth: '90%',
    },
    systemBadge: {
        alignSelf: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.separator,
        marginBottom: 6,
    },
    systemBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    systemBubbleSpecial: {
        backgroundColor: theme.colors.surfaceElevated, borderRadius: 14,
        paddingHorizontal: 14, paddingVertical: 8,
        borderWidth: 1, borderColor: theme.colors.separator, maxWidth: '92%',
        alignItems: 'center',
        gap: 6,
    },
    systemText: { fontSize: 12.5, color: theme.colors.text.secondary, textAlign: 'center', fontWeight: '500' },
    systemActionChip: {
        backgroundColor: theme.colors.accentSoft,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    systemActionChipText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontWeight: '700',
    },
    checkbox: { justifyContent: 'center', paddingRight: 8, paddingLeft: 2 },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: theme.colors.separator,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
    },
    checkCircleOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    bubbleSelected: { opacity: 0.9 },
    quotedContainer: { padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3 },
    quotedMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: theme.colors.white },
    quotedThem: { backgroundColor: theme.colors.background, borderLeftColor: theme.colors.secondary },
    quotedName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
    quotedText: { fontSize: 12 },
    reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2, marginBottom: 2 },
    reactionsMe: { alignSelf: 'flex-end' },
    reactionsThem: { alignSelf: 'flex-start' },
    reactionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceMuted, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: theme.colors.separator, gap: 2 },
    reactionCount: { fontSize: 11, fontWeight: '700', color: theme.colors.text.secondary },
    suggestionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.accentSoft,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 6,
        marginBottom: 4,
        borderWidth: 1.5,
        borderColor: theme.colors.accent,
        alignSelf: 'flex-start',
        maxWidth: '100%',
        shadowColor: theme.colors.accent,
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    suggestionIcon: {
        fontSize: 14,
        marginRight: 6,
    },
    suggestionText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.isDark ? '#dbe7ff' : '#312e81',
    },
});
