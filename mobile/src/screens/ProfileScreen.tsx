import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Share } from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAccess, useUpdateProfile, type Access } from '../api/queries';
import { resolvePrivateFileUrl } from '../lib/privateFiles';
import { apiClient } from '../api/client';
import { PING_PUBLIC_INVITE_URL, inviteMessage } from '../utils/pingInvitation';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { EditProfileSheet } from '../components/perfil/EditProfileSheet';
import { Row, Section } from '../components/perfil/SettingsKit';
import type { ProfileStackParamList } from '../navigation/types';
import { TAB_BAR_CLEARANCE } from '../design/FloatingTabBar';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';

// Who the person is and their plan. Every setting lives in Ajustes.

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
    const { user, refreshProfile } = useAuth();
    const { data: access } = useAccess(!!user);
    const [phone, setPhone] = useState('');
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [editProfileVisible, setEditProfileVisible] = useState(false);
    const { mutateAsync: updateProfile } = useUpdateProfile();

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('phone, full_name, avatar_url, avatar_bucket, avatar_object_path, cover_object_path')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data?.phone) setPhone(data.phone);
                if (data?.full_name) setFullName(data.full_name);
                if (data?.avatar_bucket && data?.avatar_object_path) {
                    resolvePrivateFileUrl('profile', user.id)
                        .then(({ signedUrl }) => setAvatarUrl(signedUrl))
                        .catch(() => setAvatarUrl(null));
                } else if (data?.avatar_url) {
                    setAvatarUrl(data.avatar_url);
                } else {
                    setAvatarUrl(null);
                }
                if (data?.cover_object_path) {
                    resolvePrivateFileUrl('profile_cover', user.id)
                        .then(({ signedUrl }) => setCoverUrl(signedUrl))
                        .catch(() => setCoverUrl(null));
                }
            });
    }, [user]);

    const handleLogout = () => {
        Alert.alert('Cerrar sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: () => supabase.auth.signOut() },
        ]);
    };

    const handleSaveProfile = async (newFullName: string, newPhone: string) => {
        if (!user) return;
        await updateProfile({ full_name: newFullName, phone: newPhone });
        setFullName(newFullName);
        setPhone(newPhone);
        await refreshProfile();
    };

    const handleSaveAvatar = async (signedUrl: string) => {
        setAvatarUrl(signedUrl);
        await refreshProfile();
    };

    const initialLetter = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const plan = planLine(access);
    const openSettings = () => navigation.navigate('Settings');

    const [inviting, setInviting] = useState(false);
    const inviteSomeone = async () => {
        if (inviting) return;
        setInviting(true);
        try {
            // A personal link connects whoever opens it with you.
            const link = await apiClient.post('/invite-links', {})
                .then((result: any) => (typeof result?.url === 'string' ? result.url : PING_PUBLIC_INVITE_URL))
                .catch(() => PING_PUBLIC_INVITE_URL);
            await Share.share({ title: 'Invitación a Vorian', message: inviteMessage(null, link) });
        } catch (error: any) {
            if (error?.message) Alert.alert('No se pudo compartir', 'Inténtalo nuevamente.');
        } finally {
            setInviting(false);
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{
                // Safe area top so content never hides under the status bar.
                paddingTop: Math.max(insets.top, 16) + 12,
                paddingBottom: Math.max(insets.bottom, 12) + TAB_BAR_CLEARANCE,
            }}
        >
            <View style={styles.header}>
                <View>
                    <Text style={type.overline}>TU CUENTA</Text>
                    <Text style={styles.headerTitle}>Perfil</Text>
                </View>
                <TouchableOpacity onPress={openSettings} accessibilityLabel="Abrir ajustes" hitSlop={10}>
                    <Glass style={styles.gear} intensity={30} tint={colors.glassTintLight}>
                        <Ionicons name="settings-outline" size={20} color={colors.text} />
                    </Glass>
                </TouchableOpacity>
            </View>

            {/* IDENTITY */}
            <Reanimated.View entering={FadeInDown.duration(380)} style={styles.heroWrap}>
                <Glass style={styles.hero} intensity={30} tint={colors.glassTintLight}>
                    {/* The cover sits behind, dimmed toward the bottom so the name stays readable. */}
                    {!!coverUrl && (
                        <>
                            <CachedImage uri={coverUrl} style={styles.cover} />
                            <LinearGradient
                                pointerEvents="none"
                                colors={gradients.coverShade}
                                style={styles.cover}
                            />
                        </>
                    )}
                    <View style={styles.avatarRing}>
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                            {avatarUrl ? (
                                <CachedImage uri={avatarUrl} style={styles.avatarImage} />
                            ) : (
                                <Text style={styles.avatarText}>{initialLetter}</Text>
                            )}
                        </LinearGradient>
                    </View>
                    <Text style={styles.heroName} numberOfLines={1} ellipsizeMode="tail">
                        {fullName || 'Sin nombre'}
                    </Text>
                    <Text style={styles.heroEmail} numberOfLines={1} ellipsizeMode="tail">
                        {user?.email}
                    </Text>
                    {!!phone && <Text style={styles.heroPhone}>{phone}</Text>}
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => setEditProfileVisible(true)}
                        accessibilityLabel="Editar perfil"
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Ionicons name="create-outline" size={16} color={colors.onAccent} />
                        <Text style={styles.editBtnText}>Editar perfil</Text>
                    </TouchableOpacity>
                </Glass>
            </Reanimated.View>

            <Section order={1}>
                <Row
                    icon="person-add-outline"
                    title="Invitar a alguien a Vorian"
                    subtitle="Comparte tu enlace y quedarán conectados"
                    onPress={inviteSomeone}
                    accessibilityLabel="Invitar a alguien a Vorian"
                />
            </Section>

            <Section order={2}>
                {!!plan && (
                    <Row icon={plan.icon} title={plan.title} subtitle={plan.subtitle} />
                )}
                <Row
                    divider={!!plan}
                    icon="settings-outline"
                    title="Ajustes"
                    subtitle="Avisos, privacidad, tus datos y ayuda"
                    onPress={openSettings}
                />
            </Section>

            <Section order={3}>
                <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} accessibilityLabel="Cerrar sesión">
                    <Ionicons name="log-out-outline" size={19} color={colors.danger} />
                    <Text style={styles.logoutText}>Cerrar sesión</Text>
                </TouchableOpacity>
            </Section>
            <Text style={styles.versionText}>Vorian v{appVersion}</Text>

            <EditProfileSheet
                visible={editProfileVisible}
                onClose={() => setEditProfileVisible(false)}
                user={user}
                initialFullName={fullName}
                initialPhone={phone}
                initialAvatarUrl={avatarUrl}
                initialCoverUrl={coverUrl}
                onSaveProfile={handleSaveProfile}
                onSaveAvatar={handleSaveAvatar}
                onSaveCover={setCoverUrl}
            />
        </ScrollView>
    );
}

type PlanLine = { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string };

/** The person's plan in one row, or null while it is unknown. */
export function planLine(access: Access | undefined): PlanLine | null {
    if (!access) return null;
    switch (access.status) {
        case 'paid':
            return { icon: 'star-outline', title: 'Plan activo' };
        case 'free_access':
            return { icon: 'gift-outline', title: 'Acceso gratuito' };
        case 'trial':
        case 'trial_ending': {
            const days = access.daysLeft;
            const subtitle = days == null ? undefined : days <= 1 ? 'Termina mañana' : `Te quedan ${days} días`;
            return { icon: 'time-outline', title: 'Prueba gratis', subtitle };
        }
        case 'expired':
            return { icon: 'lock-closed-outline', title: 'Tu prueba gratis terminó', subtitle: 'Puedes seguir leyendo y respondiendo tus mensajes' };
        default:
            return null;
    }
}

const AVATAR = 84;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.lg },
    headerTitle: { ...type.display, marginTop: 2 },
    gear: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderTopColor: colors.glassEdge },
    heroWrap: { paddingHorizontal: space.lg },
    hero: {
        borderRadius: radius.xl,
        borderTopColor: colors.glassEdge,
        alignItems: 'center',
        paddingTop: space.xxl,
        paddingBottom: space.xl,
        paddingHorizontal: space.xl,
    },
    avatarRing: {
        padding: 3,
        borderRadius: radius.xl + 3,
        borderWidth: 1.5,
        borderColor: colors.accentBright,
        marginBottom: space.md,
    },
    avatar: {
        width: AVATAR,
        height: AVATAR,
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImage: { width: AVATAR, height: AVATAR },
    cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    avatarText: { fontFamily: fonts.bold, fontSize: 34, color: colors.onAccent },
    heroName: { ...type.title, fontSize: 22, maxWidth: '100%' },
    heroEmail: { ...type.subhead, marginTop: 3, maxWidth: '100%' },
    heroPhone: { ...type.caption, color: colors.textFaint, marginTop: 2 },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: space.lg,
        paddingHorizontal: space.xl,
        paddingVertical: 10,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    editBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onAccent },

    logoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 15 },
    logoutText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
    versionText: { ...type.caption, color: colors.textFaint, textAlign: 'center', marginTop: space.lg },
});
