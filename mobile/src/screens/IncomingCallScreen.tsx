import React, { useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Animated, Easing, Vibration, Platform, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

// Vibration pattern: ring-ring-ring
const CALL_PATTERN = Platform.OS === 'android'
    ? [0, 800, 400, 800, 400, 800]
    : [0, 800, 400, 800];

const IncomingCallScreen = ({ route, navigation }: any) => {
    const { conversationId, callType = 'voice', callerName = 'Alguien', callerAvatar = null } = route.params;
    const isVideo = callType === 'video';

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseAnim2 = useRef(new Animated.Value(1)).current;
    const pulseAnim3 = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(60)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Vibrate in loop
        Vibration.vibrate(CALL_PATTERN, true);

        // Entrance animation
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
        ]).start();

        // Pulse rings
        const pulse = (anim: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(anim, {
                        toValue: 2.5, duration: 1800,
                        easing: Easing.out(Easing.quad), useNativeDriver: true,
                    }),
                    Animated.timing(anim, {
                        toValue: 1, duration: 0, useNativeDriver: true,
                    }),
                ])
            ).start();

        pulse(pulseAnim, 0);
        pulse(pulseAnim2, 600);
        pulse(pulseAnim3, 1200);

        // Listen for hangup from caller
        const channel = supabase.channel(`call:${conversationId}`, {
            config: { broadcast: { self: false } },
        });

        channel
            .on('broadcast', { event: 'hangup' }, () => {
                console.log('[IncomingCall] Received hangup broadcast from caller');
                handleDecline();
            })
            .subscribe((status) => {
                console.log(`[IncomingCall] Realtime status: ${status}`);
            });

        return () => {
            Vibration.cancel();
            channel.unsubscribe();
        };
    }, []);

    const handleAccept = () => {
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.replace('Call', {
            conversationId,
            isVideo,
            remoteUser: { full_name: callerName },
        });
    };

    const handleDecline = () => {
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        navigation.goBack();
    };

    const pulseOpacity1 = pulseAnim.interpolate({ inputRange: [1, 2.5], outputRange: [0.4, 0] });
    const pulseOpacity2 = pulseAnim2.interpolate({ inputRange: [1, 2.5], outputRange: [0.3, 0] });
    const pulseOpacity3 = pulseAnim3.interpolate({ inputRange: [1, 2.5], outputRange: [0.2, 0] });

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={isVideo ? ['#0f172a', '#1e1b4b', '#0f172a'] : ['#0d2137', '#0f4c75', '#0d2137']}
                style={StyleSheet.absoluteFillObject}
            />

            <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                {/* Call type label */}
                <View style={styles.callTypeBadge}>
                    <Ionicons name={isVideo ? 'videocam' : 'call'} size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.callTypeText}>
                        {isVideo ? 'Videollamada entrante' : 'Llamada de voz entrante'}
                    </Text>
                </View>

                {/* Avatar with pulse rings */}
                <View style={styles.avatarSection}>
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity1, borderColor: isVideo ? '#6366f1' : '#3b82f6' }]} />
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim2 }], opacity: pulseOpacity2, borderColor: isVideo ? '#6366f1' : '#3b82f6' }]} />
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim3 }], opacity: pulseOpacity3, borderColor: isVideo ? '#6366f1' : '#3b82f6' }]} />

                    <View style={[styles.avatarCircle, { borderColor: isVideo ? '#6366f1' : '#3b82f6' }]}>
                        {callerAvatar ? (
                            <Image source={{ uri: callerAvatar }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarInitial}>
                                {callerName.charAt(0).toUpperCase()}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Caller info */}
                <Text style={styles.callerName}>{callerName}</Text>
                <Text style={styles.callerSub}>te está llamando...</Text>

                {/* Action buttons */}
                <View style={styles.actions}>
                    {/* Decline */}
                    <View style={styles.actionCol}>
                        <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={handleDecline}>
                            <Ionicons name="call" size={30} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
                        </TouchableOpacity>
                        <Text style={styles.actionLabel}>Rechazar</Text>
                    </View>

                    {/* Accept */}
                    <View style={styles.actionCol}>
                        <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAccept}>
                            <Ionicons name={isVideo ? 'videocam' : 'call'} size={30} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.actionLabel}>Aceptar</Text>
                    </View>
                </View>
            </Animated.View>
        </View>
    );
};

const RING_SIZE = 160;

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { alignItems: 'center', width: '100%', paddingHorizontal: 40 },
    callTypeBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, marginBottom: 60,
    },
    callTypeText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
    avatarSection: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    ring: {
        position: 'absolute', width: RING_SIZE, height: RING_SIZE,
        borderRadius: RING_SIZE / 2, borderWidth: 2,
    },
    avatarCircle: {
        width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
        backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarInitial: { fontSize: 64, fontWeight: '700', color: 'white' },
    avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    callerName: {
        fontSize: 34, fontWeight: '800', color: 'white', textAlign: 'center',
        letterSpacing: -0.5, marginBottom: 8,
    },
    callerSub: { fontSize: 16, color: 'rgba(255,255,255,0.55)', marginBottom: 80, fontWeight: '500' },
    actions: { flexDirection: 'row', gap: 80, alignItems: 'center' },
    actionCol: { alignItems: 'center', gap: 12 },
    actionBtn: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
    },
    declineBtn: { backgroundColor: '#ef4444' },
    acceptBtn: { backgroundColor: '#22c55e' },
    actionLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
});

export default IncomingCallScreen;
