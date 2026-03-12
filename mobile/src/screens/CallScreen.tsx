import React, { useEffect, useRef, useState } from 'react';
import {
    StyleSheet, View, Text, TouchableOpacity,
    SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';
import { supabase } from '../lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ping-app-con3.onrender.com/api';
const CALL_BASE_URL = API_URL.replace('/api', '');

const CallScreen = ({ route, navigation }: any) => {
    const { conversationId, isVideo = true, remoteUser } = route.params;
    const [loading, setLoading] = useState(true);
    const [callUrl, setCallUrl] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(!isVideo);
    const webviewRef = useRef<any>(null);
    const channelRef = useRef<any>(null);
    const isHangingUp = useRef(false);

    useEffect(() => {
        fetchToken();
        setupCallChannel();

        return () => {
            // Cleanup Realtime channel on unmount
            channelRef.current?.unsubscribe();
        };
    }, []);

    const setupCallChannel = () => {
        // Subscribe to Supabase Realtime for this call channel
        const channel = supabase.channel(`call:${conversationId}`, {
            config: { broadcast: { self: false } },
        });

        channel
            .on('broadcast', { event: 'hangup' }, () => {
                console.log('[Realtime] Received hangup broadcast from other party');
                // Other party hung up
                if (!isHangingUp.current) {
                    isHangingUp.current = true;
                    webviewRef.current?.injectJavaScript(`window.leaveCall && window.leaveCall(); true;`);
                    navigation.goBack();
                }
            })
            .subscribe((status) => {
                console.log(`[Realtime] Call channel status for ${conversationId}: ${status}`);
            });

        channelRef.current = channel;
    };

    const fetchToken = async () => {
        try {
            const { token, appId } = await apiClient.get(`/agora/token/${conversationId}`);
            const ts = Date.now();
            const url = `${CALL_BASE_URL}/call?appId=${appId}&token=${encodeURIComponent(token)}&channel=${encodeURIComponent(conversationId)}&video=${isVideo}&t=${ts}`;
            setCallUrl(url);

            // Notify the other user(s) via push + realtime
            try {
                await apiClient.post(`/agora/call/notify`, {
                    conversationId,
                    callType: isVideo ? 'video' : 'voice'
                });
            } catch (notifyErr) {
                console.log('[notifyCall] soft fail:', notifyErr);
            }
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

    const hangup = async () => {
        if (isHangingUp.current) return;
        isHangingUp.current = true;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Signal to the other party via Supabase Realtime
        console.log('[CallScreen] Sending hangup broadcast...');
        channelRef.current?.send({
            type: 'broadcast',
            event: 'hangup',
            payload: {},
        }).then((resp: any) => {
            console.log('[CallScreen] Hangup broadcast result:', resp);
        }).catch((err: any) => {
            console.error('[CallScreen] Hangup broadcast error:', err);
        });

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

    const displayName = remoteUser?.full_name || remoteUser?.email?.split('@')[0] || 'Ping';

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
                onMessage={(event: any) => {
                    if (event.nativeEvent.data === 'hangup') {
                        console.log('[CallScreen] Received hangup from WebView');
                        hangup();
                    }
                }}
                originWhitelist={['*']}
            />

            {/* Controls overlay */}
            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
                {/* Top bar */}
                <View style={styles.header} pointerEvents="box-none">
                    <View style={styles.encryptedHeader}>
                        <Ionicons name="lock-closed" size={11} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.encryptedText}>Cifrado de extremo a extremo</Text>
                    </View>
                </View>

                {/* Bottom controls */}
                <View style={styles.footer}>
                    <Text style={styles.callerName} numberOfLines={1}>{displayName}</Text>

                    <View style={styles.controlsRow}>
                        <View style={styles.controlCol}>
                            <TouchableOpacity
                                style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                                onPress={toggleMute}
                            >
                                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="white" />
                            </TouchableOpacity>
                            <Text style={styles.controlLabel}>{isMuted ? 'Silenciado' : 'Micrófono'}</Text>
                        </View>

                        <View style={styles.controlCol}>
                            <TouchableOpacity style={[styles.controlBtn, styles.hangupBtn]} onPress={hangup}>
                                <Ionicons name="call" size={28} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
                            </TouchableOpacity>
                            <Text style={styles.controlLabel}>Colgar</Text>
                        </View>

                        {isVideo && (
                            <View style={styles.controlCol}>
                                <TouchableOpacity
                                    style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
                                    onPress={toggleVideo}
                                >
                                    <Ionicons name={isVideoOff ? 'videocam-off' : 'videocam'} size={24} color="white" />
                                </TouchableOpacity>
                                <Text style={styles.controlLabel}>{isVideoOff ? 'Cámara off' : 'Cámara'}</Text>
                            </View>
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
    encryptedText: {
        color: 'rgba(255,255,255,0.7)', fontSize: 10,
        fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase',
    },
    footer: { paddingBottom: 48, alignItems: 'center', gap: 16 },
    callerName: {
        color: 'white', fontSize: 20, fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    },
    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    controlCol: { alignItems: 'center', gap: 8 },
    controlBtn: {
        width: 58, height: 58, borderRadius: 29,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
    controlBtnActive: { backgroundColor: '#3b82f6' },
    hangupBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ef4444' },
    controlLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
});

export default CallScreen;
