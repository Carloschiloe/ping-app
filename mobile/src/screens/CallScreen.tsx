import React, { useEffect, useRef, useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    SafeAreaView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ping-app-con3.onrender.com/api';
const CALL_BASE_URL = API_URL.replace('/api', '');

const CallScreen = ({ route, navigation }: any) => {
    const { conversationId, isVideo = true, remoteUser } = route.params;
    const [loading, setLoading] = useState(true);
    const [callUrl, setCallUrl] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(!isVideo);
    const webviewRef = useRef<any>(null);

    useEffect(() => {
        fetchToken();
    }, []);

    const fetchToken = async () => {
        try {
            const { token, appId } = await apiClient.get(`/agora/token/${conversationId}`);
            const url = `${CALL_BASE_URL}/call?appId=${appId}&token=${encodeURIComponent(token)}&channel=${encodeURIComponent(conversationId)}&video=${isVideo}`;
            setCallUrl(url);
        } catch (error: any) {
            Alert.alert('Error', 'No se pudo obtener el token de llamada: ' + error.message);
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const toggleMute = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newState = !isMuted;
        setIsMuted(newState);
        webviewRef.current?.injectJavaScript(`window.toggleMute(${newState}); true;`);
    };

    const toggleVideo = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newState = !isVideoOff;
        setIsVideoOff(newState);
        webviewRef.current?.injectJavaScript(`window.toggleVideo(${newState}); true;`);
    };

    const hangup = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        webviewRef.current?.injectJavaScript(`window.leaveCall && window.leaveCall(); true;`);
        navigation.goBack();
    };

    if (loading || !callUrl) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Conectando...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <WebView
                ref={webviewRef}
                source={{ uri: callUrl }}
                style={StyleSheet.absoluteFillObject}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                javaScriptEnabled
                domStorageEnabled
                allowsFullscreenVideo
                onPermissionRequest={(request: any) => request.grant(request.resources)}
                onError={(e: any) => console.error('[WebView Error]', e.nativeEvent.description)}
                originWhitelist={['*']}
            />

            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
                <View style={styles.header} pointerEvents="box-none">
                    <View style={styles.encryptedHeader}>
                        <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.encryptedText}>Cifrado de extremo a extremo</Text>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.callerName} numberOfLines={1}>
                        {remoteUser?.full_name || remoteUser?.email?.split('@')[0] || 'Ping'}
                    </Text>
                    <View style={styles.controlsRow}>
                        <TouchableOpacity
                            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                            onPress={toggleMute}
                        >
                            <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.controlBtn, styles.hangupBtn]} onPress={hangup}>
                            <Ionicons name="call" size={28} color="white" />
                        </TouchableOpacity>

                        {isVideo && (
                            <TouchableOpacity
                                style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
                                onPress={toggleVideo}
                            >
                                <Ionicons name={isVideoOff ? 'videocam-off' : 'videocam'} size={24} color="white" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
    loadingText: { marginTop: 16, fontSize: 16, color: '#94a3b8', fontWeight: '600' },
    overlay: { flex: 1, justifyContent: 'space-between' },
    header: { paddingTop: 12, paddingHorizontal: 20, alignItems: 'center' },
    encryptedHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 20,
    },
    encryptedText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    footer: { paddingBottom: 48, alignItems: 'center', gap: 20 },
    callerName: { color: 'white', fontSize: 22, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
    controlBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    controlBtnActive: { backgroundColor: '#3b82f6' },
    hangupBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#ef4444' },
});

export default CallScreen;
