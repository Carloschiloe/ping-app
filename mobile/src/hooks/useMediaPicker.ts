import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { uploadToSupabase } from '../lib/upload';

interface UseMediaPickerProps {
    onMediaSent: (text: string) => void;
    setSendingMedia: (sending: boolean) => void;
}

export function useMediaPicker({ onMediaSent, setSendingMedia }: UseMediaPickerProps) {
    const uploadAndSendMedia = async (asset: any) => {
        setSendingMedia(true);
        const isVideo = asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov');
        const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
        const url = await uploadToSupabase(asset.uri, 'chat-media', mimeType);
        setSendingMedia(false);
        if (url) {
            onMediaSent(`[${isVideo ? 'video' : 'imagen'}]${url}`);
        } else {
            Alert.alert('Error', 'No se pudo subir el archivo.');
        }
    };

    const openDocumentPicker = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            setSendingMedia(true);
            const url = await uploadToSupabase(asset.uri, 'chat-media', asset.mimeType || 'application/octet-stream', asset.name);
            setSendingMedia(false);

            if (url) {
                onMediaSent(`[document=${asset.name}]${url}`);
            } else {
                Alert.alert('Error', 'No se pudo subir el documento.');
            }
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
                { text: '📄 Documento (PDF, Word, Excel...)', onPress: () => openDocumentPicker() },
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
