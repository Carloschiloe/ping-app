import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAppTheme } from '../../theme/ThemeContext';
import { getDisplayNameValidationError, normalizeDisplayName, normalizeOptionalPhone } from '../../utils/profile';
import { uploadPrivateProfileAvatar } from '../../lib/privateFiles';

interface EditProfileSheetProps {
    visible: boolean;
    onClose: () => void;
    user: any;
    initialFullName: string;
    initialPhone: string;
    initialAvatarUrl: string | null;
    onSaveProfile: (fullName: string, phone: string) => Promise<void>;
    onSaveAvatar: (signedUrl: string) => Promise<void>;
}

export function EditProfileSheet({
    visible,
    onClose,
    user,
    initialFullName,
    initialPhone,
    initialAvatarUrl,
    onSaveProfile,
    onSaveAvatar,
}: EditProfileSheetProps) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [fullName, setFullName] = useState(initialFullName);
    const [phone, setPhone] = useState(initialPhone);
    const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
    const [pendingAvatar, setPendingAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setFullName(initialFullName);
            setPhone(initialPhone);
            setAvatarUrl(initialAvatarUrl);
            setPendingAvatar(null);
            setSaving(false);
        }
    }, [visible, initialFullName, initialPhone, initialAvatarUrl]);

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
        });

        if (!result.canceled && result.assets[0].uri) {
            const asset = result.assets[0];
            if (asset.fileSize && asset.fileSize > 25 * 1024 * 1024) {
                Alert.alert('Imagen demasiado grande', 'Elige una imagen de hasta 25 MB.');
                return;
            }
            setPendingAvatar(asset);
        }
    };

    const handleSave = async () => {
        const normalizedName = normalizeDisplayName(fullName);
        const validationError = getDisplayNameValidationError(normalizedName);
        if (validationError) {
            Alert.alert('Revisa tu nombre', validationError);
            return;
        }

        setSaving(true);
        try {
            // First save avatar if changed
            if (pendingAvatar && user) {
                const width = pendingAvatar.width || 1;
                const height = pendingAvatar.height || 1;
                const squareSize = Math.min(width, height);
                const prepared = await ImageManipulator.manipulateAsync(
                    pendingAvatar.uri,
                    [
                        {
                            crop: {
                                originX: Math.max(0, Math.floor((width - squareSize) / 2)),
                                originY: Math.max(0, Math.floor((height - squareSize) / 2)),
                                width: squareSize,
                                height: squareSize,
                            },
                        },
                        { resize: { width: 1024, height: 1024 } },
                    ],
                    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
                );
                const uploadResult = await uploadPrivateProfileAvatar(user.id, prepared.uri, 'image/jpeg');
                if (uploadResult && uploadResult.signedUrl) {
                    await onSaveAvatar(uploadResult.signedUrl);
                }
            }

            // Then save text data
            await onSaveProfile(normalizedName, normalizeOptionalPhone(phone) || '');
            onClose();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo actualizar el perfil');
        } finally {
            setSaving(false);
        }
    };

    const currentAvatarUri = pendingAvatar ? pendingAvatar.uri : avatarUrl;
    const initialLetter = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            paddingBottom: Math.max(insets.bottom, 24) + 12,
                        },
                    ]}
                >
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={[styles.cancelText, { color: theme.colors.text.secondary }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Editar Perfil</Text>
                        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            {saving ? (
                                <ActivityIndicator size="small" color={theme.colors.accent} />
                            ) : (
                                <Text style={[styles.saveText, { color: theme.colors.accent }]}>Guardar</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.avatarWrap}>
                        <TouchableOpacity onPress={handlePickImage} disabled={saving} style={styles.avatarContainer}>
                            {currentAvatarUri ? (
                                <Image source={{ uri: currentAvatarUri }} style={styles.avatarImage} />
                            ) : (
                                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.colors.accent }]}>
                                    <Text style={styles.avatarText}>{initialLetter}</Text>
                                </View>
                            )}
                            <View style={[styles.cameraBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }]}>
                                <Ionicons name="camera" size={14} color="white" />
                            </View>
                        </TouchableOpacity>
                        <Text style={[styles.editPhotoText, { color: theme.colors.accent }]}>Cambiar foto</Text>
                    </View>

                    <View style={styles.form}>
                        <Text style={[styles.fieldLabel, { color: theme.colors.text.muted }]}>NOMBRE COMPLETO</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.text.primary, borderColor: theme.colors.separator }]}
                            placeholder="Tu nombre real"
                            placeholderTextColor={theme.colors.text.muted}
                            value={fullName}
                            onChangeText={setFullName}
                        />

                        <Text style={[styles.fieldLabel, { color: theme.colors.text.muted, marginTop: 16 }]}>TELÉFONO</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.text.primary, borderColor: theme.colors.separator }]}
                            placeholder="+56912345678"
                            placeholderTextColor={theme.colors.text.muted}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                        />
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '400',
    },
    saveText: {
        fontSize: 16,
        fontWeight: '600',
    },
    avatarWrap: {
        alignItems: 'center',
        marginBottom: 24,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        marginBottom: 10,
        position: 'relative',
    },
    avatarImage: {
        width: 80,
        height: 80,
        borderRadius: 40,
    },
    avatarPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: 'white',
        fontSize: 28,
        fontWeight: '700',
    },
    cameraBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    editPhotoText: {
        fontSize: 13,
        fontWeight: '600',
    },
    form: {
        marginBottom: 20,
    },
    fieldLabel: {
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        borderWidth: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        fontSize: 15,
    },
});
