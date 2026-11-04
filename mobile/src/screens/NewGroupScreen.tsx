import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { CachedImage } from '../design/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUserSearch, useCreateGroup } from '../api/queries';
import { uploadToSupabase } from '../lib/upload';
import { colors, gradients, radius, space } from '../design/tokens';
import { fonts, type } from '../design/typography';
import { Glass } from '../design/Glass';
import { ScreenHeader, avatarGradient } from '../design/ScreenHeader';

export default function NewGroupScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();
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
            mediaTypes: ['images'],
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
    const busy = isCreating || isUploading;
    const canCreate = selectedIds.length > 0 && !!name.trim() && !busy;

    return (
        <View style={styles.container}>
            <ScreenHeader title="Nuevo grupo" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.headerSection}>
                    <View style={styles.groupHeaderRow}>
                        <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn} accessibilityLabel="Elegir foto del grupo">
                            {avatarUri ? (
                                <CachedImage uri={avatarUri} style={styles.groupImagePreview} />
                            ) : (
                                <View style={styles.imagePickerPlaceholder}>
                                    <Ionicons name="camera" size={24} color={colors.accentBright} />
                                </View>
                            )}
                        </TouchableOpacity>

                        <View style={styles.groupNameContainer}>
                            <Text style={styles.label}>NOMBRE DEL GRUPO</Text>
                            <Glass style={styles.field} intensity={40}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej: Mantenimiento..."
                                    placeholderTextColor={colors.textFaint}
                                    selectionColor={colors.accent}
                                    value={name}
                                    onChangeText={setName}
                                />
                            </Glass>
                        </View>
                    </View>

                    <Text style={[styles.label, styles.inviteLabel]}>INVITAR A</Text>
                    <Glass style={[styles.field, styles.searchContainer]} intensity={40}>
                        <Ionicons name="search" size={17} color={colors.textFaint} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar por correo electrónico..."
                            placeholderTextColor={colors.textFaint}
                            selectionColor={colors.accent}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </Glass>
                </View>

                {isSearching ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={colors.accentBright} />
                    </View>
                ) : (
                    <FlatList
                        data={users}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContainer}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            searchQuery.length >= 2 ? (
                                <Text style={styles.emptyText}>No se encontraron usuarios</Text>
                            ) : null
                        }
                        renderItem={({ item, index }) => {
                            const isSelected = selectedIds.includes(item.id);
                            const first = index === 0;
                            const last = index === users.length - 1;
                            return (
                                <View style={[first && styles.bandFirst, last && styles.bandLast]}>
                                    <Glass style={[StyleSheet.absoluteFill, styles.bandGlass]} intensity={22} tint={isSelected ? colors.accentTint : colors.glassTintLight} />
                                    <TouchableOpacity
                                        style={styles.userRow}
                                        onPress={() => handleToggleSelect(item.id)}
                                        accessibilityState={{ selected: isSelected }}
                                    >
                                        <LinearGradient colors={avatarGradient(item.email)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                                            <Text style={styles.avatarText}>
                                                {item.email.substring(0, 2).toUpperCase()}
                                            </Text>
                                        </LinearGradient>
                                        <Text style={styles.userName} numberOfLines={1}>{item.email}</Text>
                                        <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                                            {isSelected && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                                        </View>
                                    </TouchableOpacity>
                                    {!last && <View pointerEvents="none" style={styles.bandSeparator} />}
                                </View>
                            );
                        }}
                    />
                )}

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
                    <TouchableOpacity
                        style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
                        onPress={handleCreateGroup}
                        disabled={!canCreate}
                        activeOpacity={0.85}
                    >
                        {canCreate && <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                        {busy ? (
                            <ActivityIndicator size="small" color={colors.onAccent} />
                        ) : (
                            <>
                                <Ionicons name="people" size={20} color={canCreate ? colors.onAccent : colors.textFaint} />
                                <Text style={[styles.createBtnText, !canCreate && styles.createBtnTextDisabled]}>
                                    Crear Grupo ({selectedIds.length + 1})
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    headerSection: { padding: space.xl, paddingBottom: space.lg },
    label: { ...type.overline, marginBottom: space.sm },
    inviteLabel: { marginTop: space.xl },
    groupHeaderRow: { flexDirection: 'row', alignItems: 'flex-end' },
    imagePickerBtn: { marginRight: space.lg },
    imagePickerPlaceholder: {
        width: 64,
        height: 64,
        borderRadius: radius.lg,
        backgroundColor: colors.accentTint,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.accentBright,
        borderStyle: 'dashed',
    },
    groupImagePreview: { width: 64, height: 64, borderRadius: radius.lg },
    groupNameContainer: { flex: 1 },
    field: { borderRadius: radius.md, height: 46, justifyContent: 'center' },
    input: { fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingHorizontal: 14 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    listContainer: { paddingBottom: space.lg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { ...type.subhead, textAlign: 'center', marginTop: space.xxl },
    bandGlass: { borderWidth: 0 },
    bandFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
    bandLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder },
    bandSeparator: { position: 'absolute', left: 78, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: space.xl,
        paddingVertical: space.md,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    avatarText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.silver },
    userName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.textFaint,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    footer: { paddingHorizontal: space.xl, paddingTop: space.md },
    createBtn: {
        flexDirection: 'row',
        height: 52,
        borderRadius: radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        gap: space.sm,
        overflow: 'hidden',
    },
    createBtnDisabled: {
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    createBtnText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
    createBtnTextDisabled: { color: colors.textFaint },
});
