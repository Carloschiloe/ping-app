import React, { useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    Vibration,
    Platform,
} from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackdrop } from '../design/Glass';
import { avatarGradient } from '../design/ScreenHeader';
import { colors, radius, space } from '../design/tokens';
import { fonts } from '../design/typography';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

// Vibration pattern: ring-ring-ring
const CALL_PATTERN = Platform.OS === 'android'
    ? [0, 800, 400, 800, 400, 800]
    : [0, 800, 400, 800];

const IncomingCallScreen = ({ route, navigation }: any) => {
    const { conversationId, callType = 'voice', callerName = 'Alguien', callerAvatar = null, callId = null } = route.params;
    const isVideo = callType === 'video';

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseAnim2 = useRef(new Animated.Value(1)).current;
    const pulseAnim3 = useRef(new Animated.Value(1)).current;
    const slideAnim = useRef(new Animated.Value(60)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const channelRef = useRef<any>(null); // Store channel in ref to use in methods

    const handleDecline = useCallback(async () => {
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Tell the caller we declined/hung up
        if (channelRef.current) {
            try {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'hangup',
                    payload: {},
                });
            } catch (err) {
                console.error('[IncomingCall] Failed to send hangup:', err);
            }
        }

        navigation.goBack();
    }, [navigation]);

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
                handleDecline();
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            Vibration.cancel();
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [conversationId, fadeAnim, slideAnim, pulseAnim, pulseAnim2, pulseAnim3, handleDecline]);

    const handleAccept = useCallback(async () => {
        Vibration.cancel();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (channelRef.current) {
            try {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'accepted',
                    payload: {},
                });
            } catch (err) {
                console.error('[IncomingCall] Failed to confirm acceptance:', err);
            }
        }

        navigation.replace('Call', {
            conversationId,
            isVideo,
            remoteUser: { full_name: callerName },
            isIncoming: true,
            callId, // Pass it along
        });
    }, [callId, callerName, conversationId, isVideo, navigation]);

    const pulseOpacity1 = pulseAnim.interpolate({ inputRange: [1, 2.5], outputRange: [0.4, 0] });
    const pulseOpacity2 = pulseAnim2.interpolate({ inputRange: [1, 2.5], outputRange: [0.3, 0] });
    const pulseOpacity3 = pulseAnim3.interpolate({ inputRange: [1, 2.5], outputRange: [0.2, 0] });

    return (
        <GlassBackdrop>
        <View style={styles.container}>

            <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                {/* Call type label */}
                <View style={styles.callTypeBadge}>
                    <Ionicons name={isVideo ? 'videocam' : 'call'} size={14} color={colors.accentBright} />
                    <Text style={styles.callTypeText}>
                        {isVideo ? 'Videollamada entrante' : 'Llamada de voz entrante'}
                    </Text>
                </View>

                {/* Avatar with pulse rings */}
                <View style={styles.avatarSection}>
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity1}]} />
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim2 }], opacity: pulseOpacity2}]} />
                    <Animated.View style={[styles.ring, { transform: [{ scale: pulseAnim3 }], opacity: pulseOpacity3}]} />

                    <View style={styles.avatarCircle}>
                        {callerAvatar ? (
                            <CachedImage uri={callerAvatar} style={styles.avatarImage} />
                        ) : (
                            <LinearGradient colors={avatarGradient(callerName)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFill}>
                                <Text style={styles.avatarInitial}>
                                    {callerName.charAt(0).toUpperCase()}
                                </Text>
                            </LinearGradient>
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
                            <Ionicons name="call" size={30} color={colors.text} style={{ transform: [{ rotate: '135deg' }] }} />
                        </TouchableOpacity>
                        <Text style={styles.actionLabel}>Rechazar</Text>
                    </View>

                    {/* Accept */}
                    <View style={styles.actionCol}>
                        <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAccept}>
                            <Ionicons name={isVideo ? 'videocam' : 'call'} size={30} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.actionLabel}>Aceptar</Text>
                    </View>
                </View>
            </Animated.View>
        </View>
        </GlassBackdrop>
    );
};

const RING_SIZE = 160;

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { alignItems: 'center', width: '100%', paddingHorizontal: 40 },
    callTypeBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.glassRaised, paddingHorizontal: space.lg, paddingVertical: space.sm,
        borderRadius: radius.full, marginBottom: 60,
        borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    callTypeText: { fontFamily: fonts.semibold, color: colors.text, fontSize: 13, letterSpacing: 0.3 },
    avatarSection: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    ring: {
        position: 'absolute', width: RING_SIZE, height: RING_SIZE,
        borderRadius: RING_SIZE / 2, borderWidth: 2, borderColor: colors.accentBright,
    },
    avatarCircle: {
        width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
        backgroundColor: colors.glassRaised, borderWidth: 2, borderColor: colors.accentBright,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontFamily: fonts.bold, fontSize: 64, color: colors.silver },
    avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    callerName: {
        fontFamily: fonts.extrabold, fontSize: 34, color: colors.text, textAlign: 'center',
        letterSpacing: -0.5, marginBottom: space.sm,
    },
    callerSub: { fontFamily: fonts.medium, fontSize: 16, color: colors.textSoft, marginBottom: 80 },
    actions: { flexDirection: 'row', gap: 80, alignItems: 'center' },
    actionCol: { alignItems: 'center', gap: space.md },
    actionBtn: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: colors.ink, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
    },
    declineBtn: { backgroundColor: colors.danger },
    acceptBtn: { backgroundColor: colors.success },
    actionLabel: { fontFamily: fonts.semibold, color: colors.textSoft, fontSize: 13 },
});

export default IncomingCallScreen;
