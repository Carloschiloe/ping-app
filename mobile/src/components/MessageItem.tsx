import React, { memo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Linking,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { CachedImage, stableImageKey } from '../design/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import AudioPlayer from './AudioPlayer';
import GroupTaskCard from './GroupTaskCard';
import { DeliveryTicks } from './chat/DeliveryTicks';
import { isMessageTombstoned, resolvableAttachmentId, resolveDeletedMessageLabel, resolveMessageAttachmentPresentation, resolveReactionEmoji } from '../utils/messageCompat';
import {
    isRetryablePrivateFileReadError,
    resolveAttachmentUrl,
    resolvePrivateFileUrl,
} from '../lib/privateFiles';
import { getQuotedMessagePalette } from '../utils/messagePresentation';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';
import { LocationArt } from './LocationArt';
import {
    getFreshProfileAvatarUrl,
    useProfileAvatarUrl,
} from '../hooks/useProfileAvatarUrl';

function buildMapUrl(lat: number, lng: number) {
    if (Platform.OS === 'ios') return `http://maps.apple.com/?ll=${lat},${lng}&q=Ubicaci%C3%B3n`;
    return `geo:${lat},${lng}?q=${lat},${lng}`;
}

function buildDirectionsUrl(lat: number, lng: number) {
    if (Platform.OS === 'ios') return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    return `google.navigation:q=${lat},${lng}`;
}

/** Vista previa muda de video en la lista de mensajes. Componente separado y memoizado para no crear un VideoPlayer nativo por cada mensaje (solo se monta cuando el mensaje es de video). */
// A chat list can hold many videos. Each one shows a single still frame,
// taken once with a short-lived player and kept for the session, instead of
// a live native player per message.
const VIDEO_STILLS_LIMIT = 40;
const videoStills = new Map<string, VideoThumbnail>();

const InlineVideoThumbnail = React.memo(function InlineVideoThumbnail({
    uri,
    style,
}: {
    uri: string;
    style: object;
}) {
    const stillKey = stableImageKey(uri);
    const [still, setStill] = React.useState<VideoThumbnail | null>(() => videoStills.get(stillKey) ?? null);

    React.useEffect(() => {
        if (still) return;
        let active = true;
        const player = createVideoPlayer(uri);
        player.muted = true;
        player.generateThumbnailsAsync([0], { maxWidth: 480 })
            .then(([frame]) => {
                if (!frame) return;
                if (videoStills.size >= VIDEO_STILLS_LIMIT) {
                    const oldest = videoStills.keys().next().value;
                    if (oldest) videoStills.delete(oldest);
                }
                videoStills.set(stillKey, frame);
                if (active) setStill(frame);
            })
            .catch(() => { /* the play badge still marks it as a video */ })
            .finally(() => player.release());
        return () => { active = false; };
    }, [still, stillKey, uri]);

    return still
        ? <ExpoImage source={still} style={style} contentFit="cover" />
        : <View style={[style, { backgroundColor: colors.glassDim }]} />;
});

/** Regex matching http/https URLs within text (same pattern as backend link extractor). */
const URL_REGEX = /(https?:\/\/[^\s<>"'()]+)/g;

/** Renders plain text with embedded URLs as tappable links. */
function InlineLinkText({
    text,
    textStyle,
    linkColor,
}: {
    text: string;
    textStyle: object | object[];
    linkColor: string;
}) {
    const parts = text.split(URL_REGEX);
    return (
        <Text style={textStyle}>
            {parts.map((part, i) =>
                URL_REGEX.test(part) ? (
                    <Text
                        key={i}
                        style={{ color: linkColor, textDecorationLine: 'underline' }}
                        onPress={() => void Linking.openURL(part)}
                    >
                        {part}
                    </Text>
                ) : (
                    <Text key={i}>{part}</Text>
                ),
            )}
        </Text>
    );
}

// Delivery ticks are sized to be read at a glance.
const TICK_SIZE = 17;

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
    onAvatarPress?: (url: string) => void;
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
    onAvatarPress,
    formatTime, avatarColor, swipeableRowRefs, groupParticipants = [], conversationMode = 'chat', activeCommitmentId = null
}: MessageItemProps) => {
    const [privateMediaUrl, setPrivateMediaUrl] = React.useState<string | null>(null);
    // Bumped when a photo fails to load, e.g. its one-minute link ran out first.
    const [mediaReloads, setMediaReloads] = React.useState(0);
    const [privateMediaState, setPrivateMediaState] = React.useState<'idle' | 'loading' | 'ready' | 'retrying' | 'unavailable'>('idle');
    const privateMediaUrlRef = React.useRef<string | null>(null);
    const privateMediaRetryCountRef = React.useRef(0);
    const MAX_PRIVATE_MEDIA_RETRIES = 3;
    // Message deletion and attachment liveness are checked independently —
    // see messageCompat.ts's isMessageTombstoned/hasLiveAttachment doc
    // comments. isTombstoned derives ONLY from the canonical message's own
    // deleted_at; it must never be inferred from attachment.lifecycleStatus.
    // canonicalAttachmentId is only ever the id of an attachment the backend
    // will actually authorize a signed read for (lifecycle_status =
    // 'attached') — a present-but-non-'attached' id (still uploading, or
    // tombstoned for a reason unrelated to message deletion) must never be
    // used to attempt a fetch, since authorize_message_attachment_read would
    // just reject it forever, producing the same unrecoverable retry loop
    // this fix removes.
    const isTombstoned = isMessageTombstoned(item);
    const canonicalAttachmentId = resolvableAttachmentId(item);
    const senderProfile = Array.isArray(item?.profiles) ? item.profiles[0] : item?.profiles;
    const resolvedSenderAvatarUrl = useProfileAvatarUrl(
        item?.sender_id !== user?.id ? senderProfile?.id : null,
        senderProfile?.avatar_url
    );

    React.useEffect(() => {
        let active = true;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const hasLegacyReference = !!item?.id && !!item?.media_bucket && !!item?.media_object_path;
        if (isTombstoned || (!canonicalAttachmentId && !hasLegacyReference)) {
            privateMediaUrlRef.current = null;
            setPrivateMediaUrl(null);
            setPrivateMediaState('idle');
            return () => { active = false; };
        }

        privateMediaUrlRef.current = null;
        privateMediaRetryCountRef.current = 0;
        setPrivateMediaUrl(null);
        setPrivateMediaState('loading');

        const loadSignedUrl = async (forceRefresh = false) => {
            try {
                const access = canonicalAttachmentId
                    ? await resolveAttachmentUrl(canonicalAttachmentId, { forceRefresh })
                    : await resolvePrivateFileUrl('message', item.id, { forceRefresh });
                if (!active) return;

                privateMediaUrlRef.current = access.signedUrl;
                setPrivateMediaUrl(access.signedUrl);
                setPrivateMediaState('ready');
                privateMediaRetryCountRef.current = 0;
            } catch (error) {
                if (!active) return;
                const retryCount = privateMediaRetryCountRef.current;
                const shouldRetry = isRetryablePrivateFileReadError(error)
                    && retryCount < MAX_PRIVATE_MEDIA_RETRIES;
                if (!shouldRetry) {
                    privateMediaUrlRef.current = null;
                    setPrivateMediaUrl(null);
                    setPrivateMediaState('unavailable');
                    return;
                }
                privateMediaRetryCountRef.current += 1;
                setPrivateMediaState(privateMediaUrlRef.current ? 'ready' : 'retrying');
                retryTimer = setTimeout(
                    () => loadSignedUrl(true),
                    Math.min(15_000, 3_000 * (2 ** retryCount)),
                );
            }
        };

        loadSignedUrl(mediaReloads > 0);
        return () => {
            active = false;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [canonicalAttachmentId, item?.id, item?.media_bucket, item?.media_object_path, isTombstoned, mediaReloads]);

    if (item.type === 'divider') {
        return (
            <View style={styles.dateDivider}>
                <Text style={styles.dateDividerText}>{item.date}</Text>
            </View>
        );
    }

    const meta = item.metadata ?? item.meta ?? {};
    const isMe = item.sender_id === user?.id;
    // COMMITMENT UX + ACTOR-AWARE SUGGESTIONS — hallazgo físico real: el
    // botón "Agendar" sólo miraba `meta?.suggestedTask`, nunca (a) si el
    // mensaje ya produjo una proposal/commitment real (`groupTasks` ya se
    // filtraba por `message_id` unas líneas más abajo para pintar la card,
    // pero nunca se reutilizaba para decidir si el botón debía seguir
    // existiendo), ni (b) si el actor actual es quien realmente escribió el
    // mensaje. Resultado: Alejandra veía "Agendar" bajo el mensaje de
    // Carlos AL MISMO TIEMPO que la proposal card real ya materializada
    // (dos caminos de creación compitiendo por la misma intención), y de
    // haberlo tocado, habría creado una SEGUNDA proposal propuesta por
    // ELLA -- nunca una respuesta a la de Carlos. Regla de autoría (sección
    // 3 del ticket): sólo quien escribió el mensaje puede iniciar el
    // agendado. Regla de materialización (sección 4): una vez que existe
    // CUALQUIER proposal/commitment para este mensaje, el CTA original deja
    // de ofrecerse a CUALQUIER actor -- la superficie accionable pasa a ser
    // exclusivamente la card de abajo (Aceptar/Proponer otra fecha/Rechazar
    // para el resto, o simplemente verla para el propio autor).
    const tasksForThisMessage = groupTasks.filter((t: any) => t.message_id === item.id);
    const canInitiateSuggestion = isMe && tasksForThisMessage.length === 0;
    const quotedPalette = getQuotedMessagePalette(isMe);
    // Only a message that just arrived (or was just sent) slides in; older
    // ones appear in place when the list scrolls back to them.
    const createdAt = Date.parse(item.created_at);
    const entering = Number.isFinite(createdAt) && Date.now() - createdAt < 6000
        ? FadeInDown.duration(280)
        : undefined;
    const isOperationMode = conversationMode === 'operation';
    const time = formatTime(item.created_at);
    const msgText: string = isTombstoned
        ? resolveDeletedMessageLabel(item)
        : (item.content ?? item.text ?? '');

    const trimmedText = msgText.trim();
    const pendingAttachmentState = !isTombstoned
        && (meta?.attachment?.uploadState === 'pending_local'
            || meta?.attachment?.uploadState === 'unavailable')
        ? meta.attachment.uploadState
        : null;
    const pendingFailed = item.status === 'rejected_offline' || pendingAttachmentState === 'unavailable';
    // Canonical render priority — a tombstoned message must never reach any
    // media-derived branch (image/video/audio/document wrapper, aspect
    // ratio, thumbnail, bubbleMedia padding, resolveAttachmentUrl). This is
    // a structural guard, not just individually-false booleans: every
    // media signal (mimeType, legacy [imagen]/[video]/[audio]/[document=
    // prefixes, private attachment presence) is forced inert up front so a
    // stale cached attachment.mimeType or a stale legacy-prefix text body
    // can never re-derive a media layout for a message whose deleted_at is
    // already canonically set.
    const attachmentPresentation = isTombstoned
        ? { kind: null, mimeType: '', fileName: '', hasPrivateReference: false, legacyUrl: null }
        : resolveMessageAttachmentPresentation(item, Boolean(pendingAttachmentState));
    const privateMimeType = attachmentPresentation.mimeType;
    const hasPrivateAttachment = !isTombstoned && attachmentPresentation.hasPrivateReference;
    let isImage = !isTombstoned && (attachmentPresentation.kind === 'image' || privateMimeType.startsWith('image/') || trimmedText.startsWith('[imagen]'));
    const isAudio = !isTombstoned && (attachmentPresentation.kind === 'audio' || privateMimeType.startsWith('audio/') || trimmedText.startsWith('[audio]'));
    let isVideo = !isTombstoned && (attachmentPresentation.kind === 'video' || privateMimeType.startsWith('video/') || trimmedText.startsWith('[video]'));
    const isDocument = !isTombstoned && ((
        hasPrivateAttachment
        && !isImage
        && !isAudio
        && !isVideo
    ) || trimmedText.startsWith('[document='));
    const isLocationShare = !isTombstoned && meta?.messageType === 'location_share';
    const audioDurationMs = [
        item?.attachment?.durationMs,
        item?.attachment?.duration_ms,
        meta?.attachment?.durationMs,
        meta?.attachment?.duration_ms,
        item?.media_metadata?.durationMs,
        item?.media_metadata?.duration_ms,
    ].find((value) => Number.isFinite(Number(value)) && Number(value) > 0);

    let mediaUrl: string | null = hasPrivateAttachment ? privateMediaUrl : null;
    let documentName = hasPrivateAttachment
        ? (attachmentPresentation.fileName || item?.attachment?.originalFilename || meta?.attachment?.fileName || 'Archivo')
        : '';

    let description = '';
    const extractUrlAndDescription = (text: string, prefixLength: number) => {
        const full = text.slice(prefixLength).trim();
        const match = full.match(/^([^\s\n]+)[\s\n]*([\s\S]*)$/);
        if (!match) return { url: full, desc: '' };
        return { url: match[1], desc: match[2].trim() };
    };

    if (!hasPrivateAttachment && isImage && trimmedText.startsWith('[imagen]')) {
        const res = extractUrlAndDescription(msgText, 8);
        mediaUrl = res.url;
        description = res.desc;
    } else if (!hasPrivateAttachment && isAudio && trimmedText.startsWith('[audio]')) {
        const res = extractUrlAndDescription(msgText, 7);
        mediaUrl = res.url;
        description = res.desc;
    } else if (!hasPrivateAttachment && isVideo && trimmedText.startsWith('[video]')) {
        const res = extractUrlAndDescription(msgText, 7);
        mediaUrl = res.url;
        description = res.desc;
    } else if (!hasPrivateAttachment && isDocument) {
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
    } else if (!hasPrivateAttachment && attachmentPresentation.legacyUrl) {
        mediaUrl = attachmentPresentation.legacyUrl;
    }

    if (isImage && mediaUrl && (mediaUrl.toLowerCase().includes('.mp4') || mediaUrl.toLowerCase().includes('.mov'))) {
        isImage = false;
        isVideo = true;
    }
    // A photo or video without caption carries its time and ticks on top of
    // the picture, so the picture can fill the whole bubble.
    const metaOnMedia = (isImage || isVideo) && (!!mediaUrl || !!pendingAttachmentState) && !description;

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
                <Animated.View style={{ transform: [{ translateX: trans }], width: 32, height: 32, borderRadius: 16, backgroundColor: colors.glassRaised, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="arrow-undo" size={18} color={colors.textSoft} />
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
            <Reanimated.View entering={entering}>
                <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { marginBottom: 2 }]}>
                {isMultiSelecting && (
                    <TouchableOpacity onPress={() => onToggleSelect(item.id)} style={styles.checkbox}>
                        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                        </View>
                    </TouchableOpacity>
                )}

                {!isMe && (
                    <TouchableOpacity
                        style={styles.senderAvatarContainer}
                        onPress={async () => {
                            const freshUrl = await getFreshProfileAvatarUrl(
                                senderProfile?.id,
                                senderProfile?.avatar_url
                            );
                            if (freshUrl) onAvatarPress?.(freshUrl);
                        }}
                        disabled={!resolvedSenderAvatarUrl}
                        accessibilityRole="imagebutton"
                        accessibilityLabel="Ver foto de perfil"
                    >
                        {(() => {
                            const p = senderProfile;
                            const avatarUrl = resolvedSenderAvatarUrl;
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
                                <CachedImage uri={avatarUrl} style={styles.senderAvatar} />
                            ) : (
                                <View style={[styles.senderAvatar, { backgroundColor: color, justifyContent: 'center', alignItems: 'center' }]}>
                                    <Text style={styles.senderAvatarText}>{initialsString}</Text>
                                </View>
                            );
                        })()}
                    </TouchableOpacity>
                )}

                <View style={{ maxWidth: '68%', position: 'relative' }}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => onPress({
                            ...item,
                            ...(privateMediaUrl ? { _resolvedMediaUrl: privateMediaUrl } : {}),
                        })}
                        onLongPress={() => onLongPress(item)}
                        delayLongPress={350}
                        style={[
                            styles.bubble,
                            isMe ? styles.bubbleMe : styles.bubbleThem,
                            (isImage || isVideo) ? styles.bubbleVisual : isAudio && styles.bubbleMedia,
                            isSelected && styles.bubbleSelected,
                            item.id === highlightedMsgId && styles.bubbleHighlighted,
                            { overflow: 'hidden' }
                        ]}
                    >
                        {isMe && (
                            <LinearGradient
                                pointerEvents="none"
                                colors={gradients.accent}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                        )}
                        {meta?.forwarded && (
                            <View style={styles.forwardedLabel}>
                                <Ionicons
                                    name="arrow-redo-outline"
                                    size={12}
                                    color={isMe ? colors.onAccentSoft : colors.textFaint}
                                />
                                <Text style={[styles.forwardedText, isMe && styles.forwardedTextMe]}>
                                    Reenviado
                                </Text>
                            </View>
                        )}

                        {item.reply_to && !Array.isArray(item.reply_to) && (
                            <View style={[
                                styles.quotedContainer,
                                {
                                    backgroundColor: quotedPalette.backgroundColor,
                                    borderLeftColor: quotedPalette.borderLeftColor,
                                },
                            ]}>
                                <Text style={[styles.quotedName, { color: quotedPalette.nameColor }]} numberOfLines={1}>
                                    {(() => {
                                        const p = Array.isArray(item.reply_to.profiles) ? item.reply_to.profiles[0] : item.reply_to.profiles;
                                        return p?.full_name || (p?.email || 'Usuario').split('@')[0];
                                    })()}
                                </Text>
                                <Text style={[styles.quotedText, { color: quotedPalette.textColor }]} numberOfLines={1}>
                                    {item.reply_to.content ?? item.reply_to.text ?? 'Sin texto'}
                                </Text>
                            </View>
                        )}

                        {!isMe && isGroup && (
                            <Text style={[styles.senderName, item.reply_to && { marginTop: -2, marginBottom: 0 }]} numberOfLines={1}>
                                {(() => {
                                    const p = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
                                    return p?.full_name || (p?.email || 'Miembro').split('@')[0];
                                })()}
                            </Text>
                        )}

                        {pendingAttachmentState ? (
                            // A photo or video still on its way: show what was
                            // picked and say plainly whether it is going or failed.
                            <View style={styles.pendingMedia}>
                                {meta?.attachment?.localUri && meta?.attachment?.mimeType?.startsWith('image/') ? (
                                    <CachedImage uri={meta.attachment.localUri} style={styles.pendingMediaThumb} />
                                ) : (
                                    <View style={[styles.pendingMediaThumb, styles.pendingMediaIcon]}>
                                        <Ionicons
                                            name={meta?.attachment?.mimeType?.startsWith('video/') ? 'videocam-outline' : 'document-outline'}
                                            size={28}
                                            color={colors.textSoft}
                                        />
                                    </View>
                                )}
                                <View style={styles.pendingMediaLabel}>
                                    <Ionicons
                                        name={pendingFailed ? 'alert-circle' : 'time-outline'}
                                        size={14}
                                        color={pendingFailed ? colors.danger : colors.onAccent}
                                    />
                                    <Text style={styles.pendingMediaText}>
                                        {pendingFailed ? 'No se envió · toca para reintentar' : 'Enviando…'}
                                    </Text>
                                </View>
                            </View>
                        ) : hasPrivateAttachment && !mediaUrl && privateMediaState === 'unavailable' ? (
                            <View style={styles.privateMediaLoading}>
                                <Ionicons
                                    name="alert-circle-outline"
                                    size={18}
                                    color={colors.textSoft}
                                />
                                <Text style={styles.privateMediaLoadingText}>
                                    Archivo no disponible
                                </Text>
                            </View>
                        ) : hasPrivateAttachment && !mediaUrl ? (
                            <View style={styles.privateMediaLoading}>
                                <ActivityIndicator size="small" color={colors.accentBright} />
                                <Ionicons
                                    name={isAudio ? 'mic-outline' : isImage ? 'image-outline' : 'document-outline'}
                                    size={18}
                                    color={colors.textSoft}
                                />
                                <Text style={styles.privateMediaLoadingText}>
                                    {privateMediaState === 'retrying'
                                        ? 'Recuperando archivo...'
                                        : isAudio
                                            ? 'Cargando audio...'
                                            : 'Cargando archivo...'}
                                </Text>
                            </View>
                        ) : isImage && mediaUrl ? (
                            <View>
                                <CachedImage uri={mediaUrl as string} style={styles.msgImage} onError={() => setMediaReloads((count) => Math.min(count + 1, 2))} />
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { padding: 8, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isVideo && mediaUrl ? (
                            <View>
                                <View style={styles.inlineVideoWrap} pointerEvents="none">
                                    <InlineVideoThumbnail uri={mediaUrl as string} style={styles.msgImage} />
                                    <View style={styles.videoPlayOverlay}>
                                        <Ionicons name="play-circle" size={48} color={colors.onAccent} />
                                    </View>
                                </View>
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { padding: 8, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isAudio && mediaUrl ? (
                            <View>
                                <AudioPlayer url={mediaUrl as string} isMe={isMe} durationMs={audioDurationMs ? Number(audioDurationMs) : null} />
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13, opacity: 0.8 }]}>{description}</Text> : null}
                            </View>
                        ) : isDocument && mediaUrl ? (
                            <View>
                                <View style={styles.documentBubble}>
                                    <View style={[styles.docIconWrap, { backgroundColor: isMe ? colors.onAccentTint : colors.glassRaised }]}>
                                        <Ionicons name="document-text" size={24} color={isMe ? colors.onAccent : colors.textSoft} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '500' }]} numberOfLines={1}>{documentName}</Text>
                                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontSize: 10 }]}>Documento</Text>
                                    </View>
                                </View>
                                {description ? <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { paddingHorizontal: 8, paddingBottom: 4, fontSize: 14 }]}>{description}</Text> : null}
                            </View>
                        ) : isLocationShare ? (
                            <View style={styles.locationCard}>
                                <TouchableOpacity
                                    activeOpacity={0.9}
                                    style={styles.locationMapWrapper}
                                    onPress={async () => {
                                        const location = meta?.location;
                                        if (!location?.latitude || !location?.longitude) return;
                                        const nativeUrl = buildMapUrl(location.latitude, location.longitude);
                                        const googleUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
                                        const targetUrl = await Linking.canOpenURL(nativeUrl) ? nativeUrl : googleUrl;
                                        Linking.openURL(targetUrl);
                                    }}
                                >
                                    <LocationArt latitude={meta.location.latitude} longitude={meta.location.longitude} />
                                </TouchableOpacity>

                                <View style={styles.locationCardBody}>
                                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem, { fontWeight: '700' }]} numberOfLines={1}>
                                        {meta?.location?.label || 'Ubicación'}
                                    </Text>
                                    {meta?.location?.address ? (
                                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { marginTop: 2 }]} numberOfLines={1}>
                                            {meta.location.address}
                                        </Text>
                                    ) : null}
                                    <View style={{ height: 8 }} />
                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                        <TouchableOpacity
                                            onPress={async () => {
                                                const location = meta?.location;
                                                if (!location?.latitude || !location?.longitude) return;
                                                const nativeUrl = buildMapUrl(location.latitude, location.longitude);
                                                const googleUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
                                                Linking.openURL(await Linking.canOpenURL(nativeUrl) ? nativeUrl : googleUrl);
                                            }}
                                        >
                                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontWeight: '600' }]}>Ver mapa</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={async () => {
                                                const location = meta?.location;
                                                if (!location?.latitude || !location?.longitude) return;
                                                const nativeUrl = buildDirectionsUrl(location.latitude, location.longitude);
                                                const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
                                                Linking.openURL(await Linking.canOpenURL(nativeUrl) ? nativeUrl : googleUrl);
                                            }}
                                        >
                                            <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, { fontWeight: '600' }]}>Cómo llegar</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <InlineLinkText
                                text={msgText}
                                textStyle={[
                                    styles.msgText,
                                    isMe ? styles.msgTextMe : styles.msgTextThem,
                                    isOperationMode && styles.msgTextOperation,
                                ]}
                                linkColor={isMe ? colors.onAccent : colors.accentBright}
                            />
                        )}
                        <View style={[styles.metaRow, metaOnMedia ? styles.metaOverlay : (isImage || isVideo) && styles.metaInline]}>
                                                        <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeThem, metaOnMedia && { color: colors.onAccent }]}>{time}</Text>
                            {isMe && (
                                <View style={{ marginLeft: 4 }}>
                            {(item.status === 'sending' || item.status === 'pending_local' || item.status === 'pending_offline') ? (
                                <Ionicons name="time-outline" size={TICK_SIZE} color={metaOnMedia ? colors.onAccent : colors.onAccentSoft} />
                            ) : item.status === 'result_unknown' ? (
                                <Ionicons name="help-circle-outline" size={TICK_SIZE} color={colors.warning} />
                            ) : item.status === 'rejected_offline' ? (
                                <Ionicons name="alert-circle-outline" size={TICK_SIZE} color={colors.danger} />
                            ) : (
                                <DeliveryTicks
                                    state={item.status === 'read' ? 'read' : (item.status === 'delivered' || item.status === 'received') ? 'delivered' : 'sent'}
                                    onMedia={metaOnMedia}
                                />
                            )}
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>

                    {item.message_reactions && item.message_reactions.length > 0 && (
                        <View style={[styles.reactionsContainer, isMe ? styles.reactionsMe : styles.reactionsThem]}>
                            {(() => {
                                const counts = item.message_reactions.reduce((acc: any, r: any) => {
                                    const emoji = resolveReactionEmoji(r);
                                    if (emoji) acc[emoji] = (acc[emoji] || 0) + 1;
                                    return acc;
                                }, {});
                                return Object.keys(counts).map(emoji => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={styles.reactionPill}
                                        onPress={() => onViewReactions(item)}
                                    >
                                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                                        {counts[emoji] > 1 && <Text style={styles.reactionCount}>{counts[emoji]}</Text>}
                                    </TouchableOpacity>
                                ));
                            })()}
                        </View>
                    )}
                    {meta?.suggestedTask && canInitiateSuggestion && (
                        <TouchableOpacity
                            style={[styles.suggestionChip, isMe && { alignSelf: 'flex-end' }]}
                            onPress={() => {
                                onPress({ ...item, _isSuggestionTap: true });
                            }}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="sparkles" size={12} color={colors.accentBright} style={styles.suggestionIcon} />
                            <Text style={styles.suggestionText} numberOfLines={1}>
                                Agendar
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {highlightedMsgId === item.id && (
                    <Animated.View style={{ ...StyleSheet.absoluteFill, backgroundColor: colors.accentTint, borderRadius: radius.sm }} />
                )}
            </View>{(() => {
                const tasks = tasksForThisMessage;
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
            </Reanimated.View>
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
        prev.item.content === next.item.content &&
        prev.item.text === next.item.text &&
        prev.item.attachment === next.item.attachment &&
        prev.item.message_type === next.item.message_type &&
        prev.item.media_metadata === next.item.media_metadata &&
        prev.item.media_bucket === next.item.media_bucket &&
        prev.item.media_object_path === next.item.media_object_path &&
        prev.item.message_reactions === next.item.message_reactions &&
        prev.item.meta === next.item.meta &&
        prev.item.metadata === next.item.metadata &&
        prev.conversationMode === next.conversationMode &&
        prev.activeCommitmentId === next.activeCommitmentId &&
        prev.groupTasks === next.groupTasks &&
        prev.groupParticipants === next.groupParticipants
    );
});

export default MessageItem;

const styles = StyleSheet.create({
    dateDivider: { alignItems: 'center', marginVertical: space.sm + 2 },
    dateDividerText: {
        fontFamily: fonts.medium,
        backgroundColor: colors.glassDim,
        color: colors.textSoft,
        fontSize: 11,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
    msgRow: { marginVertical: 4, flexDirection: 'row' },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: {
        borderRadius: radius.lg,
        paddingHorizontal: 13,
        paddingTop: 9,
        paddingBottom: 8,
    },
    // Mine: the blue gradient drawn inside the bubble. Theirs: dark glass.
    bubbleMe: { borderBottomRightRadius: 6 },
    bubbleThem: {
        backgroundColor: colors.bubbleThem,
        borderBottomLeftRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    bubbleHighlighted: { borderWidth: 1, borderColor: colors.accentBright },
    senderAvatarContainer: {
        width: 30, height: 30, marginRight: space.sm, alignSelf: 'flex-end', marginBottom: 2,
    },
    senderAvatar: { width: 30, height: 30, borderRadius: 11 },
    senderAvatarText: { fontFamily: fonts.semibold, color: colors.onAccent, fontSize: 11 },
    bubbleMedia: { padding: 3, overflow: 'hidden' },
    // Photos and videos fill the whole bubble, edge to edge.
    bubbleVisual: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' },
    metaOverlay: {
        position: 'absolute', right: 6, bottom: 6, marginTop: 0,
        backgroundColor: colors.glassTint, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2,
    },
    metaInline: { paddingHorizontal: 8, paddingBottom: 4 },
    privateMediaLoading: {
        minWidth: 190,
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 12,
    },
    pendingMedia: { width: 250, height: 180, overflow: 'hidden', backgroundColor: colors.glassRaised },
    pendingMediaThumb: { width: '100%', height: '100%' },
    pendingMediaIcon: { alignItems: 'center', justifyContent: 'center' },
    pendingMediaLabel: {
        position: 'absolute', left: 0, right: 0, top: 0,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.glassTint,
    },
    pendingMediaText: { fontFamily: fonts.semibold, color: colors.onAccent, fontSize: 12 },
    privateMediaLoadingText: { fontFamily: fonts.medium, color: colors.textSoft, fontSize: 12 },
    senderName: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentBright, marginBottom: 2, paddingHorizontal: 8, paddingTop: 4 },
    msgText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
    msgTextMe: { color: colors.onAccent },
    msgTextThem: { color: colors.text },
    forwardedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
    forwardedText: { fontFamily: fonts.regular, color: colors.textFaint, fontSize: 11, fontStyle: 'italic' },
    forwardedTextMe: { color: colors.onAccentSoft },
    msgTextOperation: { letterSpacing: 0.1 },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3, paddingHorizontal: 4 },
    timeText: { fontFamily: fonts.medium, fontSize: 11 },
    timeMe: { color: colors.onAccentSoft },
    timeThem: { color: colors.textFaint },
    msgImage: { width: 250, height: 250 },
    inlineVideoWrap: { position: 'relative', width: 250, height: 250, overflow: 'hidden' },
    videoPlayOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: colors.glassTintLight,
        justifyContent: 'center', alignItems: 'center',
    },
    documentBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 200, maxWidth: 260, paddingVertical: 4, paddingRight: 8 },
    locationCard: {
        overflow: 'hidden',
        width: 240,
    },
    locationMapWrapper: {
        height: 120,
        backgroundColor: colors.glassRaised,
        position: 'relative',
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
    locationCardBody: {
        paddingTop: 8,
    },
    docIconWrap: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    checkbox: { justifyContent: 'center', paddingRight: 8, paddingLeft: 2 },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: colors.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassDim,
    },
    checkCircleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    bubbleSelected: { opacity: 0.9 },
    quotedContainer: { padding: 8, borderRadius: radius.sm, marginBottom: 6, borderLeftWidth: 3 },
    quotedName: { fontFamily: fonts.semibold, fontSize: 12, marginBottom: 2 },
    quotedText: { fontFamily: fonts.regular, fontSize: 12 },
    // Reactions sit on the bubble's bottom edge, right under the message.
    reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -8, marginBottom: 2, zIndex: 2 },
    reactionsMe: { alignSelf: 'flex-end', marginRight: 10 },
    reactionsThem: { alignSelf: 'flex-start', marginLeft: 10 },
    reactionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSolid, borderRadius: radius.md, paddingHorizontal: 7, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, gap: 3 },
    reactionEmoji: { fontSize: 17 },
    reactionCount: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSoft },
    // "Agendar": a small quiet pill under the message, not a big button.
    suggestionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentTint,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginTop: 6,
        marginBottom: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.accent,
        alignSelf: 'flex-start',
        maxWidth: '100%',
    },
    suggestionIcon: { marginRight: 5 },
    suggestionText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accentBright },
});
