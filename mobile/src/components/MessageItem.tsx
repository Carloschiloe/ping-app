import React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Image, Animated, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import AudioPlayer from './AudioPlayer';
import GroupTaskCard from './GroupTaskCard';

// ─── Constants (Matched with ChatScreen) ───
const BUBBLE_BLUE = '#005c4b';

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
}

const MessageItem = ({
    item, user, isGroup, isMultiSelecting, isSelected,
    highlightedMsgId, groupTasks, onPress, onLongPress,
    onToggleSelect, onSwipeLeft, onViewReactions,
    formatTime, avatarColor, swipeableRowRefs
}: MessageItemProps) => {

    if (item.type === 'divider') {
        return (
            <View style={styles.dateDivider}>
                <Text style={styles.dateDividerText}>{item.date}</Text>
            </View>
        );
    }

    const isSystem = item.meta?.isSystem;
    const isMe = (item.sender_id || item.user_id) === user?.id && !isSystem;
    const time = formatTime(item.created_at);
    const msgText: string = item.text || '';

    if (isSystem) {
        return (
            <View style={styles.systemWrap}>
                <View style={styles.systemBubble}>
                    <Text style={styles.systemText}>{msgText}</Text>
                </View>
            </View>
        );
    }

    let isImage = msgText.startsWith('[imagen]');
    const isAudio = msgText.startsWith('[audio]');
    let isVideo = msgText.startsWith('[video]');
    const isDocument = msgText.startsWith('[document=');

    let mediaUrl = null;
    let documentName = '';

    let description = '';
    const extractUrlAndDescription = (text: string, prefixLength: number) => {
        const full = text.slice(prefixLength);
        const firstSpace = full.indexOf(' ');
        if (firstSpace === -1) return { url: full, desc: '' };
        return { url: full.slice(0, firstSpace), desc: full.slice(firstSpace + 1) };
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
                    <Ionicons name="arrow-undo" size={18} color="#6b7280" />
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
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { marginBottom: (item.message_reactions?.length > 0) ? 14 : 2 }]}>
                {isMultiSelecting && (
                    <TouchableOpacity onPress={() => onToggleSelect(item.id)} style={styles.checkbox}>
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
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

                <View style={{ maxWidth: '75%', position: 'relative' }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onPress(item)}
                        onLongPress={() => onLongPress(item)}
                        delayLongPress={350}
                        style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            (isImage || isVideo || isAudio) && styles.bubbleMedia,
                            isSelected && styles.bubbleSelected,
                            item.id === highlightedMsgId && styles.bubbleHighlighted,
                            { overflow: 'hidden' }
                        ]}
                    >
                        {/* ─── Quoted Message (Reply) ─── */}
                        {item.reply_to && !Array.isArray(item.reply_to) && (
                            <View style={[styles.quotedContainer, isMe ? styles.quotedMe : styles.quotedThem]}>
                                <Text style={[styles.quotedName, isMe ? { color: 'white' } : { color: '#8b5cf6' }]} numberOfLines={1}>
                                    {(() => {
                                        const p = Array.isArray(item.reply_to.profiles) ? item.reply_to.profiles[0] : item.reply_to.profiles;
                                        return p?.full_name || (p?.email || 'Usuario').split('@')[0];
                                    })()}
                                </Text>
                                <Text style={[styles.quotedText, isMe ? { color: 'rgba(255,255,255,0.8)' } : { color: '#4b5563' }]} numberOfLines={1}>
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
                                        <Ionicons name="play-circle" size={48} color="white" />
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
                                    <View style={[styles.docIconWrap, isMe ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: '#e5e7eb' }]}>
                                        <Ionicons name="document-text" size={24} color={isMe ? 'white' : '#6b7280'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '500' }]} numberOfLines={1}>{documentName}</Text>
                                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontSize: 10 }]}>Documento</Text>
                                    </View>
                                </View>
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { paddingHorizontal: 8, paddingBottom: 4, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : (
                            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
                                {msgText}
                            </Text>
                        )}


                        <View style={styles.metaRow}>
                            {item.reply_to_id && <Text style={{ fontSize: 8, color: isMe ? 'rgba(255,255,255,0.5)' : '#9ca3af', marginRight: 4 }}>R</Text>}
                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem]}>{time}</Text>
                            {isMe && (
                                <View style={{ marginLeft: 4 }}>
                                    <Ionicons
                                        name={item.status === 'sent' || !item.status ? 'checkmark' : 'checkmark-done'}
                                        size={14}
                                        color={item.status === 'read' ? '#34b7f1' : (item.status === 'delivered' ? '#9ca3af' : 'rgba(255,255,255,0.7)')}
                                    />
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>

                    {/* ─── AI Suggestion Chip ─── */}
                    {item.meta?.suggestedTask && (
                        <TouchableOpacity
                            style={styles.suggestionChip}
                            onPress={() => onPress({ ...item, _isSuggestionTap: true })}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.suggestionIcon}>✨</Text>
                            <Text style={styles.suggestionText} numberOfLines={1}>
                                ¿Agendar: {item.meta.suggestedTask.title}?
                            </Text>
                        </TouchableOpacity>
                    )}
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
                </View>
                {highlightedMsgId === item.id && (
                    <Animated.View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: 12 }} />
                )}
            </View>

            {isGroup && (() => {
                const tasks = groupTasks.filter((t: any) => t.message_id === item.id && t.is_group_task);
                if (tasks.length === 0) return null;

                // Logic: 
                // 1. If I am the creator, show the first one (as a summary)
                // 2. If I am an assignee, show only MINE
                const myTask = tasks.find((t: any) => t.assigned_to_user_id === user?.id);
                const isOwner = tasks[0].owner_user_id === user?.id;

                if (myTask) {
                    return <GroupTaskCard key={myTask.id} commitment={myTask} />;
                } else if (isOwner) {
                    // Show a representative one for the owner
                    return <GroupTaskCard key={tasks[0].id} commitment={{ ...tasks[0], _isEveryoneSummary: tasks.length > 1 }} />;
                }
                return null;
            })()}

        </Swipeable>
    );
};

export default MessageItem;

const styles = StyleSheet.create({
    dateDivider: { alignItems: 'center', marginVertical: 10 },
    dateDividerText: {
        backgroundColor: 'rgba(0,0,0,0.2)', color: 'white',
        fontSize: 12, paddingHorizontal: 12, paddingVertical: 4,
        borderRadius: 10, overflow: 'hidden', fontWeight: '500',
    },
    msgRow: { marginVertical: 2, flexDirection: 'row' },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: {
        borderRadius: 16, paddingHorizontal: 12,
        paddingTop: 8, paddingBottom: 6,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
    },
    bubbleMe: { backgroundColor: BUBBLE_BLUE, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: 'white', borderBottomLeftRadius: 4 },
    bubbleHighlighted: { backgroundColor: '#bfdbfe' },
    senderAvatarContainer: {
        width: 32, height: 32, marginRight: 8, alignSelf: 'flex-end', marginBottom: 2,
    },
    senderAvatar: { width: 32, height: 32, borderRadius: 16 },
    senderAvatarText: { color: 'white', fontSize: 12, fontWeight: '700' },
    bubbleMedia: { padding: 3, overflow: 'hidden' },
    senderName: { fontSize: 12, fontWeight: '700', color: BUBBLE_BLUE, marginBottom: 2, paddingHorizontal: 8, paddingTop: 4 },
    msgText: { fontSize: 15.5, lineHeight: 21 },
    msgTextMe: { color: 'white' },
    msgTextThem: { color: '#111827' },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3, paddingHorizontal: 4 },
    timeText: { fontSize: 11 },
    timeMe: { color: 'rgba(255,255,255,0.7)' },
    timeThem: { color: '#9ca3af' },
    msgImage: { width: 220, height: 220, borderRadius: 10 },
    inlineVideoWrap: { position: 'relative', width: 220, height: 220, borderRadius: 10, overflow: 'hidden' },
    videoPlayOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    documentBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 200, maxWidth: 260, paddingVertical: 4, paddingRight: 8 },
    docIconWrap: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    systemWrap: { alignItems: 'center', marginVertical: 6 },
    systemBubble: {
        backgroundColor: '#d1fae5', borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 8,
        borderWidth: 1, borderColor: '#a7f3d0', maxWidth: '90%',
    },
    systemText: { fontSize: 13, color: '#065f46', textAlign: 'center', fontWeight: '500' },
    checkbox: { justifyContent: 'center', paddingRight: 8, paddingLeft: 2 },
    checkCircle: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2, borderColor: '#9ca3af',
        alignItems: 'center', justifyContent: 'center',
    },
    checkCircleOn: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
    bubbleSelected: { opacity: 0.75 },
    quotedContainer: { padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3 },
    quotedMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: 'white' },
    quotedThem: { backgroundColor: '#f3f4f6', borderLeftColor: '#8b5cf6' },
    quotedName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
    quotedText: { fontSize: 12 },
    reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', position: 'absolute', bottom: -10, gap: 4, zIndex: 100 },
    reactionsMe: { right: 8 },
    reactionsThem: { left: 8 },
    reactionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#e5e7eb', gap: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    reactionCount: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
    suggestionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f3ff',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginTop: 6,
        borderWidth: 1,
        borderColor: '#ddd6fe',
        alignSelf: 'flex-start',
        maxWidth: '100%',
        shadowColor: '#6366f1',
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    suggestionIcon: {
        fontSize: 14,
        marginRight: 6,
    },
    suggestionText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6366f1',
    },
});
