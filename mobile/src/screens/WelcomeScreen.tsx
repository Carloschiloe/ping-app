import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import Reanimated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { GlassBackdrop, Glass } from '../design/Glass';
import { PingOrb } from '../design/PingOrb';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';

const PAGES = 3;

// Expo Go fails as soon as the notifications module loads on Android, so it is
// loaded only when asked for and never inside Expo Go.
const inExpoGo = Constants.appOwnership === 'expo';
const loadNotifications = () => import('expo-notifications');

// Three short pages, once: what Ping is, how it catches commitments, and
// what each permission is for before anything is asked.
export default function WelcomeScreen({ firstName, onDone }: { firstName?: string | null; onDone: () => void }) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const scroller = useRef<ScrollView>(null);
    const [page, setPage] = useState(0);

    const goTo = (next: number) => {
        scroller.current?.scrollTo({ x: next * width, animated: true });
        setPage(next);
    };

    const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        setPage(Math.round(event.nativeEvent.contentOffset.x / width));
    };

    const last = page === PAGES - 1;

    return (
        <GlassBackdrop>
            <View style={[styles.root, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}>
                <View style={styles.topBar}>
                    {!last && (
                        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" accessibilityLabel="Saltar bienvenida">
                            <Text style={styles.skip}>Saltar</Text>
                        </Pressable>
                    )}
                </View>

                <ScrollView
                    ref={scroller}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={onScrollEnd}
                    style={styles.pager}
                >
                    <View style={[styles.page, { width }]}>
                        <IntroPage firstName={firstName} />
                    </View>
                    <View style={[styles.page, { width }]}>
                        <CommitmentsPage active={page >= 1} />
                    </View>
                    <View style={[styles.page, { width }]}>
                        <PermissionsPage active={page >= 2} />
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <View style={styles.dots}>
                        {Array.from({ length: PAGES }).map((_, index) => (
                            <View key={index} style={[styles.dot, index === page && styles.dotActive]} />
                        ))}
                    </View>
                    <Pressable
                        onPress={() => (last ? onDone() : goTo(page + 1))}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                    >
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Text style={styles.primaryText}>{last ? 'Empezar' : 'Siguiente'}</Text>
                        <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={18} color={colors.onAccent} />
                    </Pressable>
                </View>
            </View>
        </GlassBackdrop>
    );
}

function IntroPage({ firstName }: { firstName?: string | null }) {
    return (
        <View style={styles.center}>
            <Reanimated.View entering={FadeIn.duration(700)} style={styles.orb}>
                <PingOrb size={148} state="idle" />
            </Reanimated.View>
            <Reanimated.Text entering={FadeInDown.delay(250).duration(500)} style={styles.overline}>
                {firstName ? `HOLA, ${firstName.toUpperCase()}` : 'BIENVENIDO'}
            </Reanimated.Text>
            <Reanimated.Text entering={FadeInDown.delay(380).duration(500)} style={styles.title}>
                Ping recuerda lo importante
            </Reanimated.Text>
            <Reanimated.Text entering={FadeInDown.delay(500).duration(500)} style={styles.body}>
                Conversa como siempre. Ping está atento a lo que prometes y te lo recuerda a tiempo.
            </Reanimated.Text>
        </View>
    );
}

function CommitmentsPage({ active }: { active: boolean }) {
    return (
        <View style={styles.center}>
            <View style={styles.demo}>
                {active && (
                    <>
                        <Reanimated.View entering={FadeInDown.duration(450)} style={styles.bubble}>
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                            <Text style={styles.bubbleText}>Te mando el informe el viernes</Text>
                        </Reanimated.View>
                        <Reanimated.View entering={FadeInUp.delay(900).duration(550)}>
                            <Glass style={styles.card} tint={colors.glassDim}>
                                <View style={styles.cardIcon}>
                                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.accentBright} />
                                </View>
                                <View style={styles.cardText}>
                                    <Text style={styles.cardTitle}>Enviar el informe</Text>
                                    <Text style={styles.cardMeta}>Viernes · Para ti</Text>
                                </View>
                                <View style={styles.badge}>
                                    <Ionicons name="sparkles" size={11} color={colors.accentBright} />
                                    <Text style={styles.badgeText}>Ping</Text>
                                </View>
                            </Glass>
                        </Reanimated.View>
                    </>
                )}
            </View>
            <Text style={styles.title}>Detecta compromisos solo</Text>
            <Text style={styles.body}>
                Cuando alguien dice «te lo mando el viernes», Ping lo anota y te avisa. Tú lo confirmas o lo descartas.
            </Text>
        </View>
    );
}

function PermissionsPage({ active }: { active: boolean }) {
    const [notifications, setNotifications] = useState<'unknown' | 'granted' | 'denied'>('unknown');

    useEffect(() => {
        if (inExpoGo) return;
        loadNotifications()
            .then((Notifications) => Notifications.getPermissionsAsync())
            .then(({ status }) => setNotifications(status === 'granted' ? 'granted' : 'unknown'))
            .catch(() => undefined);
    }, []);

    const askNotifications = async () => {
        if (inExpoGo) {
            setNotifications('denied');
            return;
        }
        try {
            const Notifications = await loadNotifications();
            const { status } = await Notifications.requestPermissionsAsync();
            setNotifications(status === 'granted' ? 'granted' : 'denied');
        } catch {
            setNotifications('denied');
        }
    };

    return (
        <View style={styles.center}>
            <Text style={styles.title}>Tú decides qué permitir</Text>
            <Text style={[styles.body, styles.bodyTight]}>Ping solo pide lo que usa, y te dice para qué.</Text>
            {active && (
                <Reanimated.View entering={FadeInDown.duration(450)} style={styles.permissions}>
                    <Glass style={styles.permissionCard} tint={colors.glassDim}>
                        <PermissionRow
                            icon="notifications-outline"
                            title="Avisos"
                            text="Para avisarte de mensajes, llamadas y compromisos que vencen."
                        >
                            {notifications === 'granted' ? (
                                <View style={styles.granted}>
                                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                                    <Text style={styles.grantedText}>Activados</Text>
                                </View>
                            ) : notifications === 'denied' ? (
                                <Text style={styles.deniedText}>Puedes activarlos después en los ajustes del teléfono.</Text>
                            ) : (
                                <Pressable onPress={askNotifications} accessibilityRole="button" style={({ pressed }) => [styles.allow, pressed && styles.pressed]}>
                                    <Text style={styles.allowText}>Activar avisos</Text>
                                </Pressable>
                            )}
                        </PermissionRow>
                        <View style={styles.separator} />
                        <PermissionRow
                            icon="people-outline"
                            title="Contactos"
                            text="Para mostrarte quién ya usa Ping. Te lo preguntaremos cuando busques a alguien."
                        />
                        <View style={styles.separator} />
                        <PermissionRow
                            icon="shield-checkmark-outline"
                            title="Tus chats son tuyos"
                            text="Sin publicidad y sin vender datos. Puedes descargar o borrar todo desde Perfil."
                        />
                    </Glass>
                </Reanimated.View>
            )}
        </View>
    );
}

function PermissionRow({ icon, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; children?: React.ReactNode }) {
    return (
        <View style={styles.permissionRow}>
            <View style={styles.permissionIcon}>
                <Ionicons name={icon} size={20} color={colors.accentBright} />
            </View>
            <View style={styles.permissionBody}>
                <Text style={styles.permissionTitle}>{title}</Text>
                <Text style={styles.permissionText}>{text}</Text>
                {children ? <View style={styles.permissionAction}>{children}</View> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    topBar: { height: 32, alignItems: 'flex-end', paddingHorizontal: space.xl },
    skip: { ...type.subhead, fontFamily: fonts.medium, color: colors.textSoft },
    pager: { flex: 1 },
    page: { flex: 1, paddingHorizontal: space.xxl, justifyContent: 'center' },
    center: { alignItems: 'center' },
    orb: { marginBottom: space.xxl },
    overline: { ...type.overline, color: colors.accentBright, marginBottom: space.sm },
    title: { ...type.display, fontSize: 28, textAlign: 'center' },
    body: { ...type.body, color: colors.textSoft, textAlign: 'center', lineHeight: 22, marginTop: space.md, maxWidth: 340 },
    bodyTight: { marginBottom: space.xl },

    demo: { width: '100%', maxWidth: 340, minHeight: 200, justifyContent: 'center', marginBottom: space.xxl },
    bubble: {
        alignSelf: 'flex-end',
        overflow: 'hidden',
        borderRadius: radius.lg,
        borderBottomRightRadius: 6,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        marginBottom: space.lg,
    },
    bubbleText: { ...type.body, color: colors.onAccent },
    card: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, padding: space.lg, gap: space.md },
    cardIcon: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
    cardText: { flex: 1 },
    cardTitle: { ...type.headline },
    cardMeta: { ...type.caption, marginTop: 2 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.accentTint },
    badgeText: { ...type.caption, color: colors.accentBright },

    permissions: { width: '100%', maxWidth: 360 },
    permissionCard: { borderRadius: radius.xl, paddingVertical: space.sm },
    permissionRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
    permissionIcon: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
    permissionBody: { flex: 1 },
    permissionTitle: { ...type.headline },
    permissionText: { ...type.subhead, lineHeight: 19, marginTop: 2 },
    permissionAction: { marginTop: space.sm, alignItems: 'flex-start' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 64 },
    allow: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.full, backgroundColor: colors.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
    allowText: { ...type.caption, fontFamily: fonts.semibold, color: colors.accentBright },
    granted: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    grantedText: { ...type.caption, color: colors.success },
    deniedText: { ...type.caption, color: colors.textFaint },

    footer: { paddingHorizontal: space.xxl, gap: space.xl },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
    dot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.glassRaised },
    dotActive: { width: 22, backgroundColor: colors.accentBright },
    primary: {
        height: 54,
        borderRadius: radius.full,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
    },
    primaryText: { ...type.headline, color: colors.onAccent },
    pressed: { opacity: 0.85 },
});
