
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
import {
    createAgoraRtcEngine,
    ChannelProfileType,
    ClientRoleType,
    RtcSurfaceView,
    RtcConnection,
    IRtcEngine,
} from 'react-native-agora';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { apiClient } from '../api/client';

const CallScreen = ({ route, navigation }: any) => {
    const { conversationId, isVideo = true, remoteUser } = route.params;
    const [joined, setJoined] = useState(false);
    const [remoteUid, setRemoteUid] = useState<number | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(!isVideo);
    const [loading, setLoading] = useState(true);

    const engineRef = useRef<IRtcEngine | null>(null);

    useEffect(() => {
        setupRTC();
        return () => {
            engineRef.current?.leaveChannel();
            engineRef.current?.release();
        };
    }, []);

    const setupRTC = async () => {
        try {
            // 1. Get Token from Backend
            const { token, appId } = await apiClient.get(`/agora/token/${conversationId}`);

            if (!appId) {
                Alert.alert('Error', 'Configuración de Agora no encontrada en el servidor.');
                navigation.goBack();
                return;
            }

            // 2. Initialize Engine
            const engine = createAgoraRtcEngine();
            engineRef.current = engine;

            engine.initialize({ appId });

            // 3. Setup Callbacks
            engine.registerEventHandler({
                onJoinChannelSuccess: (connection: RtcConnection, elapsed: number) => {
                    setJoined(true);
                    setLoading(false);
                },
                onUserJoined: (connection: RtcConnection, remoteUid: number, elapsed: number) => {
                    setRemoteUid(remoteUid);
                },
                onUserOffline: (connection: RtcConnection, remoteUid: number, reason: number) => {
                    setRemoteUid(null);
                    // Optionally end call if it's 1:1
                },
                onError: (err: number, msg: string) => {
                    console.error('[Agora Error]', err, msg);
                }
            });

            // 4. Configure based on type
            engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
            if (isVideo) {
                engine.enableVideo();
                engine.startPreview();
            }

            // 5. Join
            engine.joinChannel(token, conversationId, 0, {
                clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            });

        } catch (error: any) {
            console.error('[setupRTC] Failed:', error);
            Alert.alert('Error', 'No se pudo iniciar la llamada: ' + error.message);
            navigation.goBack();
        }
    };

    const toggleAudio = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newState = !isMuted;
        setIsMuted(newState);
        engineRef.current?.muteLocalAudioStream(newState);
    };

    const toggleVideo = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const newState = !isVideoOff;
        setIsVideoOff(newState);
        engineRef.current?.muteLocalVideoStream(newState);
    };

    const hangup = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.goBack();
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Conectando con Ping...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Remote Video (Background) */}
            {remoteUid && !isVideoOff ? (
                <RtcSurfaceView
                    canvas={{ uid: remoteUid }}
                    style={StyleSheet.absoluteFillObject}
                />
            ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.remotePlaceholder]}>
                    <Ionicons name="person" size={100} color="#cbd5e1" />
                    <Text style={styles.callerName}>{remoteUser?.full_name || 'Ping User'}</Text>
                    <Text style={styles.callStatus}>{remoteUid ? 'En línea' : 'Llamando...'}</Text>
                </View>
            )}

            {/* Local Video (Preview) */}
            {!isVideoOff && joined && (
                <View style={styles.localViewContainer}>
                    <RtcSurfaceView
                        canvas={{ uid: 0 }}
                        style={styles.localView}
                        zOrderMediaOverlay={true}
                    />
                </View>
            )}

            {/* Controls Overlay */}
            <SafeAreaView style={styles.overlay}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={hangup}>
                        <Ionicons name="chevron-down" size={28} color="white" />
                    </TouchableOpacity>
                    <View style={styles.encryptedHeader}>
                        <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.6)" />
                        <Text style={styles.encryptedText}>Cifrado de extremo a extremo</Text>
                    </View>
                </View>

                <View style={styles.footer}>
                    <View style={styles.controlsRow}>
                        <TouchableOpacity
                            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                            onPress={toggleAudio}
                        >
                            <Ionicons name={isMuted ? "mic-off" : "mic"} size={26} color={isMuted ? "white" : "white"} />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.controlBtn, styles.hangupBtn]} onPress={hangup}>
                            <Ionicons name="call" size={30} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
                            onPress={toggleVideo}
                        >
                            <Ionicons name={isVideoOff ? "videocam-off" : "videocam"} size={26} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' },
    loadingText: { marginTop: 16, fontSize: 16, color: '#64748b', fontWeight: '600' },
    remotePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
    callerName: { marginTop: 24, fontSize: 24, fontWeight: '800', color: 'white' },
    callStatus: { marginTop: 8, fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
    localViewContainer: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 120,
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: '#000',
    },
    localView: { flex: 1 },
    overlay: { flex: 1, justifyContent: 'space-between' },
    header: { padding: 20, alignItems: 'center' },
    backBtn: { alignSelf: 'flex-start' },
    encryptedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    encryptedText: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    footer: { paddingBottom: 40, alignItems: 'center' },
    controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 30 },
    controlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    controlBtnActive: { backgroundColor: '#3b82f6' },
    hangupBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ef4444' },
});

export default CallScreen;
