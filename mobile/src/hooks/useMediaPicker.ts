import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';
import {
    PrivateMessageAttachment,
    uploadPrivateMessageAttachment,
} from '../lib/privateFiles';

interface UseMediaPickerProps {
    conversationId: string;
    onMediaSent: (payload: { text: string; attachment: PrivateMessageAttachment }) => void;
    setSendingMedia: (sending: boolean) => void;
}

export function useMediaPicker({ conversationId, onMediaSent, setSendingMedia }: UseMediaPickerProps) {
    const prepareImage = async (asset: any) => {
        const longestSide = Math.max(Number(asset.width || 0), Number(asset.height || 0));
        const resize = longestSide > 1920
            ? (Number(asset.width || 0) >= Number(asset.height || 0)
                ? { width: 1920 }
                : { height: 1920 })
            : null;
        const result = await manipulateAsync(
            asset.uri,
            resize ? [{ resize }] : [],
            { compress: 0.82, format: SaveFormat.JPEG }
        );
        return {
            uri: result.uri,
            mimeType: 'image/jpeg',
            fileName: `${(asset.fileName || asset.name || 'imagen').replace(/\.[^.]+$/, '')}.jpg`,
        };
    };

    const uploadAndSendMedia = async (asset: any) => {
        setSendingMedia(true);
        try {
            const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov');
            const prepared = isVideo
                ? {
                    uri: asset.uri,
                    mimeType: asset.mimeType || 'video/mp4',
                    fileName: asset.fileName || 'video.mp4',
                }
                : await prepareImage(asset);
            const attachment = await uploadPrivateMessageAttachment(
                conversationId,
                prepared.uri,
                prepared.mimeType,
                prepared.fileName
            );
            onMediaSent({
                text: isVideo ? 'Video' : 'Imagen',
                attachment,
            });
        } catch (error) {
            console.warn('[MediaPicker] Private upload failed', {
                message: error instanceof Error ? error.message : 'unknown',
            });
            Alert.alert('No se pudo enviar', 'El archivo no se subió. Inténtalo nuevamente.');
        } finally {
            setSendingMedia(false);
        }
    };

    const openDocumentPicker = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*', 'video/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            setSendingMedia(true);
            const prepared = asset.mimeType?.startsWith('image/')
                ? await prepareImage(asset)
                : {
                    uri: asset.uri,
                    mimeType: asset.mimeType || 'application/pdf',
                    fileName: asset.name,
                };
            const attachment = await uploadPrivateMessageAttachment(
                conversationId,
                prepared.uri,
                prepared.mimeType,
                prepared.fileName
            );
            onMediaSent({ text: prepared.fileName, attachment });
            setSendingMedia(false);
        } catch (err) {
            setSendingMedia(false);
            console.error('[MediaPicker] Document selection failed', err);
            Alert.alert('Error', 'Hubo un problema al seleccionar el documento.');
        }
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendMedia(result.assets[0]);
    };

    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All,
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await uploadAndSendMedia(result.assets[0]);
    };

    const pickMediaSource = () => {
        Alert.alert(
            'Enviar archivo',
            '¿Qué quieres enviar?',
            [
                { text: '📷 Cámara (Foto o Video)', onPress: () => openCamera() },
                { text: '🖼️ Galería (Foto o Video)', onPress: () => openGallery() },
                { text: '📄 Documento PDF', onPress: () => openDocumentPicker() },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    return {
        pickMediaSource,
        openCamera,
        openGallery,
        openDocumentPicker
    };
}
