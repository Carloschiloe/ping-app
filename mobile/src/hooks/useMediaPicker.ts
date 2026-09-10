import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert } from 'react-native';
import {
    PrivateMessageAttachment,
    uploadPrivateMessageAttachment,
} from '../lib/privateFiles';

// Canonical cross-platform draft for a locally selected/captured media asset,
// frozen before any upload/attachment/message side effect. One shape for
// camera capture and gallery selection — no separate business logic per
// source. `kind` drives presentation (only 'video' is currently gated
// behind a pre-send preview); `size`/`durationMs` are best-effort, since not
// every picker/provider populates them.
export type LocalMediaDraft = {
    uri: string;
    kind: 'image' | 'video';
    mimeType: string;
    fileName: string;
    size?: number;
    durationMs?: number;
};

function isVideoAsset(asset: any): boolean {
    return asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov');
}

function buildDraftFromAsset(asset: any): LocalMediaDraft {
    const isVideo = isVideoAsset(asset);
    return {
        uri: asset.uri,
        kind: isVideo ? 'video' : 'image',
        mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileName: asset.fileName || (isVideo ? 'video.mp4' : 'imagen.jpg'),
        size: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
        durationMs: typeof asset.duration === 'number' ? asset.duration : undefined,
    };
}

interface UseMediaPickerProps {
    conversationId: string;
    onMediaSent: (payload: { text: string; attachment: PrivateMessageAttachment }) => void;
    setSendingMedia: (sending: boolean) => void;
    // Video assets are frozen into a LocalMediaDraft and handed here instead
    // of being uploaded immediately, so the caller can show an in-app
    // preview (Play/Send/Cancel) before any attachment/upload/message write
    // happens. Photo/document flows are unaffected and continue to send
    // immediately, per existing product behavior.
    onVideoDraft: (draft: LocalMediaDraft) => void;
}

export function useMediaPicker({ conversationId, onMediaSent, setSendingMedia, onVideoDraft }: UseMediaPickerProps) {
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
            const isVideo = isVideoAsset(asset);
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
            // The underlying failure (empty local read, Supabase Storage
            // rejection, or backend size-cap rejection) is already logged with
            // safe diagnostics (URI scheme, mimeType, byte length, HTTP
            // status/error code — never tokens/signed URLs/bytes) inside
            // privateFiles.ts. Surfacing error.message here (instead of a
            // fixed generic string) is what makes that real, classified
            // failure visible to the user/QA instead of masking every distinct
            // cause behind one identical alert.
            const message = error instanceof Error ? error.message : 'unknown';
            console.warn('[MediaPicker] Private upload failed', { message });
            Alert.alert('No se pudo enviar', message || 'El archivo no se subió. Inténtalo nuevamente.');
        } finally {
            setSendingMedia(false);
        }
    };

    // Send action from the canonical pre-send preview: the draft was already
    // frozen at selection/capture time (buildDraftFromAsset) and previewed by
    // the caller; this is the single point where a video draft enters the
    // attachment/upload/message pipeline — exactly one upload attempt.
    const sendMediaDraft = async (draft: LocalMediaDraft) => {
        setSendingMedia(true);
        try {
            const attachment = await uploadPrivateMessageAttachment(
                conversationId,
                draft.uri,
                draft.mimeType,
                draft.fileName,
                draft.durationMs
            );
            onMediaSent({
                text: draft.kind === 'video' ? 'Video' : 'Imagen',
                attachment,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown';
            console.warn('[MediaPicker] Private upload failed', { message });
            Alert.alert('No se pudo enviar', message || 'El archivo no se subió. Inténtalo nuevamente.');
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

    // Single shared routing decision for every picker/camera source: video
    // assets are frozen into a LocalMediaDraft and handed to the caller for
    // pre-send preview (no upload yet); everything else keeps sending
    // immediately, unchanged. Camera and gallery both call this — no
    // duplicated per-source business logic.
    const routeSelectedAsset = async (asset: any) => {
        if (isVideoAsset(asset)) {
            onVideoDraft(buildDraftFromAsset(asset));
            return;
        }
        await uploadAndSendMedia(asset);
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
        await routeSelectedAsset(result.assets[0]);
    };

    // Canonical camera capture contract: the mode requested by the user MUST be
    // passed explicitly as a single mediaTypes entry, never as a combined
    // ['images', 'videos']/MediaTypeOptions.All request. This is a proven native
    // contract difference, not a style choice:
    // - Android's native camera launch (expo-image-picker's CameraContract.kt)
    //   maps mediaTypes to exactly ONE MediaStore intent action
    //   (ACTION_IMAGE_CAPTURE or ACTION_VIDEO_CAPTURE). When both image and video
    //   are requested, its own resolution rule collapses to ACTION_IMAGE_CAPTURE
    //   ("ALL" falls through to the `else` branch of that intent-action `when`),
    //   so the camera never enters video-record mode, no recording timer ever
    //   starts, and the returned asset is honestly classified as an image
    //   (because it genuinely IS one) — never actually a capture bug on the
    //   classification side.
    // - iOS's UIImagePickerController DOES support a combined mediaTypes array
    //   with a native in-sheet toggle, but requesting a single explicit type
    //   here still launches directly into the correct mode with no extra tap,
    //   and keeps both platforms on one shared call shape — no Platform.OS
    //   branch needed.
    const openCamera = async (mode: 'photo' | 'video' = 'photo') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: mode === 'video' ? ['videos'] : ['images'],
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await routeSelectedAsset(result.assets[0]);
    };

    const pickMediaSource = () => {
        Alert.alert(
            'Enviar archivo',
            '¿Qué quieres enviar?',
            [
                { text: '📷 Tomar foto', onPress: () => openCamera('photo') },
                { text: '🎥 Grabar video', onPress: () => openCamera('video') },
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
        openDocumentPicker,
        sendMediaDraft,
    };
}
