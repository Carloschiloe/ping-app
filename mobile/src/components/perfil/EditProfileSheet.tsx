import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { getDisplayNameValidationError, normalizeDisplayName, normalizeOptionalPhone } from '../../utils/profile';
import { uploadPrivateProfileAvatar } from '../../lib/privateFiles';

import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';
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
                            paddingBottom: Math.max(insets.bottom, 24) + 12,
                        },
                    ]}
                >
                    <SheetFill />
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={[styles.cancelText, { color: colors.textSoft }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <Text style={[styles.title, { color: colors.text }]}>Editar Perfil</Text>
                        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accentBright} />
                            ) : (
                                <Text style={[styles.saveText, { color: colors.accentBright }]}>Guardar</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.avatarWrap}>
                        <TouchableOpacity onPress={handlePickImage} disabled={saving} style={styles.avatarContainer}>
                            {currentAvatarUri ? (
                                <Image source={{ uri: currentAvatarUri }} style={styles.avatarImage} />
                            ) : (
                                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent }]}>
                                    <Text style={styles.avatarText}>{initialLetter}</Text>
                                </View>
                            )}
                            <View style={[styles.cameraBadge, { backgroundColor: colors.accent, borderColor: colors.surfaceSolid }]}>
                                <Ionicons name="camera" size={14} color={colors.onAccent} />
                            </View>
                        </TouchableOpacity>
                        <Text style={[styles.editPhotoText, { color: colors.accentBright }]}>Cambiar foto</Text>
                    </View>

                    <View style={styles.form}>
                        <Text style={[styles.fieldLabel, { color: colors.textFaint }]}>NOMBRE COMPLETO</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.glassRaised, color: colors.text, borderColor: colors.glassBorder }]}
                            placeholder="Tu nombre real"
                            placeholderTextColor={colors.textFaint}
                            value={fullName}
                            onChangeText={setFullName}
                        />

                        <Text style={[styles.fieldLabel, { color: colors.textFaint, marginTop: 16 }]}>TELÉFONO</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: colors.glassRaised, color: colors.text, borderColor: colors.glassBorder }]}
                            placeholder="+56912345678"
                            placeholderTextColor={colors.textFaint}
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
        backgroundColor: colors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
        ...sheetSurface,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.glassRaised,
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
        fontFamily: fonts.bold,
    },
    cancelText: {
        fontSize: 16,
        fontFamily: fonts.regular,
    },
    saveText: {
        fontSize: 16,
        fontFamily: fonts.semibold,
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
        color: colors.onAccent,
        fontSize: 28,
        fontFamily: fonts.bold,
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
        fontFamily: fonts.semibold,
    },
    form: {
        marginBottom: 20,
    },
    fieldLabel: {
        fontSize: 11,
        fontFamily: fonts.bold,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: { fontFamily: fonts.regular,
        borderWidth: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        fontSize: 15,
    },
});
