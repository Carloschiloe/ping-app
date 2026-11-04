import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Localization from 'expo-localization';
import { getAuthHeaders, API_URL } from '../../api/client';
import { getDeviceTimeZone } from '../../utils/timeZone';
import { createEphemeralUuid } from '../../utils/voiceSession';
import { buildCallPageOriginWhitelist } from '../../utils/callBridge';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { colors, gradients, radius, space } from '../../design/tokens';
import { fonts, type } from '../../design/typography';

interface LiveVoiceSessionProps {
    visible: boolean;
    conversationId?: string;
    /** Show without the fade, for when Ping opens straight into voice. */
    instant?: boolean;
    /** `write` when the user chose to keep going by text, `leave` otherwise. */
    onClose: (reason: LiveVoiceCloseReason) => void;
}

export type LiveVoiceCloseReason = 'leave' | 'write';

type LiveConfig = {
    apiUrl: string;
    authorization: string;
    protocolVersion: number;
    handshakeId: string;
    conversationId?: string;
    voiceSessionId: string;
    deviceSessionId: string;
    locale: string;
    timezone: string;
    firstName?: string;
    canSwitchToText: boolean;
};

type LiveVoiceWebViewMessage = {
    type?: string;
    stage?: string;
    details?: {
        errorCode?: string;
    };
};

function voiceLocale(): string {
    try {
        const locale = Localization.getLocales?.()[0];
        const candidate = locale?.languageTag
            || (locale?.languageCode ? (locale.regionCode ? `${locale.languageCode}-${locale.regionCode}` : locale.languageCode) : null);
        if (candidate && /^es(?:-|$)/i.test(candidate)) return candidate;
    } catch { /* fallback below */ }
    return 'es-CL';
}

export function LiveVoiceSession({ visible, conversationId, instant = false, onClose }: LiveVoiceSessionProps) {
    const insets = useSafeAreaInsets();
    const { profile } = useAuth();
    const [authorization, setAuthorization] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [microphoneCanAskAgain, setMicrophoneCanAskAgain] = useState(true);
    const [microphoneReady, setMicrophoneReady] = useState(false);
    const [sessionKey, setSessionKey] = useState(0);
    const webViewRef = useRef<WebView>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeReasonRef = useRef<LiveVoiceCloseReason>('leave');
    const config = useMemo<LiveConfig | null>(() => authorization ? {
        apiUrl: API_URL.replace(/\/$/, ''),
        authorization,
        protocolVersion: 1,
        handshakeId: createEphemeralUuid(),
        conversationId,
        voiceSessionId: createEphemeralUuid(),
        deviceSessionId: createEphemeralUuid(),
        locale: voiceLocale(),
        timezone: getDeviceTimeZone(),
        firstName: profile?.full_name?.trim().split(/\s+/)[0] || undefined,
        canSwitchToText: true,
    } : null, [authorization, conversationId, profile?.full_name]);
    const injected = useMemo(() => config
        ? `(function(){window.__PING_CONFIG=${JSON.stringify(config).replace(/</g, '\\u003c')};window.dispatchEvent(new Event('ping-config'));try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'native_ready',protocolVersion:1,handshakeId:window.__PING_CONFIG.handshakeId}))}catch{};true;})()`
        : '', [config]);
    const source = useMemo(() => ({ uri: `${API_URL.replace(/\/$/, '')}/agent/voice/live/client` }), []);

    useEffect(() => {
        if (!visible) return;
        closeReasonRef.current = 'leave';
        setError(null);
        setAuthorization(null);
        setMicrophoneReady(false);
        let active = true;

        void (async () => {
            try {
                let permission = await getRecordingPermissionsAsync();
                if (!permission.granted && permission.canAskAgain) {
                    permission = await requestRecordingPermissionsAsync();
                }
                if (!active) return;
                setMicrophoneCanAskAgain(permission.canAskAgain);
                if (!permission.granted) {
                    setError(permission.canAskAgain
                        ? 'Ping necesita permiso para usar el micrófono.'
                        : 'El micrófono está bloqueado para Ping. Habilítalo en la configuración del teléfono.');
                    return;
                }

                setMicrophoneReady(true);
                const headers = await getAuthHeaders();
                if (active) setAuthorization(headers.Authorization || null);
            } catch {
                if (active) setError('No se pudo preparar el micrófono para la conversación de voz.');
            }
        })();
        return () => { active = false; setAuthorization(null); setMicrophoneReady(false); };
    }, [visible, sessionKey]);

    const injectConfig = useCallback(() => {
        if (injected) webViewRef.current?.injectJavaScript(injected);
    }, [injected]);
    const retry = useCallback(() => {
        if (!microphoneCanAskAgain) {
            void Linking.openSettings();
            return;
        }
        setError(null);
        setSessionKey((value) => value + 1);
    }, [microphoneCanAskAgain]);
    const scheduleClose = useCallback(() => {
        if (closeTimerRef.current) return;
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            onClose(closeReasonRef.current);
        }, 400);
    }, [onClose]);
    const requestClose = useCallback(() => {
        closeReasonRef.current = 'leave';
        if (!webViewRef.current) {
            onClose('leave');
            return;
        }
        scheduleClose();
        try {
            webViewRef.current.injectJavaScript("document.getElementById('stop')?.click();true;");
        } catch {
            onClose('leave');
        }
    }, [onClose, scheduleClose]);
    const androidWebViewProps = useMemo(() => Platform.OS === 'android'
        ? ({
            onPermissionRequest: (request: any) => {
                const requestedResources = request.resources.filter((resource: string) => resource === 'AUDIO_CAPTURE');
                if (requestedResources.length > 0) request.grant(requestedResources);
                else request.deny();
            },
        } as any)
        : {}, []);
    const handleMessage = useCallback((event: WebViewMessageEvent) => {
        try {
            const message = JSON.parse(event.nativeEvent.data) as LiveVoiceWebViewMessage;
            if (message.type === 'write') closeReasonRef.current = 'write';
            if (message.type === 'closed') scheduleClose();
            if (message.type === 'config_requested' || message.type === 'webview_ready') injectConfig();
            if (message.type === 'retry') retry();
            if (message.type === 'error') setError('No se pudo iniciar la conversación de voz.');
            if (message.type === 'm8_diagnostic_error') {
                const stage = typeof message.stage === 'string' && message.stage.trim() ? message.stage.trim() : 'conexión';
                const code = typeof message.details?.errorCode === 'string' && message.details.errorCode.trim()
                    ? ` (${message.details.errorCode.trim()})`
                    : '';
                setError(`No se pudo iniciar la conversación de voz en la etapa ${stage}${code}.`);
            }
        } catch { /* WebView telemetry is handled by the voice client. */ }
    }, [injectConfig, retry, scheduleClose]);

    useEffect(() => () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    return <Modal visible={visible} animationType={instant ? 'none' : 'fade'} statusBarTranslucent onRequestClose={requestClose}>
        <View style={styles.container}>
            <View style={[styles.topbar, { paddingTop: insets.top + space.sm }]}>
                <TouchableOpacity onPress={requestClose} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Cerrar Ping Voz" hitSlop={8}>
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Ping</Text>
            </View>
            {visible && (error ? <View style={styles.error}>
                <View style={styles.errorIcon}>
                    <Ionicons name="mic-off-outline" size={28} color={colors.danger} />
                </View>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={retry} style={styles.retryBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Reintentar Ping Voz">
                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <Text style={styles.retry}>{microphoneCanAskAgain ? 'Reintentar' : 'Abrir configuración'}</Text>
                </TouchableOpacity>
            </View> : microphoneReady && config ? <WebView
                key={sessionKey}
                ref={webViewRef}
                source={source}
                injectedJavaScriptBeforeContentLoaded={injected}
                onLoadEnd={injectConfig}
                onMessage={handleMessage}
                onError={() => setError('No se pudo cargar la interfaz de voz.')}
                onHttpError={() => setError('El servidor de voz no está disponible.')}
                {...androidWebViewProps}
                {...(Platform.OS === 'ios' ? { mediaCapturePermissionGrantType: 'grant' } : {})}
                javaScriptEnabled
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                originWhitelist={buildCallPageOriginWhitelist(API_URL)}
                style={styles.webview}
            /> : <ActivityIndicator style={styles.loading} color={colors.accentBright} />)}
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    topbar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.md,
        paddingBottom: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.glassBorder,
    },
    title: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
    backBtn: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
    // Same dark as the frame, so the voice page never flashes white while it loads.
    webview: { backgroundColor: colors.ink },
    loading: { flex: 1 },
    error: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl },
    errorIcon: {
        width: 64,
        height: 64,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.dangerTint,
        marginBottom: space.lg,
    },
    errorText: { ...type.body, textAlign: 'center' },
    retryBtn: {
        marginTop: space.xl,
        height: 48,
        paddingHorizontal: space.xxl,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    retry: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onAccent },
});
