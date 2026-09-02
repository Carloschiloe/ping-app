import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ChatInfoScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import {
    useConversations,
    useDeleteGroup,
    useGroupParticipants,
    useSharedContentSummary,
    useUpdateGroup,
    useUpdateGroupParticipantRole,
} from '../api/queries';
import { uploadToSupabase } from '../lib/upload';
import { GroupMembersSection } from '../components/chat-info/GroupMembersSection';
import { SharedContentThumbnail } from '../components/shared-content/SharedContentThumbnail';
import { useAppTheme } from '../theme/ThemeContext';
import { EMPTY_SHARED_CONTENT_SUMMARY, sharedContentCount } from '../utils/sharedContent';

export default function ChatInfoScreen({ route, navigation }: ChatInfoScreenProps) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
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

    const name = isSelf
        ? 'Para mÃ­'
        : isGroup
            ? currentConv?.groupMetadata?.name || groupMetadata?.name || 'Grupo'
            : otherUser?.full_name || otherUser?.email?.split('@')[0] || 'Chat';
    const avatarUrl = isGroup
        ? currentConv?.groupMetadata?.avatar_url || groupMetadata?.avatar_url
        : otherUser?.avatar_url;
    const initials = isSelf ? 'PM' : name.slice(0, 2).toUpperCase();

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

    const toggleAdmin = (member: any) => {
        const role = member.role === 'admin' ? 'member' : 'admin';
        Alert.alert('Administradores', `Â¿Confirmas cambiar el rol de ${member.full_name || member.email}?`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Confirmar', onPress: () => updateParticipantRole({ userId: member.id, role }) },
        ]);
    };

    const confirmDeleteGroup = () => Alert.alert(
        'Eliminar grupo',
        'Â¿EstÃ¡s seguro? Esta acciÃ³n no se puede deshacer.',
        [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive', onPress: () => deleteGroup(conversationId, {
                    onSuccess: () => navigation.navigate('ConversationsList'),
                    onError: () => Alert.alert('Error', 'No se pudo eliminar el grupo.'),
                }),
            },
        ],
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handlePickGroupImage} disabled={!isAdmin || isUpdatingAvatar} style={styles.avatar} accessibilityLabel={isAdmin ? 'Cambiar imagen del grupo' : undefined}>
                    {isUpdatingAvatar ? <ActivityIndicator color={theme.colors.white} /> : avatarUrl
                        ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                        : <Text style={styles.initials}>{initials}</Text>}
                    {isAdmin && <View style={styles.camera}><Ionicons name="camera" size={16} color={theme.colors.white} /></View>}
                </TouchableOpacity>
                {isEditingName ? (
                    <View style={styles.editRow}>
                        <TextInput value={tempName} onChangeText={setTempName} onSubmitEditing={saveName} autoFocus style={styles.nameInput} />
                        <TouchableOpacity onPress={saveName}><Ionicons name="checkmark-circle" size={28} color={theme.colors.success} /></TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsEditingName(false)}><Ionicons name="close-circle" size={28} color={theme.colors.danger} /></TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.nameRow}>
                        <Text style={styles.name}>{name}</Text>
                        {isAdmin && <TouchableOpacity onPress={() => { setTempName(name); setIsEditingName(true); }}><Ionicons name="pencil" size={17} color={theme.colors.text.secondary} /></TouchableOpacity>}
                    </View>
                )}
                <Text style={styles.subtitle}>{subtitle}</Text>
                {isAdmin && (
                    <TouchableOpacity style={styles.compactAction} onPress={() => navigation.navigate('AddParticipants', { conversationId })}>
                        <Ionicons name="person-add-outline" size={20} color={theme.colors.accent} />
                        <Text style={styles.compactActionText}>AÃ±adir participante</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Archivos y contenido</Text>
                {summaryQuery.isError && (
                    <TouchableOpacity style={styles.errorRow} onPress={() => summaryQuery.refetch()}>
                        <Text style={styles.errorText}>No se pudo cargar. Toca para reintentar.</Text>
                    </TouchableOpacity>
                )}
                {categories.map((category) => (
                    <TouchableOpacity key={category.key} style={styles.contentRow} onPress={() => openCategory(category.key)}>
                        <View style={styles.contentIcon}><Ionicons name={category.icon} size={23} color={theme.colors.accent} /></View>
                        <View style={styles.contentInfo}>
                            <Text style={styles.contentTitle}>{category.title}</Text>
                            {category.key === 'visual' && recentVisuals.length > 0 ? (
                                <View style={styles.previewRow}>{recentVisuals.slice(0, 3).map((item) => <SharedContentThumbnail key={item.id} item={item} size={48} />)}</View>
                            ) : (
                                <Text style={styles.contentEmpty}>{summaryQuery.isLoading ? 'Cargandoâ€¦' : sharedContentCount(summary, category.key) === 0 ? 'Sin contenido' : 'Ver contenido compartido'}</Text>
                            )}
                        </View>
                        {summaryQuery.isLoading
                            ? <ActivityIndicator size="small" />
                            : <Text style={styles.count}>{sharedContentCount(summary, category.key)}</Text>}
                        <Ionicons name="chevron-forward" size={21} color={theme.colors.text.muted} />
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

            {isAdmin && (
                <TouchableOpacity style={styles.deleteButton} onPress={confirmDeleteGroup} disabled={isDeleting}>
                    <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
                    <Text style={styles.deleteText}>{isDeleting ? 'Eliminandoâ€¦' : 'Eliminar grupo'}</Text>
                </TouchableOpacity>
            )}
        </ScrollView>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { paddingBottom: theme.spacing.xl },
    header: { alignItems: 'center', backgroundColor: theme.colors.surface, padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 12 },
    avatarImage: { width: '100%', height: '100%' },
    initials: { color: theme.colors.white, fontSize: 32, fontWeight: '800' },
    camera: { position: 'absolute', right: 5, bottom: 5, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.overlay },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: theme.colors.text.primary, fontSize: 23, fontWeight: '800' },
    subtitle: { color: theme.colors.text.secondary, marginTop: 5 },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
    nameInput: { flex: 1, color: theme.colors.text.primary, fontSize: 19, fontWeight: '700', borderBottomWidth: 1, borderBottomColor: theme.colors.accent, paddingVertical: 5 },
    compactAction: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingHorizontal: 13, paddingVertical: 9, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.accentSoft },
    compactActionText: { color: theme.colors.accent, fontWeight: '700', fontSize: 13 },
    section: { marginTop: 9, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border },
    sectionTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    contentRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.separator, gap: 12 },
    contentIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accentSoft },
    contentInfo: { flex: 1 },
    contentTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
    contentEmpty: { color: theme.colors.text.muted, fontSize: 12, marginTop: 4 },
    previewRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
    count: { color: theme.colors.text.secondary, fontWeight: '700', minWidth: 24, textAlign: 'right' },
    errorRow: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surfaceMuted },
    errorText: { color: theme.colors.danger, fontSize: 12 },
    deleteButton: { marginTop: 9, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
    deleteText: { color: theme.colors.danger, fontWeight: '700' },
});
