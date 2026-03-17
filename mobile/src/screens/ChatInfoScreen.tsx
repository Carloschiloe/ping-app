import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, Alert, Modal, SafeAreaView, Linking, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useConversations, useDeleteGroup, useUpdateGroup, useConversationMedia, useConversationOperationState, useUpdateConversationMode, useGroupParticipants, useSaveOperationChecklist, useUpdateGroupParticipantRole } from '../api/queries';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadToSupabase } from '../lib/upload';
import { Video, ResizeMode } from 'expo-av';
import AudioPlayer from '../components/AudioPlayer';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useDeleteMessage } from '../api/queries';

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
    const { data: operationState } = useConversationOperationState(conversationId);
    const { data: participantsData = [] } = useGroupParticipants(isGroup ? conversationId : null);
    const { mutate: updateConversationMode, isPending: isUpdatingMode } = useUpdateConversationMode(conversationId);
    const { mutateAsync: saveChecklistTemplate, isPending: isSavingChecklist } = useSaveOperationChecklist(conversationId);
    const { mutate: updateParticipantRole, isPending: isUpdatingParticipantRole } = useUpdateGroupParticipantRole(conversationId);
    const conversationMode = operationState?.conversation?.mode || currentConv?.mode || 'chat';

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

    const members = useMemo(() => {
        if (!isGroup) return [];
        return participantsData.map((entry: any) => ({
            id: entry.user_id,
            role: entry.role || 'member',
            ...(Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles),
        }));
    }, [participantsData, isGroup]);

    const currentMembership = members.find((member: any) => member.id === user?.id);
    const isAdmin = isGroup && currentMembership?.role === 'admin';

    const [infoTab, setInfoTab] = useState<'files' | 'checklists'>('files');
    const [checklistModalVisible, setChecklistModalVisible] = useState(false);
    const [editingChecklist, setEditingChecklist] = useState<any>(null);
    const [checklistTitle, setChecklistTitle] = useState('');
    const [checklistCategory, setChecklistCategory] = useState('');
    const [checklistRole, setChecklistRole] = useState('');
    const [checklistFrequency, setChecklistFrequency] = useState<'manual' | 'daily' | 'shift'>('manual');
    const [checklistItems, setChecklistItems] = useState('');

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

    const [viewerMedia, setViewerMedia] = useState<{ url: string, type: 'image' | 'video' | 'doc', message?: any } | null>(null);
    const { mutate: deleteGroup, isPending: isDeleting } = useDeleteGroup();
    const { mutate: updateGroup } = useUpdateGroup(conversationId);

    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<any>(null);
    const [isMediaMenuVisible, setIsMediaMenuVisible] = useState(false);

    const { mutate: deleteMessage } = useDeleteMessage(conversationId);

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

    const openChecklistEditor = (checklist?: any) => {
        setEditingChecklist(checklist || null);
        setChecklistTitle(checklist?.title || '');
        setChecklistCategory(checklist?.category_label || '');
        setChecklistRole(checklist?.responsible_role_label || '');
        setChecklistFrequency(checklist?.frequency || 'manual');
        setChecklistItems((checklist?.run?.items || []).map((item: any) => item.label).join('\n'));
        setChecklistModalVisible(true);
    };

    const handleSaveChecklistTemplate = async () => {
        const items = checklistItems
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);

        if (!checklistTitle.trim() || items.length === 0) {
            Alert.alert('Checklist incompleto', 'Agrega un nombre y al menos un item.');
            return;
        }

        try {
            await saveChecklistTemplate({
                checklistId: editingChecklist?.id || null,
                title: checklistTitle.trim(),
                categoryLabel: checklistCategory.trim() || null,
                responsibleRoleLabel: checklistRole.trim() || null,
                frequency: checklistFrequency,
                items,
            });
            setChecklistModalVisible(false);
            setEditingChecklist(null);
            setChecklistTitle('');
            setChecklistCategory('');
            setChecklistRole('');
            setChecklistItems('');
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'No se pudo guardar el checklist');
        }
    };

    const handleToggleAdmin = (member: any) => {
        const nextRole = member.role === 'admin' ? 'member' : 'admin';
        const actionLabel = nextRole === 'admin' ? 'nombrar administrador' : 'quitar permisos de administrador';
        Alert.alert(
            'Administradores',
            `¿Quieres ${actionLabel} a ${member.full_name || member.email}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: () => updateParticipantRole({ userId: member.id, role: nextRole }),
                },
            ]
        );
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

    const handleShareMedia = async () => {
        if (!selectedMedia) return;
        const url = selectedMedia.parsedUrl || selectedMedia.text.match(/\](http.*)$/)?.[1];
        if (!url) return;

        try {
            const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + (url.split('/').pop() || 'file');
            const download = await FileSystem.downloadAsync(url, fileUri);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(download.uri);
            }
        } catch (error) {
            Alert.alert('Error', 'No se pudo compartir el archivo.');
        }
    };

    const handleDownloadMedia = async () => {
        const media = viewerMedia?.message || selectedMedia;
        const url = media?.parsedUrl || (media?.text.startsWith('[document=') ? media.text.match(/\](.*?)$/)?.[1].trim() : null);
        if (!url) return;

        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para guardar el archivo.');
                return;
            }

            const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + (url.split('/').pop() || 'file');
            const download = await FileSystem.downloadAsync(url, fileUri);
            await MediaLibrary.saveToLibraryAsync(download.uri);
            Alert.alert('✅ Guardado', 'El archivo se guardó en tu galería.');
        } catch (error) {
            Alert.alert('Error', 'No se pudo descargar el archivo.');
        }
    };

    const handleDeleteMedia = () => {
        const media = viewerMedia?.message || selectedMedia;
        if (!media) return;
        
        Alert.alert(
            'Eliminar archivo',
            '¿Estás seguro de que quieres eliminar este archivo para todos?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { 
                    text: 'Eliminar', 
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            deleteMessage(media.id);
                            setIsMediaMenuVisible(false); // Deprecated, but keeping for safety
                            setViewerMedia(null);
                        } catch (err) {
                            Alert.alert('Error', 'No se pudo eliminar el archivo.');
                        }
                    }
                }
            ]
        );
    };

    const handleViewMedia = () => {
        // Obsoleto, ya no se usa menú intermedio
    };

    const handleForwardMedia = () => {
        const media = viewerMedia?.message || selectedMedia;
        if (!media) return;
        setIsMediaMenuVisible(false); // Deprecated, but keeping for safety
        setViewerMedia(null);
        navigation.navigate('ForwardMessage', { 
            message: {
                ...media,
                text: `[media]${media.parsedUrl || media.text}`
            } 
        });
    };

    const renderMember = ({ item }: { item: any }) => (
        <View style={styles.memberRow}>
            <View style={styles.memberAvatar}>
                {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
                ) : (
                    <Text style={styles.memberInitials}>{item.email.substring(0, 2).toUpperCase()}</Text>
                )}
            </View>
            <View style={styles.memberInfo}>
                <Text style={styles.memberEmail}>{item.full_name || item.email}</Text>
                <Text style={styles.memberSubline}>{item.email}</Text>
                {item.role === 'admin' && <Text style={styles.adminBadge}>Admin</Text>}
            </View>
            {isAdmin && item.id !== user?.id && (
                <TouchableOpacity
                    style={[styles.memberRoleBtn, isUpdatingParticipantRole && { opacity: 0.6 }]}
                    onPress={() => handleToggleAdmin(item)}
                    disabled={isUpdatingParticipantRole}
                >
                    <Text style={styles.memberRoleBtnText}>{item.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</Text>
                </TouchableOpacity>
            )}
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

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Modo de conversación</Text>
                <View style={styles.modeToggle}>
                    <TouchableOpacity
                        style={[styles.modeBtn, conversationMode === 'chat' && styles.modeBtnActive]}
                        disabled={isUpdatingMode}
                        onPress={() => updateConversationMode('chat')}
                    >
                        <Text style={[styles.modeBtnText, conversationMode === 'chat' && styles.modeBtnTextActive]}>Chat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeBtn, conversationMode === 'operation' && styles.modeBtnActive]}
                        disabled={isUpdatingMode}
                        onPress={() => updateConversationMode('operation')}
                    >
                        <Text style={[styles.modeBtnText, conversationMode === 'operation' && styles.modeBtnTextActive]}>Operación</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.modeHelpText}>
                    {conversationMode === 'operation'
                        ? 'Activa fijado, checklist, ubicación y resumen de turno sobre el chat.'
                        : 'Mantiene el chat limpio, sin capa operativa extra.'}
                </Text>
            </View>

            {isGroup && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recursos del grupo</Text>
                    <View style={styles.resourceTabs}>
                        <TouchableOpacity
                            style={[styles.resourceTab, infoTab === 'files' && styles.resourceTabActive]}
                            onPress={() => setInfoTab('files')}
                        >
                            <Text style={[styles.resourceTabText, infoTab === 'files' && styles.resourceTabTextActive]}>Archivos</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.resourceTab, infoTab === 'checklists' && styles.resourceTabActive]}
                            onPress={() => setInfoTab('checklists')}
                        >
                            <Text style={[styles.resourceTabText, infoTab === 'checklists' && styles.resourceTabTextActive]}>Checklists</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Visual Media Section (Images & Videos) */}
            {infoTab === 'files' && mediaFiles.images.length > 0 && (
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
                                    onPress={() => {
                                        setViewerMedia({ 
                                            url, 
                                            type: isImage ? 'image' : 'video',
                                            message: item
                                        });
                                    }}
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
            {infoTab === 'files' && mediaFiles.docs.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Documentos</Text>
                    {mediaFiles.docs.map(docMsg => {
                        const match = docMsg.text.match(/^\[document=([^\]]+)\](.*)$/);
                        if (!match) return null;
                        const [, filename, docUrl] = match;
                        return (
                            <TouchableOpacity 
                                key={docMsg.id} 
                                style={styles.docRow} 
                                onPress={() => {
                                    setViewerMedia({
                                        url: docUrl,
                                        type: 'doc',
                                        message: { ...docMsg, parsedUrl: docUrl }
                                    });
                                }}
                            >
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
            {infoTab === 'files' && mediaFiles.audios.length > 0 && (
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
            {infoTab === 'files' && !isMediaLoading && mediaFiles.images.length === 0 && mediaFiles.docs.length === 0 && mediaFiles.audios.length === 0 && (
                <View style={styles.emptyMedia}>
                    <Ionicons name="images-outline" size={48} color="#9ca3af" />
                    <Text style={styles.emptyMediaText}>No hay archivos compartidos aún</Text>
                </View>
            )}

            {isGroup && infoTab === 'checklists' && (
                <View style={styles.section}>
                    <View style={styles.checklistHeaderRow}>
                        <Text style={styles.sectionTitle}>Checklists del grupo</Text>
                        {isAdmin && (
                            <TouchableOpacity style={styles.newChecklistBtn} onPress={() => openChecklistEditor()}>
                                <Ionicons name="add" size={16} color="white" />
                                <Text style={styles.newChecklistBtnText}>Nuevo</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {operationState?.checklists?.length ? (
                        operationState.checklists.map((list: any) => (
                            <TouchableOpacity
                                key={list.id}
                                style={styles.checklistCard}
                                activeOpacity={0.85}
                                onPress={() => isAdmin && openChecklistEditor(list)}
                            >
                                <View style={styles.checklistCardHeader}>
                                    <Text style={styles.checklistCardTitle}>{list.title}</Text>
                                    <Text style={styles.checklistCardCount}>{list.run?.items?.length || 0} items</Text>
                                </View>
                                <Text style={styles.checklistCardMeta}>
                                    {list.category_label || 'General'} · {list.responsible_role_label || 'Sin rol'} · {list.frequency || 'manual'}
                                </Text>
                                {list.run?.items?.length ? (
                                    <Text style={styles.checklistCardSubtext} numberOfLines={2}>
                                        {list.run.items.map((item: any) => item.label).join(' · ')}
                                    </Text>
                                ) : null}
                            </TouchableOpacity>
                        ))
                    ) : (
                        <View style={styles.emptyMedia}>
                            <Ionicons name="checkmark-done-outline" size={44} color="#9ca3af" />
                            <Text style={styles.emptyMediaText}>Aún no hay checklists creados en este grupo</Text>
                        </View>
                    )}
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

            <Modal visible={checklistModalVisible} transparent animationType="slide" onRequestClose={() => setChecklistModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.checklistModalCard}>
                        <View style={styles.modalHeaderRow}> 
                            <Text style={styles.modalTitleText}>{editingChecklist ? 'Editar checklist' : 'Nuevo checklist'}</Text>
                            <TouchableOpacity onPress={() => setChecklistModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Nombre del checklist"
                            value={checklistTitle}
                            onChangeText={setChecklistTitle}
                        />
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Categoría (ej. Mantención)"
                            value={checklistCategory}
                            onChangeText={setChecklistCategory}
                        />
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Rol responsable (ej. Maquinista)"
                            value={checklistRole}
                            onChangeText={setChecklistRole}
                        />

                        <View style={styles.frequencyRow}>
                            {(['manual', 'daily', 'shift'] as const).map((frequency) => (
                                <TouchableOpacity
                                    key={frequency}
                                    style={[styles.frequencyChip, checklistFrequency === frequency && styles.frequencyChipActive]}
                                    onPress={() => setChecklistFrequency(frequency)}
                                >
                                    <Text style={[styles.frequencyChipText, checklistFrequency === frequency && styles.frequencyChipTextActive]}>
                                        {frequency === 'manual' ? 'Manual' : frequency === 'daily' ? 'Diario' : 'Por turno'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={styles.modalTextArea}
                            placeholder="Un item por línea"
                            value={checklistItems}
                            onChangeText={setChecklistItems}
                            multiline
                            textAlignVertical="top"
                        />

                        <TouchableOpacity
                            style={[styles.saveChecklistBtn, isSavingChecklist && { opacity: 0.6 }]}
                            onPress={handleSaveChecklistTemplate}
                            disabled={isSavingChecklist}
                        >
                            <Text style={styles.saveChecklistBtnText}>{isSavingChecklist ? 'Guardando...' : 'Guardar checklist'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Fullscreen Media Viewer */}
            <Modal visible={!!viewerMedia} transparent={true} animationType="fade">
                <View style={styles.viewerContainer}>
                    <SafeAreaView style={{ flex: 1 }}>
                        <View style={styles.viewerHeader}>
                            <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerMedia(null)}>
                                <Ionicons name="arrow-back" size={28} color="white" />
                            </TouchableOpacity>
                            <View style={styles.viewerHeaderText}>
                                <Text style={styles.viewerSender}>{viewerMedia?.message?.profiles?.full_name || (viewerMedia?.message?.sender_id === user?.id ? 'Tú' : 'Usuario')}</Text>
                                <Text style={styles.viewerDate}>
                                    {viewerMedia?.message?.created_at ? new Date(viewerMedia.message.created_at).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.viewerContent}>
                            {viewerMedia?.type === 'image' && (
                                <Image source={{ uri: viewerMedia.url }} style={styles.viewerImage} resizeMode="contain" />
                            )}
                            {viewerMedia?.type === 'video' && (
                                <Video
                                    source={{ uri: viewerMedia.url }}
                                    style={styles.viewerImage}
                                    useNativeControls
                                    resizeMode={ResizeMode.CONTAIN}
                                    shouldPlay
                                />
                            )}
                            {viewerMedia?.type === 'doc' && (
                                <View style={styles.docViewerContent}>
                                    <Ionicons name="document-text" size={80} color="white" />
                                    <Text style={styles.docViewerName}>
                                        {viewerMedia.message?.text.match(/\[document=([^\]]+)\]/)?.[1] || 'Documento'}
                                    </Text>
                                    <TouchableOpacity 
                                        style={styles.openDocBtn} 
                                        onPress={() => Linking.openURL(viewerMedia.url)}
                                    >
                                        <Text style={styles.openDocBtnText}>Abrir documento</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Viewer Toolbar */}
                        <View style={styles.viewerToolbar}>
                            <TouchableOpacity style={styles.toolbarItem} onPress={handleShareMedia}>
                                <Ionicons name="share-outline" size={26} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolbarItem} onPress={handleForwardMedia}>
                                <Ionicons name="arrow-redo-outline" size={26} color="white" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.toolbarItem} onPress={handleDownloadMedia}>
                                <Ionicons name="download-outline" size={26} color="white" />
                            </TouchableOpacity>
                            {(viewerMedia?.message?.sender_id === user?.id || isAdmin) && (
                                <TouchableOpacity style={styles.toolbarItem} onPress={handleDeleteMedia}>
                                    <Ionicons name="trash-outline" size={26} color="#ef4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </SafeAreaView>
                </View>
            </Modal>

            {/* Obsolete Media Options Menu (Removed from flow but keeping state to avoid refactor break) */}
            <Modal visible={false} transparent={true} animationType="slide">
                <TouchableOpacity 
                    style={styles.menuOverlay} 
                    activeOpacity={1} 
                    onPress={() => setIsMediaMenuVisible(false)}
                >
                    <View style={styles.menuContent}>
                        <View style={styles.menuHeader}>
                            <View style={styles.menuIndicator} />
                        </View>
                        
                        <TouchableOpacity style={styles.menuItem} onPress={handleViewMedia}>
                            <Ionicons name="eye-outline" size={24} color="#1e3a5f" />
                            <Text style={[styles.menuItemText, { fontWeight: '600', color: '#1e3a5f' }]}>
                                {selectedMedia?.text.startsWith('[document=') ? 'Abrir archivo' : 'Ver archivo'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={handleForwardMedia}>
                            <Ionicons name="arrow-redo-outline" size={24} color="#374151" />
                            <Text style={styles.menuItemText}>Reenviar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={handleShareMedia}>
                            <Ionicons name="share-outline" size={24} color="#374151" />
                            <Text style={styles.menuItemText}>Compartir</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuItem} onPress={handleDownloadMedia}>
                            <Ionicons name="download-outline" size={24} color="#374151" />
                            <Text style={styles.menuItemText}>Descargar</Text>
                        </TouchableOpacity>

                        {(selectedMedia?.sender_id === user?.id || isAdmin) && (
                            <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleDeleteMedia}>
                                <Ionicons name="trash-outline" size={24} color="#ef4444" />
                                <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Eliminar</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.menuCancel} onPress={() => setIsMediaMenuVisible(false)}>
                            <Text style={styles.menuCancelText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
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
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: '#e2e8f0',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    modeBtnActive: {
        backgroundColor: '#2563eb',
    },
    modeBtnText: {
        color: '#475569',
        fontWeight: '700',
    },
    modeBtnTextActive: {
        color: 'white',
    },
    modeHelpText: {
        marginTop: 10,
        fontSize: 13,
        lineHeight: 18,
        color: '#64748b',
    },
    resourceTabs: {
        flexDirection: 'row',
        backgroundColor: '#e2e8f0',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    resourceTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    resourceTabActive: {
        backgroundColor: '#2563eb',
    },
    resourceTabText: {
        fontWeight: '700',
        color: '#475569',
    },
    resourceTabTextActive: {
        color: 'white',
    },
    checklistHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    newChecklistBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#2563eb',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
    },
    newChecklistBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 12,
    },
    checklistCard: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        backgroundColor: '#f8fafc',
    },
    checklistCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    checklistCardTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    checklistCardCount: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563eb',
    },
    checklistCardMeta: {
        marginTop: 6,
        fontSize: 12,
        color: '#64748b',
    },
    checklistCardSubtext: {
        marginTop: 8,
        fontSize: 12,
        color: '#475569',
        lineHeight: 18,
    },
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

    viewerContainer: { flex: 1, backgroundColor: 'black' },
    viewerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    viewerHeaderText: {
        marginLeft: 16,
    },
    viewerSender: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    viewerDate: {
        color: '#9ca3af',
        fontSize: 12,
    },
    viewerClose: {
        padding: 4,
    },
    viewerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    viewerImage: { width: '100%', height: '100%' },
    viewerToolbar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderTopWidth: 0.5,
        borderTopColor: '#374151',
    },
    toolbarItem: {
        padding: 10,
    },
    docViewerContent: {
        alignItems: 'center',
        padding: 40,
    },
    docViewerName: {
        color: 'white',
        fontSize: 18,
        fontWeight: '500',
        marginTop: 20,
        textAlign: 'center',
    },
    openDocBtn: {
        marginTop: 30,
        backgroundColor: '#1e3a5f',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 25,
    },
    openDocBtnText: {
        color: 'white',
        fontWeight: '600',
    },

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
    memberSubline: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    adminBadge: { fontSize: 12, color: '#10b981', fontWeight: 'bold', marginTop: 2 },
    memberRoleBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#eff6ff',
    },
    memberRoleBtnText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },

    deleteBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'white', padding: 16, marginTop: 8, marginBottom: 32, gap: 8,
    },
    deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 16 },
    emptyMedia: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, opacity: 0.6 },
    emptyMediaText: { marginTop: 12, color: '#6b7280', fontSize: 14, fontWeight: '500' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    checklistModalCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        maxWidth: 440,
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitleText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        marginBottom: 10,
        color: '#111827',
    },
    modalTextArea: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        minHeight: 140,
        color: '#111827',
        marginBottom: 14,
    },
    frequencyRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    frequencyChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#f3f4f6',
    },
    frequencyChipActive: {
        backgroundColor: '#dbeafe',
    },
    frequencyChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#475569',
    },
    frequencyChipTextActive: {
        color: '#2563eb',
    },
    saveChecklistBtn: {
        backgroundColor: '#2563eb',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveChecklistBtnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 15,
    },

    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
    menuHeader: { alignItems: 'center', paddingVertical: 12 },
    menuIndicator: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2 },
    menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    menuItemText: { marginLeft: 16, fontSize: 16, color: '#374151', fontWeight: '500' },
    menuCancel: { marginTop: 8, padding: 16, alignItems: 'center' },
    menuCancelText: { fontSize: 16, color: '#6b7280', fontWeight: 'bold' },
});
