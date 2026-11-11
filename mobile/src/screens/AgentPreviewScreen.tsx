// Ping Core surface (POST /agent/turn). The main entry has no route
// conversationId, so its durable history is projected through the actor's
// idempotent self-chat while semantic dialogue scope remains Core-owned.
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReportSheet, type ReportTarget } from '../components/safety/ReportSheet';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Modal, Pressable, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
    createAgentTurnIdempotencyKey, mapAgentErrorMessage, useAgentTurn,
    isAgentConversationEventsEnabled, useAgentConversationTurns, type AgentActionDecision, type AgentFollowUpOption,
    type AgentPendingAction, type AgentVoiceTranscriptResult,
} from '../api/query-modules/agent';
import { useSelfConversationId, useClearAgentConversationHistory } from '../api/query-modules/conversations';
import { invalidateCommitmentViews } from '../api/query-invalidation';
import { ApiError, apiClient } from '../api/client';
import { releaseLockScreen } from '../../modules/vorian-alarm';
import {
    chatStarters, appendAgentTurnMessage, appendErrorMessage, appendUserMessage,
    canSendInput, citationKindLabel, describeCitationsSummary, describeCitationTypes, describeStatusLabel, isLatestAgentMessage,
    restoreAgentConversationMessages, type AgentChatMessage,
} from '../utils/agentChat';
import { getChatKeyboardBehavior, getChatKeyboardOffset } from '../utils/chatKeyboard';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { SheetFill, sheetSurface } from '../design/Sheet';
import { PingOrb } from '../design/PingOrb';
import type { AgentCoreScreenProps } from '../navigation/types';
import { useAgentVoiceInput } from '../hooks/useAgentVoiceInput';
import { formatRecordingDuration } from '../utils/audioRecording';
import { voiceStatusCopy } from '../utils/voiceSession';
import { LiveVoiceSession, type LiveVoiceCloseReason } from '../components/agent/LiveVoiceSession';

// Sección 17 del ticket: el backend puede tardar tras cold start -- no se
// cancela, sólo se cambia el copy para que la espera se sienta viva.
const SLOW_REQUEST_COPY_DELAY_MS = 10_000;

const CITATION_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    commitment: 'checkbox-outline',
    commitment_proposal: 'checkbox-outline',
    commitment_event: 'checkbox-outline',
    message: 'chatbubble-outline',
    memory: 'bookmark-outline',
    transcription: 'mic-outline',
    attachment: 'document-text-outline',
    person: 'person-outline',
};

export default function AgentPreviewScreen({ navigation, route }: AgentCoreScreenProps) {
    const insets = useSafeAreaInsets();
    const conversationId = route.params?.conversationId;
    const adapterSurface = route.params?.surface ?? 'mobile_text';
    const isMainCoreEntry = route.name === 'PingAI';
    const starters = useMemo(() => chatStarters(route.params?.chatContext), [route.params?.chatContext]);

    const [messages, setMessages] = useState<AgentChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSlow, setIsSlow] = useState(false);
    const [citationsSheetFor, setCitationsSheetFor] = useState<AgentChatMessage | null>(null);
    const [voiceDraft, setVoiceDraft] = useState<{ text: string; token: string; confidence: number | null } | null>(null);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    // Opened from the Chats aura, the voice view is up from the first frame so the text chat never flashes underneath.
    const [liveVoiceVisible, setLiveVoiceVisible] = useState(() => route.params?.startWith === 'voice' && !route.params?.briefingRequestAt && (isMainCoreEntry || Constants.expoConfig?.extra?.m8LiveVoiceEnabled === true));
    const [retryBlockedUntil, setRetryBlockedUntil] = useState(0);
    // M-1G.1 fix — el offset fijo de chatKeyboard.ts (90) fue calibrado para
    // el header NATIVO más alto de ChatScreen; el header custom de esta
    // pantalla es más corto, y en dispositivos con inset superior grande
    // (Dynamic Island) 90 quedaba por debajo del espacio real ocupado arriba
    // del KeyboardAvoidingView -- el composer terminaba parcialmente tapado
    // por el teclado. Se mide la altura real del header en runtime en vez de
    // asumir un número fijo compartido con otra pantalla.
    const [headerHeight, setHeaderHeight] = useState(0);
    const listRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const isMountedRef = useRef(true);
    const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendInFlightRef = useRef(false);
    const hydratedConversationRef = useRef<string | null>(null);
    const localInteractionRef = useRef(false);

    const queryClient = useQueryClient();
    const { mutate: submitTurn, isPending } = useAgentTurn();
    const { data: selfConversationId } = useSelfConversationId(
        isMainCoreEntry && !conversationId && isAgentConversationEventsEnabled(),
    );
    const historyConversationId = conversationId ?? selfConversationId;
    const { data: persistedHistory } = useAgentConversationTurns(historyConversationId);
    const dialogueScopeKey = conversationId || (isMainCoreEntry ? 'agent:mobile' : undefined);
    const { mutateAsync: clearAgentConversationHistory, isPending: isClearingHistory } = useClearAgentConversationHistory(historyConversationId, dialogueScopeKey);
    // Ping Voz is a production capability of the main Ping entry. Keep the
    // explicit build flag for controlled builds, but do not hide the entry
    // point in Expo Go when the dynamic config has no extra values.
    const liveVoiceEnabled = isMainCoreEntry || Constants.expoConfig?.extra?.m8LiveVoiceEnabled === true;

    // From the Chats aura Ping opens straight into voice; "Escribir" there brings
    // the user to this text chat, and "Hablar" here goes back to voice.
    const voiceEntryRef = useRef(liveVoiceVisible);
    const openLiveVoice = useCallback(() => {
        voiceEntryRef.current = false;
        setLiveVoiceVisible(true);
    }, []);
    // The day's summary arrived: open the voice to say it, unless Vorian is already talking.
    const [pendingBriefing, setPendingBriefing] = useState<string | undefined>(() => route.params?.briefing);
    const briefingAt = route.params?.briefingAt;
    const lastBriefingAtRef = useRef(briefingAt);
    useEffect(() => {
        if (!briefingAt || briefingAt === lastBriefingAtRef.current || !route.params?.briefing || !liveVoiceEnabled) return;
        lastBriefingAtRef.current = briefingAt;
        if (liveVoiceVisible) return;
        setPendingBriefing(route.params.briefing);
        voiceEntryRef.current = true;
        setLiveVoiceVisible(true);
    }, [briefingAt, route.params?.briefing, liveVoiceEnabled, liveVoiceVisible]);
    // The summary alarm rang: ask Vorian for the day, then open the voice to say it.
    const briefingRequestAt = route.params?.briefingRequestAt;
    const lastBriefingRequestRef = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (!briefingRequestAt || briefingRequestAt === lastBriefingRequestRef.current || !liveVoiceEnabled) return;
        lastBriefingRequestRef.current = briefingRequestAt;
        let alive = true;
        const open = (spoken?: string) => {
            if (!alive) return;
            setPendingBriefing(spoken);
            voiceEntryRef.current = true;
            setLiveVoiceVisible(true);
        };
        const timeout = setTimeout(() => open(undefined), 12_000);
        apiClient.post('/agent/briefing', {})
            .then((result: any) => { clearTimeout(timeout); open(typeof result?.spoken === 'string' ? result.spoken : undefined); })
            .catch(() => { clearTimeout(timeout); open(undefined); });
        return () => { alive = false; clearTimeout(timeout); };
    }, [briefingRequestAt, liveVoiceEnabled]);
    // "Hola Vorian" or the app-icon shortcut, while this screen was already open.
    const voiceAt = route.params?.voiceAt;
    const lastVoiceAtRef = useRef(voiceAt);
    useEffect(() => {
        if (!voiceAt || voiceAt === lastVoiceAtRef.current || !liveVoiceEnabled) return;
        lastVoiceAtRef.current = voiceAt;
        if (liveVoiceVisible) return;
        voiceEntryRef.current = true;
        setLiveVoiceVisible(true);
    }, [voiceAt, liveVoiceEnabled, liveVoiceVisible]);
    const closeLiveVoice = useCallback((reason: LiveVoiceCloseReason) => {
        setLiveVoiceVisible(false);
        // After the summary over the lock screen, the phone locks again as usual.
        releaseLockScreen();
        // Said once; tapping "Hablar" later starts a normal conversation.
        setPendingBriefing(undefined);
        // A voice session can confirm actions this chat never saw.
        invalidateCommitmentViews(queryClient, { includeAgreementProposals: true, includeAgentTurns: true });
        // Saying goodbye out loud ends at the chat list, wherever the voice was opened from.
        if (reason === 'farewell') navigation.popTo('ConversationsList');
        else if (reason === 'leave' && voiceEntryRef.current) navigation.goBack();
        voiceEntryRef.current = false;
    }, [navigation, queryClient]);

    useEffect(() => {
        if (!historyConversationId || !persistedHistory || hydratedConversationRef.current === historyConversationId) return;
        hydratedConversationRef.current = historyConversationId;
        if (!localInteractionRef.current) setMessages(restoreAgentConversationMessages(persistedHistory.turns));
    }, [historyConversationId, persistedHistory]);

    const handleTranscriptReady = useCallback((result: AgentVoiceTranscriptResult) => {
        setInputText(result.transcript.text);
        setVoiceDraft({
            text: result.transcript.text,
            token: result.voiceInputToken,
            confidence: result.transcript.confidence,
        });
        setVoiceError(null);
    }, []);

    const handleVoiceFailure = useCallback((code: string) => {
        const message = code === 'permission_denied' ? 'El micrófono no fue autorizado.'
            : code === 'permission_blocked' ? 'El micrófono está bloqueado. Puedes habilitarlo en Ajustes.'
                : code === 'audio_too_large' ? 'La grabación supera el límite permitido.'
                    : code === 'unsupported_audio' ? 'Este formato de audio no es compatible.'
                        : code === 'provider_unavailable' || code === 'Network request failed' ? 'La transcripción no está disponible sin conexión.'
                            : 'No se pudo transcribir el audio. Inténtalo nuevamente.';
        setVoiceError(message);
    }, []);

    useEffect(() => {
        if (!retryBlockedUntil) return;
        const remaining = retryBlockedUntil - Date.now();
        if (remaining <= 0) {
            setRetryBlockedUntil(0);
            return;
        }
        const timer = setTimeout(() => setRetryBlockedUntil(0), remaining);
        return () => clearTimeout(timer);
    }, [retryBlockedUntil]);

    const voice = useAgentVoiceInput({
        conversationId,
        currentCommitmentId: route.params?.currentCommitmentId,
        surface: adapterSurface === 'tablet' ? 'tablet' : 'mobile_voice',
        onTranscriptReady: handleTranscriptReady,
        onFailure: handleVoiceFailure,
    });

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        };
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 250);
        return () => clearTimeout(timer);
    }, [messages]);

    const sendInput = (rawInput: string, retryIdempotencyKey?: string, actionDecision?: AgentActionDecision) => {
        const trimmed = rawInput.trim();
        if (!canSendInput(trimmed, isPending) || retryBlockedUntil > Date.now() || sendInFlightRef.current) return;
        // React state updates are batched. This ref closes the small window in
        // which two native taps can arrive before `isPending` re-renders.
        sendInFlightRef.current = true;
        const matchingVoiceDraft = !actionDecision && voiceDraft?.text.trim() === trimmed ? voiceDraft : null;
        const requestChannel: 'mobile' | 'tablet' = adapterSurface === 'tablet' ? 'tablet' : 'mobile';
        const idempotencyKey = retryIdempotencyKey ?? createAgentTurnIdempotencyKey();
        // The user has now seen the transcript and pressed Send. Preserve the
        // signed audio provenance, but submit the visible text as the semantic
        // input. This is the explicit review boundary: a provider confidence
        // score must not re-block text the user has accepted or corrected.
        const source = matchingVoiceDraft
            ? { input: trimmed, reviewedVoiceInputToken: matchingVoiceDraft.token, idempotencyKey }
            : {
                input: trimmed,
                conversationId,
                channel: requestChannel,
                idempotencyKey,
                ...(actionDecision ? { actionDecision } : {}),
            };

        setMessages((prev) => appendUserMessage(prev, trimmed));
        localInteractionRef.current = true;
        if (!actionDecision) {
            setInputText('');
            setVoiceDraft(null);
        }
        setVoiceError(null);
        setIsSlow(false);
        setRetryBlockedUntil(0);
        slowTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setIsSlow(true);
        }, SLOW_REQUEST_COPY_DELAY_MS);

        if (matchingVoiceDraft) voice.markSubmitted();
        submitTurn(source, {
            onSuccess: (result) => {
                sendInFlightRef.current = false;
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
                if (!isMountedRef.current) return;
                setIsSlow(false);
                if (matchingVoiceDraft) voice.markFinished();
                setMessages((prev) => appendAgentTurnMessage(prev, result));
            },
            onError: (error) => {
                sendInFlightRef.current = false;
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
                if (!isMountedRef.current) return;
                setIsSlow(false);
                if (matchingVoiceDraft) voice.markFinished(true);
                const retryAfterSeconds = error instanceof ApiError && error.status === 429
                    ? error.retryAfterSeconds
                    : undefined;
                if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
                    setRetryBlockedUntil(Date.now() + retryAfterSeconds * 1000);
                }
                setMessages((prev) => appendErrorMessage(prev, mapAgentErrorMessage(error), trimmed,
                    source.idempotencyKey, retryAfterSeconds, actionDecision));
            },
        });
    };

    const handleSend = () => sendInput(inputText);
    const handleRetry = (retryInput: string, retryIdempotencyKey?: string, retryActionDecision?: AgentActionDecision) => (
        sendInput(retryInput, retryIdempotencyKey, retryActionDecision)
    );
    // A button answers exactly the action it is shown with; the label is what
    // the history shows as the user's turn.
    const handleActionDecision = (action: AgentPendingAction, decision: AgentActionDecision['decision']) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        sendInput(decision === 'confirm' ? 'Confirmar' : 'Cancelar', undefined, { action: action.ref, decision });
    };
    const handleCopyMessage = async (text: string) => {
        if (!text) return;
        await Clipboard.setStringAsync(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    // A Ping reply can also be reported, as Google Play asks of AI apps.
    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
    const handleReplyLongPress = (text: string) => {
        Alert.alert('Respuesta de Vorian', undefined, [
            { text: 'Copiar', onPress: () => { handleCopyMessage(text); } },
            { text: 'Denunciar respuesta', style: 'destructive', onPress: () => setReportTarget({ kind: 'assistant', excerpt: text }) },
            { text: 'Cancelar', style: 'cancel' },
        ]);
    };
    const handleStarterPress = (starter: string) => handleInputChange(starter);
    const handleFollowUpOptionPress = (option: AgentFollowUpOption) => handleInputChange(option.label);
    const handleInputChange = (value: string) => {
        if (voiceDraft && value !== voiceDraft.text) {
            setVoiceDraft(null);
            voice.reset();
        }
        setInputText(value);
    };

    const handleClearHistory = useCallback(() => {
        if (!historyConversationId || isPending || isClearingHistory) return;
        Alert.alert(
            'Limpiar chat de Vorian',
            'Se ocultará este historial de Vorian y se reiniciará la continuidad de la conversación. Tus compromisos y mensajes no se borrarán.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Limpiar',
                    style: 'destructive',
                    onPress: () => {
                        void clearAgentConversationHistory()
                            .then(() => {
                                setMessages([]);
                                setInputText('');
                                setVoiceDraft(null);
                                setVoiceError(null);
                                localInteractionRef.current = true;
                                hydratedConversationRef.current = historyConversationId;
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            })
                            .catch(() => {
                                Alert.alert('No se pudo limpiar', 'No se modificó el historial. Comprueba la conexión e inténtalo nuevamente.');
                            });
                    },
                },
            ],
        );
    }, [clearAgentConversationHistory, historyConversationId, isClearingHistory, isPending]);
    const voiceCopy = voiceStatusCopy(voice.state);

    const renderItem = ({ item }: { item: AgentChatMessage }) => {
        const isUser = item.role === 'user';
        const citationsSummary = describeCitationsSummary(item.citations);
        const statusLabel = describeStatusLabel(item.status);
        const isCopyable = !!item.text;
        const BubbleContainer = isCopyable ? TouchableOpacity : View;

        return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
                <BubbleContainer
                    style={[
                        styles.bubble,
                        isUser ? styles.userBubble : styles.agentBubble,
                        item.error && styles.errorBubble,
                    ]}
                    {...(isCopyable
                        ? {
                            activeOpacity: 0.7,
                            onLongPress: () => (isUser ? handleCopyMessage(item.text) : handleReplyLongPress(item.text)),
                            delayLongPress: 350,
                            accessibilityRole: 'button' as const,
                            accessibilityLabel: isUser ? 'Copiar mensaje' : 'Copiar o denunciar respuesta',
                        }
                        : {})}
                >
                    {isUser && !item.error && (
                        <LinearGradient pointerEvents="none" colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    )}
                    {statusLabel && <Text style={styles.turnLabel}>{statusLabel}</Text>}
                    <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.text}</Text>

                    {!isUser && item.pendingActions?.map((action) => {
                        const answerable = isLatestAgentMessage(messages, item.id);
                        return (
                            <View key={action.ref} style={styles.pendingAction} testID="ping-pending-action">
                                <Text style={styles.pendingActionSummary}>{action.summary}</Text>
                                {answerable && (
                                    <View style={styles.pendingActionButtons}>
                                        <TouchableOpacity
                                            style={[styles.pendingActionBtn, styles.pendingActionCancel]}
                                            onPress={() => handleActionDecision(action, 'discard')}
                                            disabled={isPending}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Cancelar: ${action.summary}`}
                                        >
                                            <Text style={styles.pendingActionCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.pendingActionBtn, styles.pendingActionConfirm, isPending && styles.pendingActionDisabled]}
                                            onPress={() => handleActionDecision(action, 'confirm')}
                                            disabled={isPending}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Confirmar: ${action.summary}`}
                                        >
                                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                                            <Text style={styles.pendingActionConfirmText}>Confirmar</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    })}

                    {!isUser && item.followUp?.options && item.followUp.options.length > 0 && (
                        <View style={styles.optionsRow}>
                            {item.followUp.options.map((opt) => (
                                <TouchableOpacity key={opt.id} style={styles.optionChip} onPress={() => handleFollowUpOptionPress(opt)}>
                                    <Text style={styles.optionChipText}>{opt.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {!isUser && citationsSummary && (
                        <TouchableOpacity
                            onPress={() => setCitationsSheetFor(item)}
                            style={styles.citationsBtn}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver ${citationsSummary}`}
                        >
                            <Text style={styles.citationsText}>{citationsSummary}</Text>
                        </TouchableOpacity>
                    )}

                    {item.error && item.retryInput && (
                        <TouchableOpacity onPress={() => handleRetry(item.retryInput!, item.retryIdempotencyKey, item.retryActionDecision)} style={styles.retryBtn} disabled={isPending || retryBlockedUntil > Date.now()}>
                            <Text style={styles.retryText}>{retryBlockedUntil > Date.now() ? 'Espera el límite…' : 'Reintentar'}</Text>
                        </TouchableOpacity>
                    )}
                </BubbleContainer>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            {/* Darkens the waves behind the messages so the bubbles lead. */}
            <View pointerEvents="none" style={styles.veil} />

            <Glass style={[styles.header, { paddingTop: insets.top + space.xs }]} intensity={60}>
                <View style={styles.headerRow} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={8}>
                        <Ionicons name="chevron-back" size={26} color={colors.text} />
                    </TouchableOpacity>
                    <PingOrb size={36} state={isPending ? 'thinking' : 'idle'} paused={liveVoiceVisible} />
                    <View style={styles.headerInfo}>
                        <Text style={styles.title} numberOfLines={1}>{isMainCoreEntry ? 'Vorian' : 'Nuevo Agent'}</Text>
                        <Text style={styles.subtitle} numberOfLines={1}>{isMainCoreEntry ? 'Tu asistente de compromisos' : 'Preview interna · confirma antes de actuar'}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleClearHistory}
                        style={[styles.headerBtn, (!historyConversationId || isPending || isClearingHistory) && styles.headerBtnDisabled]}
                        disabled={!historyConversationId || isPending || isClearingHistory}
                        testID="ping-clear-history-button"
                        accessibilityRole="button"
                        accessibilityLabel="Limpiar chat de Vorian"
                    >
                        {isClearingHistory ? (
                            <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                            <Ionicons name="trash-outline" size={18} color={colors.text} />
                        )}
                    </TouchableOpacity>
                </View>
            </Glass>

            {/* Entering straight into voice, the chat stays unmounted so it cannot show for a frame. */}
            {!(liveVoiceVisible && voiceEntryRef.current) && <KeyboardAvoidingView
                style={styles.keyboardArea}
                behavior={getChatKeyboardBehavior(Platform.OS)}
                keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + headerHeight : getChatKeyboardOffset(Platform.OS, insets.bottom)}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyOrb}>
                            <PingOrb size={120} state={isPending ? 'thinking' : 'idle'} paused={liveVoiceVisible} />
                        </View>
                        <Text style={styles.emptyTitle}>Pregúntale a Vorian</Text>
                        <Text style={styles.emptySubtitle}>
                            Consulta tu información o pídele que haga algo. Vorian solo actuará después de pedirte confirmación.
                        </Text>
                        <View style={styles.startersWrap}>
                            {starters.map((starter, index) => (
                                <Reanimated.View key={starter} entering={FadeInDown.delay(80 + index * 60).duration(360)}>
                                    <TouchableOpacity onPress={() => handleStarterPress(starter)} activeOpacity={0.75}>
                                        <Glass style={styles.starterChip} intensity={30}>
                                            <Ionicons name="sparkles-outline" size={17} color={colors.accentBright} />
                                            <Text style={styles.starterChipText}>{starter}</Text>
                                            <Ionicons name="arrow-forward" size={15} color={colors.textFaint} />
                                        </Glass>
                                    </TouchableOpacity>
                                </Reanimated.View>
                            ))}
                        </View>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        style={styles.messageList}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        extraData={isPending}
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                        contentContainerStyle={styles.listContent}
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {isPending && (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={colors.accentBright} />
                        <Text style={styles.loadingText}>
                            {isSlow ? 'Sigo buscando…' : 'Pensando…'}
                        </Text>
                    </View>
                )}

                {(voiceCopy || voiceError) && voice.state !== 'capturing' && voice.state !== 'listening' && (
                    <View style={styles.voiceStatusRow}>
                        <Text style={[styles.voiceStatusText, voiceError && styles.voiceErrorText]} numberOfLines={2}>
                            {voiceError || voiceCopy}
                        </Text>
                        {(voice.permission === 'blocked' || voice.permission === 'restricted') && voiceError && (
                            <TouchableOpacity onPress={voice.openSettings} accessibilityRole="button" accessibilityLabel="Abrir ajustes">
                                <Text style={styles.voiceSettingsLink}>Ajustes</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) + space.xs }]}>
                    {voice.state === 'listening' || voice.state === 'capturing' ? (
                        <View style={styles.inputContainer}>
                            <TouchableOpacity
                                style={[styles.roundBtn, styles.roundBtnDanger]}
                                onPress={voice.cancel}
                                accessibilityRole="button"
                                accessibilityLabel="Cancelar grabación"
                            >
                                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                            </TouchableOpacity>
                            <Glass style={[styles.field, styles.fieldRecording]} intensity={50}>
                                <View style={styles.recordingStatus}>
                                    <View style={styles.recordingDot} />
                                    <View style={styles.recordingCopy}>
                                        <Text style={styles.recordingTitle}>{voice.state === 'listening' ? 'Preparando…' : 'Escuchando…'}</Text>
                                        <Text style={styles.recordingHint}>Toca para terminar</Text>
                                    </View>
                                    <Text style={styles.recordingTime}>{formatRecordingDuration(voice.durationMs)}</Text>
                                </View>
                            </Glass>
                            <TouchableOpacity
                                style={[styles.sendBtn, voice.state !== 'capturing' && styles.sendBtnDisabled]}
                                onPress={voice.stop}
                                disabled={voice.state !== 'capturing'}
                                accessibilityRole="button"
                                accessibilityLabel="Detener grabación"
                            >
                                <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.circleFill}>
                                    <Ionicons name="checkmark" size={20} color={colors.onAccent} />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    ) : voice.state === 'transcribing' ? (
                        <View style={styles.inputContainer}>
                            <Glass style={styles.field} intensity={50}>
                                <View style={styles.recordingStatus}>
                                    <ActivityIndicator size="small" color={colors.accentBright} />
                                    <Text style={styles.transcribingText}>Transcribiendo…</Text>
                                </View>
                            </Glass>
                            <TouchableOpacity
                                onPress={voice.cancel}
                                accessibilityRole="button"
                                accessibilityLabel="Cancelar transcripción"
                            >
                                <Glass style={styles.roundBtn} intensity={50}>
                                    <Ionicons name="close" size={20} color={colors.text} />
                                </Glass>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.inputContainer}>
                            <Glass style={styles.field} intensity={50}>
                                <TextInput
                                    ref={inputRef}
                                    style={styles.input}
                                    placeholder="Escribe tu pregunta…"
                                    placeholderTextColor={colors.textFaint}
                                    selectionColor={colors.accent}
                                    value={inputText}
                                    onChangeText={handleInputChange}
                                    multiline
                                    maxLength={2000}
                                    editable={!isPending}
                                />
                            </Glass>
                            {inputText.trim() ? (
                                <TouchableOpacity
                                    style={[styles.sendBtn, !canSendInput(inputText, isPending) && styles.sendBtnDisabled]}
                                    onPress={handleSend}
                                    disabled={!canSendInput(inputText, isPending)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Enviar"
                                >
                                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.circleFill}>
                                        <Ionicons name="send" size={18} color={colors.onAccent} />
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : liveVoiceEnabled ? (
                                <TouchableOpacity
                                    style={styles.talkBtn}
                                    onPress={openLiveVoice}
                                    testID="ping-voice-button"
                                    accessibilityRole="button"
                                    accessibilityLabel="Abrir Vorian Voz"
                                >
                                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.talkFill}>
                                        <Ionicons name="mic" size={18} color={colors.onAccent} />
                                        <Text style={styles.talkText}>Hablar</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.sendBtn, isPending && styles.sendBtnDisabled]}
                                    onPress={voice.start}
                                    disabled={isPending}
                                    accessibilityRole="button"
                                    accessibilityLabel="Grabar pregunta por voz"
                                >
                                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.circleFill}>
                                        <Ionicons name="mic" size={20} color={colors.onAccent} />
                                    </LinearGradient>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>}

            <Modal visible={!!citationsSheetFor} transparent animationType="fade" onRequestClose={() => setCitationsSheetFor(null)}>
                <Pressable style={styles.sheetOverlay} onPress={() => setCitationsSheetFor(null)}>
                    <Reanimated.View entering={SlideInDown.duration(320)} style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
                        <SheetFill />
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Fuentes de esta respuesta</Text>
                        {describeCitationTypes(citationsSheetFor?.citations).map((label, idx) => {
                            const citation = citationsSheetFor!.citations![idx];
                            const kind = citationKindLabel(citation);
                            return (
                                <View key={`${citation.sourceId}-${idx}`} style={styles.sheetRow}>
                                    <View style={styles.sheetRowIcon}>
                                        <Ionicons name={CITATION_ICONS[citation.sourceType] ?? 'document-text-outline'} size={17} color={colors.accentBright} />
                                    </View>
                                    <View style={styles.sheetRowCopy}>
                                        <Text style={styles.sheetRowText} numberOfLines={2}>{label}</Text>
                                        {label !== kind && <Text style={styles.sheetRowKind}>{kind}</Text>}
                                    </View>
                                </View>
                            );
                        })}
                        <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setCitationsSheetFor(null)}>
                            <Text style={styles.sheetCloseText}>Cerrar</Text>
                        </TouchableOpacity>
                    </Reanimated.View>
                </Pressable>
            </Modal>
            <LiveVoiceSession
                visible={liveVoiceVisible}
                instant={voiceEntryRef.current}
                conversationId={historyConversationId}
                briefing={pendingBriefing}
                onClose={closeLiveVoice}
            />
            <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
        </View>
    );
}

const FIELD_HEIGHT = 46;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.chatVeil },
    header: {
        paddingHorizontal: space.sm,
        paddingBottom: space.sm + 2,
        borderWidth: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        zIndex: 10,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    backBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerInfo: { flex: 1, justifyContent: 'center', marginLeft: 2 },
    title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2, color: colors.text },
    subtitle: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 1 },
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    headerBtnDisabled: { opacity: 0.5 },

    keyboardArea: { flex: 1 },
    messageList: { flex: 1 },
    // Leave room for the fixed composer so Confirm/Cancel buttons never
    // sit behind it on short iPhone viewports.
    listContent: { padding: 16, paddingBottom: 180 },
    messageRow: { flexDirection: 'row', marginBottom: space.md },
    agentRow: { justifyContent: 'flex-start' },
    userRow: { justifyContent: 'flex-end' },

    bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, overflow: 'hidden' },
    agentBubble: {
        backgroundColor: colors.bubbleThem,
        borderBottomLeftRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    userBubble: { borderBottomRightRadius: 6 },
    errorBubble: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: colors.danger },

    messageText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text, lineHeight: 21 },
    userMessageText: { color: colors.onAccent },
    turnLabel: { ...type.overline, color: colors.accentBright, marginBottom: 5 },

    optionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm, gap: 6 },
    optionChip: {
        backgroundColor: colors.accentTint,
        borderRadius: radius.full,
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    optionChipText: { fontFamily: fonts.semibold, color: colors.accentBright, fontSize: 13 },

    pendingAction: {
        marginTop: 10,
        padding: space.md,
        borderRadius: radius.md,
        gap: 10,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    pendingActionSummary: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.text },
    pendingActionButtons: { flexDirection: 'row', gap: space.sm },
    pendingActionBtn: {
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        paddingHorizontal: space.md,
        overflow: 'hidden',
    },
    pendingActionCancel: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    pendingActionCancelText: { fontFamily: fonts.semibold, color: colors.text, fontSize: 15 },
    pendingActionConfirm: {},
    pendingActionConfirmText: { fontFamily: fonts.bold, color: colors.onAccent, fontSize: 15 },
    pendingActionDisabled: { opacity: 0.6 },

    citationsBtn: { marginTop: space.sm, alignSelf: 'flex-start', paddingVertical: 4 },
    citationsText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, textDecorationLine: 'underline' },

    retryBtn: { marginTop: space.sm, alignSelf: 'flex-start' },
    retryText: { fontFamily: fonts.bold, fontSize: 13, color: colors.danger },

    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
    emptyOrb: { marginBottom: space.md },
    emptyTitle: { ...type.title, marginBottom: space.sm },
    emptySubtitle: { ...type.subhead, textAlign: 'center', marginBottom: space.xl },
    startersWrap: { width: '100%', gap: space.sm },
    starterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        borderRadius: radius.lg,
        paddingHorizontal: space.lg,
        paddingVertical: 14,
    },
    starterChipText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },

    composer: { paddingHorizontal: space.md, paddingTop: space.xs },
    inputContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
    field: { flex: 1, minHeight: FIELD_HEIGHT, borderRadius: FIELD_HEIGHT / 2, justifyContent: 'center' },
    fieldRecording: { borderColor: colors.danger },
    input: {
        fontFamily: fonts.regular,
        paddingHorizontal: space.lg,
        paddingTop: Platform.OS === 'android' ? 12 : 13,
        paddingBottom: Platform.OS === 'android' ? 10 : 12,
        fontSize: 15,
        lineHeight: 20,
        minHeight: FIELD_HEIGHT,
        maxHeight: 120,
        includeFontPadding: false,
        color: colors.text,
    },
    roundBtn: {
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roundBtnDanger: { backgroundColor: colors.glassDim, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger },
    sendBtn: { width: FIELD_HEIGHT, height: FIELD_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    talkBtn: { height: FIELD_HEIGHT, borderRadius: FIELD_HEIGHT / 2, overflow: 'hidden' },
    talkFill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
    talkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onAccent },
    circleFill: {
        width: FIELD_HEIGHT,
        height: FIELD_HEIGHT,
        borderRadius: FIELD_HEIGHT / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },

    voiceStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        paddingBottom: 6,
        gap: space.sm,
    },
    voiceStatusText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.textSoft, fontStyle: 'italic' },
    voiceErrorText: { color: colors.danger, fontStyle: 'normal' },
    voiceSettingsLink: { fontFamily: fonts.bold, fontSize: 12, color: colors.accentBright },

    recordingStatus: { minHeight: FIELD_HEIGHT, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm + 1 },
    recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
    recordingCopy: { flex: 1 },
    recordingTitle: { fontFamily: fonts.semibold, color: colors.text, fontSize: 13 },
    recordingHint: { fontFamily: fonts.regular, color: colors.textFaint, fontSize: 10, marginTop: 1 },
    recordingTime: {
        fontFamily: fonts.bold,
        minWidth: 42,
        color: colors.danger,
        fontSize: 14,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
    },
    transcribingText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },

    loadingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.sm },
    loadingText: { marginLeft: space.sm, fontFamily: fonts.regular, fontSize: 13, color: colors.textSoft, fontStyle: 'italic' },

    sheetOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheetCard: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingTop: space.sm,
        paddingHorizontal: space.xl,
        ...sheetSurface,
    },
    sheetHandle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.glassBorder, marginBottom: space.md },
    sheetTitle: { ...type.title, marginBottom: space.md },
    sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.md },
    sheetRowIcon: {
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentTint,
    },
    sheetRowCopy: { flex: 1 },
    sheetRowText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
    sheetRowKind: { ...type.caption, color: colors.textFaint, marginTop: 1 },
    sheetCloseBtn: { marginTop: space.md, alignItems: 'center', paddingVertical: 14 },
    sheetCloseText: { fontFamily: fonts.semibold, color: colors.textSoft, fontSize: 15 },
});
