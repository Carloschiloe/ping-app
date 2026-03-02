import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, SafeAreaView, Platform, KeyboardAvoidingView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUserSearch, useCreateGroup } from '../api/queries';
import { uploadToSupabase } from '../lib/upload';

export default function NewGroupScreen({ navigation }: any) {
    const [name, setName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const { data: searchResults, isLoading: isSearching } = useUserSearch(searchQuery);
    const { mutate: createGroup, isPending: isCreating } = useCreateGroup();

    const handleToggleSelect = (userId: string) => {
        setSelectedIds(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled && result.assets[0]?.uri) {
            setAvatarUri(result.assets[0].uri);
        }
    };

    const handleCreateGroup = async () => {
        if (!name.trim()) {
            Alert.alert('Falta el nombre', 'Por favor, dale un nombre a tu grupo.');
            return;
        }
        if (selectedIds.length === 0) {
            Alert.alert('Faltan miembros', 'Debes seleccionar al menos un contacto para formar el grupo.');
            return;
        }

        let avatarUrl = null;
        if (avatarUri) {
            setIsUploading(true);
            avatarUrl = await uploadToSupabase(avatarUri, 'chat-media', 'image/jpeg');
            setIsUploading(false);
            if (!avatarUrl) {
                Alert.alert('Error', 'No se pudo subir la imagen del grupo.');
                return;
            }
        }

        createGroup(
            { name: name.trim(), participantIds: selectedIds, avatarUrl: avatarUrl || undefined },
            {
                onSuccess: (data) => {
                    // Start directly to the ChatScreen for this new group
                    navigation.replace('Chat', {
                        conversationId: data.conversationId,
                        otherUser: { email: data.name }, // Hack to show name
                        isGroup: true
                    });
                },
                onError: (err: any) => {
                    Alert.alert('Error', err.message || 'No se pudo crear el grupo');
                }
            }
        );
    };

    const users = searchResults?.users || [];

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
            >
                {/* Header Input Section */}
                <View style={styles.headerSection}>
                    <View style={styles.groupHeaderRow}>
                        <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>
                            {avatarUri ? (
                                <Image source={{ uri: avatarUri }} style={styles.groupImagePreview} />
                            ) : (
                                <View style={styles.imagePickerPlaceholder}>
                                    <Ionicons name="camera" size={24} color="#3b82f6" />
                                </View>
                            )}
                        </TouchableOpacity>

                        <View style={styles.groupNameContainer}>
                            <Text style={styles.label}>Nombre del Grupo</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Ej: Mantenimiento..."
                                placeholderTextColor="#9ca3af"
                                value={name}
                                onChangeText={setName}
                            />
                        </View>
                    </View>

                    <Text style={[styles.label, { marginTop: 16 }]}>Invitar a...</Text>
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={20} color="#9ca3af" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar por correo electrónico..."
                            placeholderTextColor="#9ca3af"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                </View>

                {/* Results List */}
                {isSearching ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#3b82f6" />
                    </View>
                ) : (
                    <FlatList
                        data={users}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContainer}
                        ListEmptyComponent={
                            searchQuery.length >= 2 ? (
                                <Text style={styles.emptyText}>No se encontraron usuarios</Text>
                            ) : null
                        }
                        renderItem={({ item }) => {
                            const isSelected = selectedIds.includes(item.id);
                            return (
                                <TouchableOpacity
                                    style={[styles.userRow, isSelected && styles.userRowSelected]}
                                    onPress={() => handleToggleSelect(item.id)}
                                >
                                    <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                                        <Text style={styles.avatarText}>
                                            {item.email.substring(0, 2).toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text style={styles.userName}>{item.email}</Text>
                                    <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                                        {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                )}

                {/* Create Button Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[
                            styles.createBtn,
                            (selectedIds.length === 0 || !name.trim() || isUploading || isCreating) && styles.createBtnDisabled
                        ]}
                        onPress={handleCreateGroup}
                        disabled={isCreating || isUploading || selectedIds.length === 0 || !name.trim()}
                    >
                        {isCreating || isUploading ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <>
                                <Ionicons name="people" size={20} color="white" />
                                <Text style={styles.createBtnText}>
                                    Crear Grupo ({selectedIds.length + 1})
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    container: { flex: 1 },
    headerSection: {
        padding: 20,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderColor: '#e5e7eb',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    groupHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    imagePickerBtn: {
        marginRight: 16,
    },
    imagePickerPlaceholder: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#eff6ff',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#bfdbfe',
        borderStyle: 'dashed',
    },
    groupImagePreview: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    groupNameContainer: {
        flex: 1,
    },
    input: {
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#1f2937',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        color: '#1f2937',
    },
    listContainer: { padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 32 },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    userRowSelected: {
        borderColor: '#bfdbfe',
        backgroundColor: '#eff6ff',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#e5e7eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarSelected: {
        backgroundColor: '#3b82f6',
    },
    avatarText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    userName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#1f2937' },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#d1d5db',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxOn: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    footer: {
        padding: 20,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderColor: '#e5e7eb',
    },
    createBtn: {
        backgroundColor: '#3b82f6',
        flexDirection: 'row',
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    createBtnDisabled: {
        backgroundColor: '#9ca3af',
    },
    createBtnText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});
