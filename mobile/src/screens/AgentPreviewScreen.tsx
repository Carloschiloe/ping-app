// M-1G — Preview interna del nuevo Ping Agent (read-only, POST /agent/respond).
// Coexiste con PingAIScreen (legacy, /ai/ask) sin reemplazarlo. Historial
// SOLO en estado local de esta pantalla -- nunca ai_messages, nunca DB
// nueva (sección 6/23 del ticket).
import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
    StatusBar, Modal, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAgentRespond, type AgentFollowUpOption } from '../api/query-modules/agent';
import { mapAgentErrorMessage } from '../api/query-modules/agent';
import {
    AGENT_SUGGESTED_STARTERS, appendAgentMessage, appendErrorMessage, appendUserMessage,
    canSendInput, describeCitationsSummary, describeCitationTypes, type AgentChatMessage,
} from '../utils/agentChat';
import { getChatKeyboardBehavior, getChatKeyboardOffset } from '../utils/chatKeyboard';
import { useAppTheme } from '../theme/ThemeContext';
import type { AgentPreviewScreenProps } from '../navigation/types';

// Sección 17 del ticket: staging puede tardar tras cold start -- no se
// cancela, sólo se cambia el copy para que la espera se sienta viva.
const SLOW_REQUEST_COPY_DELAY_MS = 10_000;

export default function AgentPreviewScreen({ navigation, route }: AgentPreviewScreenProps) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
    const conversationId = route.params?.conversationId;

    const [messages, setMessages] = useState<AgentChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isSlow, setIsSlow] = useState(false);
    const [citationsSheetFor, setCitationsSheetFor] = useState<AgentChatMessage | null>(null);
    const listRef = useRef<FlatList>(null);
    const isMountedRef = useRef(true);
    const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { mutate: respond, isPending } = useAgentRespond();

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        };
    }, []);

    useEffect(() => {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    const sendInput = (rawInput: string) => {
        const trimmed = rawInput.trim();
        if (!canSendInput(trimmed, isPending)) return;

        setMessages((prev) => appendUserMessage(prev, trimmed));
        setInputText('');
        setIsSlow(false);
        slowTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setIsSlow(true);
        }, SLOW_REQUEST_COPY_DELAY_MS);

        respond({ input: trimmed, conversationId }, {
            onSuccess: (result) => {
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
                if (!isMountedRef.current) return;
                setIsSlow(false);
                setMessages((prev) => appendAgentMessage(prev, result));
            },
            onError: (error) => {
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
                if (!isMountedRef.current) return;
                setIsSlow(false);
                setMessages((prev) => appendErrorMessage(prev, mapAgentErrorMessage(error), trimmed));
            },
        });
    };

    const handleSend = () => sendInput(inputText);
    const handleRetry = (retryInput: string) => sendInput(retryInput);
    const handleStarterPress = (starter: string) => setInputText(starter);
    const handleFollowUpOptionPress = (option: AgentFollowUpOption) => setInputText(option.label);

    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const renderItem = ({ item }: { item: AgentChatMessage }) => {
        const isUser = item.role === 'user';
        const citationsSummary = describeCitationsSummary(item.citations);

        return (
            <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.agentBubble, item.error && styles.errorBubble]}>
                    <Text style={[styles.messageText, isUser && styles.userMessageText]}>{item.text}</Text>

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
                        <TouchableOpacity onPress={() => setCitationsSheetFor(item)} style={styles.citationsBtn}>
                            <Text style={styles.citationsText}>{citationsSummary}</Text>
                        </TouchableOpacity>
                    )}

                    {item.error && item.retryInput && (
                        <TouchableOpacity onPress={() => handleRetry(item.retryInput!)} style={styles.retryBtn} disabled={isPending}>
                            <Text style={styles.retryText}>Reintentar</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <StatusBar barStyle={theme.isDark ? 'light-content' : 'light-content'} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Volver">
                    <Ionicons name="arrow-back" size={24} color={theme.colors.white} />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.title}>Nuevo Agent</Text>
                    <Text style={styles.subtitle}>Preview interna · read-only</Text>
                </View>
                <View style={styles.headerBtn} />
            </View>

            <KeyboardAvoidingView
                style={styles.keyboardArea}
                behavior={getChatKeyboardBehavior(Platform.OS)}
                keyboardVerticalOffset={getChatKeyboardOffset(Platform.OS, insets.bottom)}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyTitle}>Pregúntale a Ping</Text>
                        <Text style={styles.emptySubtitle}>
                            Puede consultar tus compromisos, mensajes y documentos. Todavía no puede crear ni modificar nada.
                        </Text>
                        <View style={styles.startersWrap}>
                            {AGENT_SUGGESTED_STARTERS.map((starter) => (
                                <TouchableOpacity key={starter} style={styles.starterChip} onPress={() => handleStarterPress(starter)}>
                                    <Text style={styles.starterChipText}>{starter}</Text>
                                </TouchableOpacity>
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
                        contentContainerStyle={styles.listContent}
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {isPending && (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={theme.colors.info} />
                        <Text style={styles.loadingText}>{isSlow ? 'Sigo buscando…' : 'Pensando…'}</Text>
                    </View>
                )}

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Escribe tu pregunta…"
                        placeholderTextColor={theme.colors.text.muted}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={2000}
                        editable={!isPending}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, !canSendInput(inputText, isPending) && styles.sendBtnDisabled]}
                        onPress={handleSend}
                        disabled={!canSendInput(inputText, isPending)}
                        accessibilityRole="button"
                        accessibilityLabel="Enviar"
                    >
                        <Ionicons name="send" size={20} color={theme.colors.white} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            <Modal visible={!!citationsSheetFor} transparent animationType="fade" onRequestClose={() => setCitationsSheetFor(null)}>
                <Pressable style={styles.sheetOverlay} onPress={() => setCitationsSheetFor(null)}>
                    <View style={styles.sheetCard}>
                        <Text style={styles.sheetTitle}>Fuentes de esta respuesta</Text>
                        {describeCitationTypes(citationsSheetFor?.citations).map((label, idx) => (
                            <View key={`${label}-${idx}`} style={styles.sheetRow}>
                                <Ionicons name="document-text-outline" size={18} color={theme.colors.text.secondary} />
                                <Text style={styles.sheetRowText}>{label}</Text>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setCitationsSheetFor(null)}>
                            <Text style={styles.sheetCloseText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        header: {
            backgroundColor: theme.colors.primary,
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: 16, paddingVertical: 12,
        },
        headerBtn: { padding: 8, width: 40 },
        headerInfo: { flex: 1, alignItems: 'center' },
        title: { color: theme.colors.white, fontSize: 18, fontWeight: '700' },
        subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

        keyboardArea: { flex: 1 },
        messageList: { flex: 1 },
        listContent: { padding: 16, paddingBottom: 24 },
        messageRow: { flexDirection: 'row', marginBottom: 12 },
        agentRow: { justifyContent: 'flex-start' },
        userRow: { justifyContent: 'flex-end' },

        bubble: { maxWidth: '85%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
        agentBubble: { backgroundColor: theme.colors.bubbleThem, borderBottomLeftRadius: 4 },
        userBubble: { backgroundColor: theme.colors.info, borderBottomRightRadius: 4 },
        errorBubble: { backgroundColor: theme.isDark ? '#3a1f1f' : '#fee2e2', borderWidth: 1, borderColor: theme.colors.danger },

        messageText: { fontSize: 15, color: theme.colors.bubbleTextThem, lineHeight: 20 },
        userMessageText: { color: theme.colors.white },

        optionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
        optionChip: {
            backgroundColor: theme.colors.accentSoft, borderRadius: 14,
            paddingHorizontal: 10, paddingVertical: 6,
        },
        optionChipText: { color: theme.colors.accent, fontSize: 13, fontWeight: '600' },

        citationsBtn: { marginTop: 8, alignSelf: 'flex-start' },
        citationsText: { fontSize: 12, color: theme.colors.text.muted, textDecorationLine: 'underline' },

        retryBtn: { marginTop: 8, alignSelf: 'flex-start' },
        retryText: { fontSize: 13, color: theme.colors.danger, fontWeight: '700' },

        emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
        emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text.primary, marginBottom: 8 },
        emptySubtitle: { fontSize: 14, color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 20 },
        startersWrap: { width: '100%', gap: 8 },
        starterChip: {
            backgroundColor: theme.colors.surfaceMuted, borderRadius: 14,
            paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border,
        },
        starterChipText: { fontSize: 14, color: theme.colors.text.primary },

        inputContainer: {
            flexDirection: 'row', alignItems: 'center',
            padding: 12, backgroundColor: theme.colors.surface,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
        },
        input: {
            flex: 1, backgroundColor: theme.colors.surfaceMuted,
            borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8,
            fontSize: 15, maxHeight: 100, color: theme.colors.text.primary,
        },
        sendBtn: {
            backgroundColor: theme.colors.info, width: 40, height: 40, borderRadius: 20,
            alignItems: 'center', justifyContent: 'center',
        },
        sendBtnDisabled: { backgroundColor: theme.colors.text.muted },

        loadingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
        loadingText: { marginLeft: 8, fontSize: 13, color: theme.colors.text.secondary, fontStyle: 'italic' },

        sheetOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
        sheetCard: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
        sheetTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text.primary, marginBottom: 12 },
        sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
        sheetRowText: { fontSize: 14, color: theme.colors.text.primary },
        sheetCloseBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
        sheetCloseText: { color: theme.colors.info, fontWeight: '700', fontSize: 15 },
    });
}
