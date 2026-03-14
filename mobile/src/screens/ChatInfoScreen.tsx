import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, Alert, Modal, SafeAreaView, Linking, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useConversations, useDeleteGroup, useConversationMessages, useUpdateGroup, useConversationMedia } from '../api/queries';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadToSupabase } from '../lib/upload';
import { Video, ResizeMode } from 'expo-av';
import AudioPlayer from '../components/AudioPlayer';

export default function ChatInfoScreen() {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { user } = useAuth();

    const conversationId = route.params?.conversationId;
    const groupMetadata = route.params?.groupMetadata;
    const otherUser = route.params?.otherUser;
    const isGroup = route.params?.isGroup;
    const isSelf = route.params?.isSelf;

    const { data: convData } = useConversations();
    const currentConv = convData?.conversations?.find((c: any) => c.id === conversationId);

    // Dynamic Header Info
    let name = 'Chat';
    let avatarUrlStr: string | undefined = undefined;
    let initials = '?';

    if (isSelf) {
        name = 'Mis Recordatorios';
        initials = user?.email?.substring(0, 2).toUpperCase() || 'YO';
    } else if (isGroup) {
        name = currentConv?.groupMetadata?.name || groupMetadata?.name || 'Grupo Empresarial';
        avatarUrlStr = currentConv?.groupMetadata?.avatar_url || groupMetadata?.avatar_url;
        initials = name.substring(0, 2).toUpperCase();
    } else if (otherUser) {
        name = otherUser.email;
        avatarUrlStr = otherUser.avatar_url;
        initials = otherUser.email.substring(0, 2).toUpperCase();
    }

    const adminId = currentConv?.groupMetadata?.admin_id || groupMetadata?.admin_id;
    const isAdmin = isGroup && adminId === user?.id;

    // Get members (only for groups)
    const members = isGroup ? (currentConv?.groupMetadata?.participants || []) : [];

    // Get media from messages
    const { data: mediaMessages, isLoading: isMediaLoading } = useConversationMedia(conversationId);

    const mediaFiles = useMemo(() => {
        const images: any[] = [];
        const docs: any[] = [];
        const audios: any[] = [];

        if (!mediaMessages) return { images, docs, audios };

        const robustExtract = (text: string, prefixLength: number) => {
            const full = text.slice(prefixLength).trim();
            const match = full.match(/^([^\s\n]+)[\s\n]*([\s\S]*)$/);
            if (!match) return { url: full };
            return { url: match[1] };
        };

        mediaMessages.forEach((m: any) => {
            if (!m.text) return;
            const text = m.text.trim();
            if (text.startsWith('[imagen]') || text.startsWith('[video]')) {
                const prefix = text.startsWith('[imagen]') ? 8 : 7;
                const { url } = robustExtract(text, prefix);
                images.push({ ...m, parsedUrl: url });
            } else if (text.startsWith('[document=')) {
                docs.push(m);
            } else if (text.startsWith('[audio]')) {
                const { url } = robustExtract(text, 7);
                audios.push({ ...m, parsedUrl: url });
            }
        });
        return { images, docs, audios };
    }, [mediaMessages, isGroup]);

    const [viewerMedia, setViewerMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
    const { mutate: deleteGroup, isPending: isDeleting } = useDeleteGroup();
    const { mutate: updateGroup } = useUpdateGroup(conversationId);

    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const handlePickGroupImage = async () => {
        if (!isAdmin) return;

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0].uri) {
            try {
                setIsUpdating(true);
                const publicUrl = await uploadToSupabase(result.assets[0].uri, 'chat-media', 'image/jpeg');
                if (publicUrl) {
                    updateGroup({ avatar_url: publicUrl });
                    Alert.alert('✅ Foto actualizada', 'La imagen del grupo ha sido actualizada.');
                }
            } catch (error) {
                Alert.alert('Error', 'No se pudo actualizar la imagen del grupo.');
            } finally {
                setIsUpdating(false);
            }
        }
    };

    const handleSaveName = () => {
        if (!tempName.trim() || tempName === name) {
            setIsEditingName(false);
            return;
        }
        updateGroup({ name: tempName.trim() }, {
            onSuccess: () => {
                setIsEditingName(false);
                Alert.alert('✅ Nombre actualizado', 'El nombre del grupo ha sido actualizado.');
            }
        });
    };

    const handleDeleteGroup = () => {
        Alert.alert(
            'Eliminar Grupo',
            '¿Estás seguro de que deseas eliminar este grupo para todos? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        deleteGroup(conversationId, {
                            onSuccess: () => {
                                navigation.navigate('ConversationsList');
                            },
                            onError: (err: any) => {
                                Alert.alert('Error', err.response?.data?.error || 'No se pudo eliminar el grupo');
                            }
                        });
                    }
                }
            ]
        );
    };

    const renderMember = ({ item }: { item: any }) => (
        <View style={styles.memberRow}>
            <View style={styles.memberAvatar}>
                {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <Text style={styles.memberInitials}>{item.email.substring(0, 2).toUpperCase()}</Text>
                )}
            </View>
            <View style={styles.memberInfo}>
                <Text style={styles.memberEmail}>{item.email}</Text>
                {item.id === adminId && <Text style={styles.adminBadge}>Admin</Text>}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header / Avatar */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={handlePickGroupImage}
                    disabled={!isAdmin || isUpdating}
                    style={[styles.avatarLarge, !avatarUrlStr && isSelf && { backgroundColor: '#10b981' }]}
                >
                    {isUpdating ? (
                        <ActivityIndicator color="white" />
                    ) : avatarUrlStr ? (
                        <Image source={{ uri: avatarUrlStr }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <Text style={styles.avatarInitialsLarge}>{initials}</Text>
                    )}
                    {isAdmin && (
                        <View style={styles.cameraIconOverlay}>
                            <Ionicons name="camera" size={20} color="white" />
                        </View>
                    )}
                </TouchableOpacity>

                {isEditingName ? (
                    <View style={styles.nameEditRow}>
                        <TextInput
                            style={styles.nameInput}
                            value={tempName}
                            onChangeText={setTempName}
                            autoFocus
                            onSubmitEditing={handleSaveName}
                        />
                        <TouchableOpacity onPress={handleSaveName}>
                            <Ionicons name="checkmark-circle" size={28} color="#10b981" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsEditingName(false)}>
                            <Ionicons name="close-circle" size={28} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.nameRow}>
                        <Text style={styles.groupName}>{name}</Text>
                        {isAdmin && (
                            <TouchableOpacity onPress={() => { setTempName(name); setIsEditingName(true); }}>
                                <Ionicons name="pencil" size={16} color="#6b7280" style={{ marginLeft: 8 }} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                {isGroup && <Text style={styles.memberCount}>{members.length} participantes</Text>}
            </View>

            {/* Actions for Admin */}
            {isAdmin && (
                <View style={styles.adminActions}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => navigation.navigate('AddParticipants', { conversationId })}
                    >
                        <Ionicons name="person-add" size={24} color="#1e3a5f" />
                        <Text style={styles.actionText}>Añadir</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Visual Media Section (Images & Videos) */}
            {mediaFiles.images.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fotos y Videos</Text>
                    <FlatList
                        horizontal
                        data={mediaFiles.images}
                        keyExtractor={(item) => item.id}
                        ListEmptyComponent={isMediaLoading ? <ActivityIndicator style={{ margin: 20 }} /> : null}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item }) => {
                            const isImage = item.text.startsWith('[imagen]');
                            const url = item.parsedUrl;
                            return (
                                <TouchableOpacity
                                    style={styles.mediaItem}
                                    onPress={() => setViewerMedia({ url, type: isImage ? 'image' : 'video' })}
                                >
                                    {isImage || url.toLowerCase().includes('.mp4') ? (
                                        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
                                    ) : (
                                        <View style={styles.audioPlaceholder}>
                                            <Ionicons name="videocam" size={24} color="gray" />
                                        </View>
                                    )}
                                    {!isImage && (
                                        <View style={styles.playIconOverlay}>
                                            <Ionicons name="play-circle" size={24} color="white" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            )}

            {/* Documents Section */}
            {mediaFiles.docs.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Documentos</Text>
                    {mediaFiles.docs.map(docMsg => {
                        const match = docMsg.text.match(/^\[document=([^\]]+)\](.*)$/);
                        if (!match) return null;
                        const [, filename, docUrl] = match;
                        return (
                            <TouchableOpacity key={docMsg.id} style={styles.docRow} onPress={() => Linking.openURL(docUrl)}>
                                <View style={styles.docIcon}>
                                    <Ionicons name="document-text" size={24} color="white" />
                                </View>
                                <Text style={styles.docName} numberOfLines={1}>{filename}</Text>
                                <Ionicons name="download-outline" size={20} color="#6b7280" />
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* Audios Section */}
            {mediaFiles.audios.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Notas de Voz</Text>
                    {mediaFiles.audios.map((audioMsg: any) => {
                        const url = audioMsg.parsedUrl;
                        if (!url) return null;
                        const dateText = new Date(audioMsg.created_at).toLocaleDateString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        return (
                            <View key={audioMsg.id} style={styles.audioRowItem}>
                                <AudioPlayer url={url} isMe={false} style={{ width: 220, backgroundColor: '#f3f4f6', borderRadius: 8 }} />
                                <Text style={styles.audioDate}>{dateText}</Text>
                            </View>
                        );
                    })}
                </View>
            )}

            {/* Empty Media State */}
            {!isMediaLoading && mediaFiles.images.length === 0 && mediaFiles.docs.length === 0 && mediaFiles.audios.length === 0 && (
                <View style={styles.emptyMedia}>
                    <Ionicons name="images-outline" size={48} color="#9ca3af" />
                    <Text style={styles.emptyMediaText}>No hay archivos compartidos aún</Text>
                </View>
            )}

            {/* Participants (Only for Groups) */}
            {isGroup && (
                <View style={[styles.section, { flex: 1 }]}>
                    <Text style={styles.sectionTitle}>{members.length} Integrantes</Text>
                    <FlatList
                        data={members}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMember}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            )}

            {/* Delete button */}
            {isAdmin && (
                <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={handleDeleteGroup}
                    disabled={isDeleting}
                >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    <Text style={styles.deleteBtnText}>
                        {isDeleting ? 'Eliminando...' : 'Eliminar Grupo'}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Fullscreen Media Viewer */}
            <Modal visible={!!viewerMedia} transparent={true} animationType="fade">
                <View style={styles.viewerContainer}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
                            <Ionicons name="close" size={32} color="white" />
                        </TouchableOpacity>
                        {viewerMedia?.type === 'image' && (
                            <Image source={{ uri: viewerMedia.url }} style={styles.viewerImage} resizeMode="contain" />
                        )}
                        {viewerMedia?.type === 'video' && (
                            <Video
                                source={{ uri: viewerMedia.url }}
                                style={styles.viewerImage}
                                resizeMode={ResizeMode.CONTAIN}
                                useNativeControls
                                shouldPlay
                            />
                        )}
                    </SafeAreaView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f3f4f6' },
    header: {
        alignItems: 'center',
        backgroundColor: 'white',
        paddingVertical: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    avatarLarge: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#1e3a5f',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', marginBottom: 16,
    },
    avatarInitialsLarge: { fontSize: 36, fontWeight: '700', color: 'white' },
    cameraIconOverlay: {
        position: 'absolute', bottom: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', width: 32, height: 32,
        borderRadius: 16, alignItems: 'center', justifyContent: 'center'
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    nameEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8, paddingHorizontal: 20 },
    nameInput: {
        flex: 1, fontSize: 20, fontWeight: '700', color: '#111827',
        borderBottomWidth: 1, borderBottomColor: '#3b82f6', paddingVertical: 4
    },
    groupName: { fontSize: 24, fontWeight: '700', color: '#111827' },
    memberCount: { fontSize: 14, color: '#6b7280' },

    adminActions: {
        flexDirection: 'row', justifyContent: 'center',
        backgroundColor: 'white', paddingVertical: 12,
        marginBottom: 8,
    },
    actionBtn: { alignItems: 'center', marginHorizontal: 20 },
    actionText: { marginTop: 4, color: '#1e3a5f', fontWeight: '500', fontSize: 12 },

    section: {
        backgroundColor: 'white',
        marginTop: 8, padding: 16,
        borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb',
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 12 },
    mediaItem: {
        width: 70, height: 70, borderRadius: 8, backgroundColor: '#f3f4f6',
        marginRight: 8, overflow: 'hidden', justifyContent: 'center', alignItems: 'center'
    },
    audioPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    playIconOverlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center'
    },

    docRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb',
        padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb'
    },
    docIcon: {
        width: 40, height: 40, borderRadius: 8, backgroundColor: '#ef4444',
        alignItems: 'center', justifyContent: 'center', marginRight: 12
    },
    docName: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },

    viewerContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
    viewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
    viewerImage: { width: '100%', height: '100%', flex: 1 },

    audioRowItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    audioDate: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },

    memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    memberAvatar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#9ca3af',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12,
    },
    memberInitials: { fontSize: 16, fontWeight: '700', color: 'white' },
    memberInfo: { flex: 1 },
    memberEmail: { fontSize: 16, fontWeight: '500', color: '#111827' },
    adminBadge: { fontSize: 12, color: '#10b981', fontWeight: 'bold', marginTop: 2 },

    deleteBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'white', padding: 16, marginTop: 8, marginBottom: 32, gap: 8,
    },
    deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 16 },
    emptyMedia: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, opacity: 0.6 },
    emptyMediaText: { marginTop: 12, color: '#6b7280', fontSize: 14, fontWeight: '500' },
});
