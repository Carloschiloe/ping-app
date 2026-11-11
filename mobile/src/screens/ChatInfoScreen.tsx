import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatInfoScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import {
    useConversations,
    useDeleteGroup,
    useGroupParticipants,
    useSharedContentSummary,
    useUpdateGroup,
    useUpdateGroupParticipantRole,
    useChatBlock,
    useSetBlocked,
} from '../api/queries';
import { ReportSheet, type ReportTarget } from '../components/safety/ReportSheet';
import { uploadToSupabase } from '../lib/upload';
import { GroupMembersSection } from '../components/chat-info/GroupMembersSection';
import { SharedContentThumbnail } from '../components/shared-content/SharedContentThumbnail';
import { EMPTY_SHARED_CONTENT_SUMMARY, sharedContentCount } from '../utils/sharedContent';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader } from '../design/ScreenHeader';
import { confirmAction } from '../design/ConfirmDialog';

export default function ChatInfoScreen({ route, navigation }: ChatInfoScreenProps) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { conversationId, groupMetadata, otherUser, isGroup, isSelf } = route.params;
    const { data: convData } = useConversations();
    const currentConv = convData?.conversations?.find((conversation: any) => conversation.id === conversationId);
    const { data: participantsData = [] } = useGroupParticipants(isGroup ? conversationId : null);
    const summaryQuery = useSharedContentSummary(conversationId);
    const { mutate: updateParticipantRole, isPending: isUpdatingParticipantRole } = useUpdateGroupParticipantRole(conversationId);
    const { mutate: updateGroup } = useUpdateGroup(conversationId);
    const { mutate: deleteGroup, isPending: isDeleting } = useDeleteGroup();
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
    const isDirect = !isGroup && !isSelf && !!otherUser?.id;
    const { data: chatBlock } = useChatBlock(conversationId, isDirect);
    const setBlocked = useSetBlocked();
    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

    const name = isSelf
        ? 'Para mí'
        : isGroup
            ? currentConv?.groupMetadata?.name || groupMetadata?.name || 'Grupo'
            : otherUser?.full_name || otherUser?.email?.split('@')[0] || 'Chat';
    const avatarUrl = isGroup
        ? currentConv?.groupMetadata?.avatar_url || groupMetadata?.avatar_url
        : otherUser?.avatar_url;
    const initials = isSelf ? 'PM' : name.slice(0, 2).toUpperCase();

    const toggleBlock = () => {
        if (!otherUser?.id) return;
        const blocked = !!chatBlock?.blockedByMe;
        Alert.alert(
            blocked ? `¿Desbloquear a ${name}?` : `¿Bloquear a ${name}?`,
            blocked ? 'Podrá volver a escribirte y llamarte.' : 'No podrá escribirte ni llamarte en este chat. No se le avisará.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: blocked ? 'Desbloquear' : 'Bloquear',
                    style: blocked ? 'default' : 'destructive',
                    onPress: () => setBlocked.mutate({ userId: otherUser.id, blocked: !blocked }, {
                        onError: () => Alert.alert('No se pudo cambiar', 'Inténtalo de nuevo en un momento.'),
                    }),
                },
            ],
        );
    };

    const members = useMemo(() => {
        if (!isGroup) return [];
        return participantsData.map((entry: any) => ({
            id: entry.user_id,
            role: entry.role || 'member',
            ...(Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles),
        }));
    }, [isGroup, participantsData]);
    const currentMembership = members.find((member: any) => member.id === user?.id);
    const isAdmin = Boolean(isGroup && currentMembership?.role === 'admin');
    const subtitle = isSelf
        ? 'Tu espacio personal'
        : isGroup
            ? `${members.length} participantes`
            : otherUser?.email || otherUser?.phone || '';

    const summary = summaryQuery.data?.summary || EMPTY_SHARED_CONTENT_SUMMARY;
    const recentVisuals = summaryQuery.data?.items || [];
    const commonRoute = { conversationId, title: name, otherUser, isSelf, isGroup, groupMetadata };
    const categories = [
        { key: 'visual' as const, title: 'Fotos y videos', icon: 'images-outline' as const },
        { key: 'audio' as const, title: 'Audios', icon: 'mic-outline' as const },
        { key: 'document' as const, title: 'Documentos', icon: 'document-outline' as const },
        { key: 'link' as const, title: 'Enlaces', icon: 'link-outline' as const },
    ];

    const openCategory = (category: typeof categories[number]['key']) => {
        if (category === 'visual') navigation.navigate('SharedVisualContent', commonRoute);
        else navigation.navigate('SharedContent', { ...commonRoute, category });
    };

    const handlePickGroupImage = async () => {
        if (!isAdmin) return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
        if (result.canceled || !result.assets[0]?.uri) return;
        try {
            setIsUpdatingAvatar(true);
            const publicUrl = await uploadToSupabase(result.assets[0].uri, 'chat-media', 'image/jpeg');
            if (!publicUrl) throw new Error('Upload failed');
            updateGroup({ avatar_url: publicUrl });
        } catch {
            Alert.alert('Error', 'No se pudo actualizar la imagen del grupo.');
        } finally {
            setIsUpdatingAvatar(false);
        }
    };

    const saveName = () => {
        const nextName = tempName.trim();
        if (!nextName || nextName === name) return setIsEditingName(false);
        updateGroup({ name: nextName }, { onSuccess: () => setIsEditingName(false) });
    };

    const toggleAdmin = async (member: any) => {
        const makeAdmin = member.role !== 'admin';
        const ok = await confirmAction({
            title: makeAdmin ? 'Hacer administrador' : 'Quitar administrador',
            message: `${member.full_name || member.email} ${makeAdmin ? 'podrá' : 'ya no podrá'} administrar el grupo.`,
            confirmLabel: 'Confirmar',
            destructive: false,
        });
        if (ok) updateParticipantRole({ userId: member.id, role: makeAdmin ? 'admin' : 'member' });
    };

    const confirmDeleteGroup = async () => {
        const ok = await confirmAction({
            title: 'Eliminar grupo',
            message: 'Se eliminará para todos los participantes. Esta acción no se puede deshacer.',
        });
        if (!ok) return;
        deleteGroup(conversationId, {
            onSuccess: () => navigation.popTo('ConversationsList'),
            onError: () => Alert.alert('No se pudo eliminar el grupo', 'Inténtalo nuevamente.'),
        });
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title={isGroup ? 'Info del grupo' : 'Info del chat'} onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) + space.xl }]}>
                <View style={styles.heroWrap}>
                    <Glass style={styles.hero} intensity={30} tint={colors.glassTintLight}>
                        <TouchableOpacity onPress={handlePickGroupImage} disabled={!isAdmin || isUpdatingAvatar} style={styles.avatarRing} accessibilityLabel={isAdmin ? 'Cambiar imagen del grupo' : undefined}>
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                                {isUpdatingAvatar ? <ActivityIndicator color={colors.onAccent} /> : avatarUrl
                                    ? <CachedImage uri={avatarUrl} style={styles.avatarImage} />
                                    : <Text style={styles.initials}>{initials}</Text>}
                            </LinearGradient>
                            {isAdmin && <View style={styles.camera}><Ionicons name="camera" size={14} color={colors.onAccent} /></View>}
                        </TouchableOpacity>
                        {isEditingName ? (
                            <View style={styles.editRow}>
                                <TextInput
                                    value={tempName}
                                    onChangeText={setTempName}
                                    onSubmitEditing={saveName}
                                    autoFocus
                                    style={styles.nameInput}
                                    selectionColor={colors.accent}
                                />
                                <TouchableOpacity onPress={saveName} accessibilityLabel="Guardar nombre"><Ionicons name="checkmark-circle" size={30} color={colors.success} /></TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsEditingName(false)} accessibilityLabel="Cancelar"><Ionicons name="close-circle" size={30} color={colors.textFaint} /></TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.nameRow}>
                                <Text style={styles.name} numberOfLines={2}>{name}</Text>
                                {isAdmin && (
                                    <TouchableOpacity onPress={() => { setTempName(name); setIsEditingName(true); }} accessibilityLabel="Cambiar nombre del grupo" hitSlop={8}>
                                        <Ionicons name="pencil" size={16} color={colors.textSoft} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                        {isAdmin && (
                            <TouchableOpacity style={styles.compactAction} onPress={() => navigation.navigate('AddParticipants', { conversationId })} activeOpacity={0.85}>
                                <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                                <Ionicons name="person-add-outline" size={17} color={colors.onAccent} />
                                <Text style={styles.compactActionText}>Añadir participante</Text>
                            </TouchableOpacity>
                        )}
                    </Glass>
                </View>

                {/* Grouped cards, like Perfil: the rows say what they are. */}
                <View style={styles.card}>
                    <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                    {summaryQuery.isError && (
                        <TouchableOpacity style={styles.errorRow} onPress={() => summaryQuery.refetch()}>
                            <Ionicons name="refresh" size={15} color={colors.danger} />
                            <Text style={styles.errorText}>No se pudo cargar. Toca para reintentar.</Text>
                        </TouchableOpacity>
                    )}
                    {categories.map((category, index) => (
                        <TouchableOpacity key={category.key} style={styles.contentRow} onPress={() => openCategory(category.key)}>
                            {index > 0 && <View pointerEvents="none" style={styles.divider} />}
                            <View style={styles.contentIcon}><Ionicons name={category.icon} size={20} color={colors.accentBright} /></View>
                            <View style={styles.contentInfo}>
                                <Text style={styles.contentTitle}>{category.title}</Text>
                                {category.key === 'visual' && recentVisuals.length > 0 ? (
                                    <View style={styles.previewRow}>{recentVisuals.slice(0, 3).map((item) => <SharedContentThumbnail key={item.id} item={item} size={48} />)}</View>
                                ) : (
                                    <Text style={styles.contentEmpty}>{summaryQuery.isLoading ? 'Cargando…' : sharedContentCount(summary, category.key) === 0 ? 'Sin contenido' : 'Ver contenido compartido'}</Text>
                                )}
                            </View>
                            {summaryQuery.isLoading
                                ? <ActivityIndicator size="small" color={colors.textFaint} />
                                : <Text style={styles.count}>{sharedContentCount(summary, category.key)}</Text>}
                            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                        </TouchableOpacity>
                    ))}
                </View>

                {isGroup && (
                    <GroupMembersSection
                        members={members}
                        isAdmin={isAdmin}
                        currentUserId={user?.id}
                        isUpdatingParticipantRole={isUpdatingParticipantRole}
                        onToggleAdmin={toggleAdmin}
                    />
                )}

                {isDirect && (
                    <View style={[styles.card, styles.deleteWrap]}>
                        <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                        <TouchableOpacity style={styles.deleteButton} onPress={toggleBlock} disabled={setBlocked.isPending} accessibilityLabel={chatBlock?.blockedByMe ? `Desbloquear a ${name}` : `Bloquear a ${name}`}>
                            <Ionicons name="hand-left-outline" size={19} color={colors.danger} />
                            <Text style={styles.deleteText}>{chatBlock?.blockedByMe ? `Desbloquear a ${name}` : `Bloquear a ${name}`}</Text>
                        </TouchableOpacity>
                        <View pointerEvents="none" style={styles.fullDivider} />
                        <TouchableOpacity style={styles.deleteButton} onPress={() => setReportTarget({ kind: 'user', userId: otherUser.id, name, conversationId })} accessibilityLabel={`Denunciar a ${name}`}>
                            <Ionicons name="flag-outline" size={19} color={colors.danger} />
                            <Text style={styles.deleteText}>Denunciar a {name}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {isAdmin && (
                    <View style={[styles.card, styles.deleteWrap]}>
                        <Glass style={[StyleSheet.absoluteFill, styles.cardGlass]} intensity={22} tint={colors.glassTintLight} />
                        <TouchableOpacity style={styles.deleteButton} onPress={confirmDeleteGroup} disabled={isDeleting}>
                            <Ionicons name="trash-outline" size={19} color={colors.danger} />
                            <Text style={styles.deleteText}>{isDeleting ? 'Eliminando…' : 'Eliminar grupo'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
            <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
        </View>
    );
}

const AVATAR = 92;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    content: { paddingTop: space.lg },
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
    avatar: { width: AVATAR, height: AVATAR, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    avatarImage: { width: '100%', height: '100%' },
    initials: { fontFamily: fonts.bold, fontSize: 32, color: colors.onAccent },
    camera: {
        position: 'absolute',
        right: -4,
        bottom: -4,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
        borderWidth: 2,
        borderColor: colors.ink,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, maxWidth: '100%' },
    name: { ...type.title, fontSize: 23, textAlign: 'center', flexShrink: 1 },
    subtitle: { ...type.subhead, marginTop: 4, textAlign: 'center' },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, width: '100%' },
    nameInput: {
        flex: 1,
        fontFamily: fonts.semibold,
        fontSize: 19,
        color: colors.text,
        borderBottomWidth: 1.5,
        borderBottomColor: colors.accent,
        paddingVertical: 5,
    },
    compactAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        marginTop: space.lg,
        paddingHorizontal: space.lg,
        paddingVertical: 10,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    compactActionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onAccent },
    card: { marginTop: space.lg, marginHorizontal: space.lg, borderRadius: radius.lg, overflow: 'hidden' },
    cardGlass: { borderRadius: radius.lg, borderTopColor: colors.glassEdge },
    contentRow: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: space.md,
    },
    divider: {
        position: 'absolute',
        top: 0,
        left: space.lg + 40 + space.md,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
    },
    contentIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentTint },
    contentInfo: { flex: 1 },
    contentTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
    contentEmpty: { ...type.caption, color: colors.textFaint, marginTop: 3 },
    previewRow: { flexDirection: 'row', gap: 5, marginTop: space.sm },
    count: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft, minWidth: 24, textAlign: 'right' },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: space.lg, marginTop: space.md, padding: 10, borderRadius: radius.md, backgroundColor: colors.dangerTint },
    errorText: { ...type.caption, color: colors.danger },
    deleteWrap: { marginBottom: space.xxl },
    deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 15 },
    deleteText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
    fullDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginHorizontal: space.lg },
});
