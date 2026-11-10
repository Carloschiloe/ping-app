import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
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
import { GlassBackdrop } from '../../design/Glass';

// The voice page draws over the app's own glass background, keeping only its blue glow.
const SEE_THROUGH_PAGE = `(function(){var add=function(){var s=document.createElement('style');s.textContent='html,body{background:radial-gradient(120% 60% at 50% 46%,${colors.accentTint},transparent 60%) transparent!important}';document.head.appendChild(s)};if(document.head)add();else document.addEventListener('DOMContentLoaded',add);})();`;

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

const KEEP_AWAKE_TAG = 'vorian-live-voice';

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
                        ? 'Vorian necesita permiso para usar el micrófono.'
                        : 'El micrófono está bloqueado para Vorian. Habilítalo en la configuración del teléfono.');
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

    // The screen stays on while talking: if it turned off, Android would pause
    // the voice page and the conversation would drop.
    useEffect(() => {
        if (!visible) return;
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
        return () => { void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined); };
    }, [visible]);

    // Android's back button ends the conversation like the back arrow does.
    useEffect(() => {
        if (!visible) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            requestClose();
            return true;
        });
        return () => subscription.remove();
    }, [requestClose, visible]);

    if (!visible) return null;
    // Drawn over the screen instead of in a separate window, so Android's own buttons keep the app's look.
    return <Reanimated.View entering={instant ? undefined : FadeIn.duration(180)} style={styles.overlay}>
        <GlassBackdrop>
            <View style={[styles.topbar, { paddingTop: insets.top + space.sm }]}>
                <TouchableOpacity onPress={requestClose} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Cerrar Vorian Voz" hitSlop={8}>
                    <Ionicons name="chevron-back" size={26} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.title}>Vorian</Text>
            </View>
            {error ? <View style={styles.error}>
                <View style={styles.errorIcon}>
                    <Ionicons name="mic-off-outline" size={28} color={colors.danger} />
                </View>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={retry} style={styles.retryBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Reintentar Vorian Voz">
                    <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <Text style={styles.retry}>{microphoneCanAskAgain ? 'Reintentar' : 'Abrir configuración'}</Text>
                </TouchableOpacity>
            </View> : microphoneReady && config ? <WebView
                key={sessionKey}
                ref={webViewRef}
                source={source}
                injectedJavaScriptBeforeContentLoaded={SEE_THROUGH_PAGE + injected}
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
            /> : <ActivityIndicator style={styles.loading} color={colors.accentBright} />}
        </GlassBackdrop>
    </Reanimated.View>;
}

const styles = StyleSheet.create({
    // Above the chat's header too, which sits raised on Android.
    overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, elevation: 20 },
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
    // Transparent, so the page never flashes a different color while it loads.
    webview: { backgroundColor: 'transparent' },
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
