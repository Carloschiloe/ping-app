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

const CallScreen = ({ route, navigation }: any) => {
    const { conversationId, isVideo = true, remoteUser } = route.params;
    const [loading, setLoading] = useState(true);
    const [callData, setCallData] = useState<{ token: string; appId: string } | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(!isVideo);
    const webviewRef = useRef<any>(null);

    useEffect(() => {
        fetchToken();
    }, []);

    const fetchToken = async () => {
        try {
            const { token, appId } = await apiClient.get(`/agora/token/${conversationId}`);
            setCallData({ token, appId });
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

    const buildAgoraHtml = (appId: string, token: string, channel: string, withVideo: boolean) => `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<title>Ping Call</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f172a; width: 100vw; height: 100vh; overflow: hidden; font-family: -apple-system, sans-serif; }
  #remote-video { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #1e293b; }
  #local-video  { position: fixed; top: 60px; right: 16px; width: 110px; height: 165px; border-radius: 14px; overflow: hidden; border: 2px solid rgba(255,255,255,0.2); background: #000; z-index: 10; }
  #status { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; font-weight: 600; text-align: center; pointer-events: none; }
  video { width: 100%; height: 100%; object-fit: cover; }
</style>
</head>
<body>
<div id="remote-video"><div id="status">Conectando...</div></div>
<div id="local-video" style="display:${withVideo ? 'block' : 'none'}"></div>
<script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js"></script>
<script>
const APP_ID  = "${appId}";
const TOKEN   = "${token}";
const CHANNEL = "${channel}";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localAudioTrack = null;
let localVideoTrack = null;

async function joinCall() {
  try {
    await client.join(APP_ID, CHANNEL, TOKEN, null);

    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    const tracks = [localAudioTrack];

    if (${withVideo}) {
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      tracks.push(localVideoTrack);
      localVideoTrack.play("local-video");
    }

    await client.publish(tracks);
    document.getElementById("status").textContent = "Llamando...";
  } catch (e) {
    document.getElementById("status").textContent = "Error: " + e.message;
  }
}

client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  document.getElementById("status").style.display = "none";
  if (mediaType === "video") {
    user.videoTrack.play("remote-video");
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
});

client.on("user-unpublished", () => {
  document.getElementById("remote-video").innerHTML = '<div id="status">La otra persona salió</div>';
});

window.toggleMute  = (muted)  => localAudioTrack && localAudioTrack.setMuted(muted);
window.toggleVideo = (off)    => localVideoTrack && localVideoTrack.setMuted(off);
window.leaveCall   = async () => {
  localAudioTrack && localAudioTrack.close();
  localVideoTrack && localVideoTrack.close();
  await client.leave();
};

joinCall();
</script>
</body>
</html>`;

    if (loading || !callData) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Conectando con Ping...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Agora Web SDK inside WebView */}
            <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: buildAgoraHtml(callData.appId, callData.token, conversationId, isVideo) }}
                style={StyleSheet.absoluteFillObject}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                javaScriptEnabled
                domStorageEnabled
                onError={(e) => console.error('[WebView Error]', e.nativeEvent.description)}
            />

            {/* Controls Overlay on top of WebView */}
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
