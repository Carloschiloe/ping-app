import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Localization from 'expo-localization';
import { getAuthHeaders, API_URL } from '../../api/client';
import { getDeviceTimeZone } from '../../utils/timeZone';
import { createEphemeralUuid } from '../../utils/voiceSession';

interface LiveVoiceSessionProps {
    visible: boolean;
    conversationId?: string;
    onClose: () => void;
}

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
};

function deviceLocale(): string {
    try {
        const locale = Localization.getLocales?.()[0];
        if (locale?.languageTag) return locale.languageTag;
        if (locale?.languageCode) return locale.regionCode ? `${locale.languageCode}-${locale.regionCode}` : locale.languageCode;
    } catch { /* fallback below */ }
    return 'es-CL';
}

export function LiveVoiceSession({ visible, conversationId, onClose }: LiveVoiceSessionProps) {
    const [authorization, setAuthorization] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sessionKey, setSessionKey] = useState(0);
    const webViewRef = useRef<WebView>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const config = useMemo<LiveConfig | null>(() => authorization ? {
        apiUrl: API_URL.replace(/\/$/, ''),
        authorization,
        protocolVersion: 1,
        handshakeId: createEphemeralUuid(),
        conversationId,
        voiceSessionId: createEphemeralUuid(),
        deviceSessionId: createEphemeralUuid(),
        locale: deviceLocale(),
        timezone: getDeviceTimeZone(),
    } : null, [authorization, conversationId]);

    useEffect(() => {
        if (!visible) return;
        setError(null);
        let active = true;
        void getAuthHeaders().then((headers) => {
            if (active) setAuthorization(headers.Authorization || null);
        }).catch(() => { if (active) setError('No se pudo autenticar la sesión de voz.'); });
        return () => { active = false; setAuthorization(null); };
    }, [visible]);

    const injected = config ? `(function(){window.__PING_CONFIG=${JSON.stringify(config).replace(/</g, '\\u003c')};window.dispatchEvent(new Event('ping-config'));try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'native_ready',protocolVersion:1,handshakeId:window.__PING_CONFIG.handshakeId}))}catch{};true;})()` : '';
    const injectConfig = () => {
        if (injected) webViewRef.current?.injectJavaScript(injected);
    };
    const retry = () => {
        setError(null);
        setSessionKey((value) => value + 1);
    };
    const scheduleClose = () => {
        if (closeTimerRef.current) return;
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            onClose();
        }, 400);
    };
    const requestClose = () => {
        if (!webViewRef.current) {
            onClose();
            return;
        }
        scheduleClose();
        try {
            webViewRef.current.injectJavaScript("document.getElementById('stop')?.click();true;");
        } catch {
            onClose();
        }
    };
    const handleMessage = (event: WebViewMessageEvent) => {
        try {
            const message = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (message.type === 'closed') scheduleClose();
            if (message.type === 'config_requested' || message.type === 'webview_ready') injectConfig();
            if (message.type === 'retry') retry();
            if (message.type === 'error') setError('No se pudo iniciar la conversación de voz.');
        } catch { /* WebView telemetry is already sent to staging. */ }
    };

    return <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
        <View style={styles.container}>
            <View style={styles.topbar}><Text style={styles.title}>Ping Voz</Text><TouchableOpacity onPress={requestClose}><Text style={styles.close}>Cerrar</Text></TouchableOpacity></View>
            {visible && (error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={retry}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity></View>
                : config ? <WebView
                    key={sessionKey}
                    ref={webViewRef}
                    source={{ uri: `${API_URL.replace(/\/$/, '')}/agent/voice/live/client` }}
                    injectedJavaScriptBeforeContentLoaded={injected}
                    onLoadEnd={injectConfig}
                    onMessage={handleMessage}
                    onError={() => setError('No se pudo cargar la interfaz de voz.')}
                    onHttpError={() => setError('El servidor de voz no está disponible.')}
                    javaScriptEnabled
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback
                    originWhitelist={['https://*']}
                />
                : <ActivityIndicator style={styles.loading} />)}
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#091426' },
    topbar: { paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: '#122c52', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: '#fff', fontSize: 18, fontWeight: '700' },
    close: { color: '#b8d3ff', fontSize: 15, fontWeight: '600' },
    loading: { flex: 1 },
    error: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    errorText: { color: '#fff', textAlign: 'center', fontSize: 16 },
    retry: { color: '#8bb8ff', marginTop: 20, fontWeight: '700' },
});
