// PING — VIDEO CAPTURE ROOT CAUSE (segunda causa raíz): expo-image-picker's
// Android CameraContract.kt maps mediaTypes to exactly ONE native MediaStore
// intent action (ACTION_IMAGE_CAPTURE or ACTION_VIDEO_CAPTURE). Requesting
// both ('images' + 'videos', i.e. the deprecated MediaTypeOptions.All)
// resolves to MediaTypes.ALL, whose toCameraIntentAction() `when` block falls
// to the `else` branch -> ACTION_IMAGE_CAPTURE. The native camera therefore
// never enters video-record mode on Android: no recording timer starts, and
// the returned asset is an honestly-classified photo (because that's what
// was actually captured), not a misclassification bug downstream.
// iOS's UIImagePickerController DOES support a combined mediaTypes array with
// a native in-sheet toggle, but the fix keeps ONE shared contract for both
// platforms: the camera mode is requested EXPLICITLY ('photo' | 'video') by
// the caller, never as a combined/deprecated MediaTypeOptions.All.
//
// PING — VIDEO UPLOAD + PRE-SEND PREVIEW (third root cause / UX contract):
// video assets (camera OR gallery) are now frozen into a canonical
// LocalMediaDraft and handed to onVideoDraft instead of uploading
// immediately — no upload/attachment/message write happens until the
// caller's preview explicitly calls sendMediaDraft(). Photo/document flows
// are unchanged and still send immediately.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Alert: { alert: vi.fn() },
}));

const requestCameraPermissionsAsync = vi.fn();
const requestMediaLibraryPermissionsAsync = vi.fn();
const launchCameraAsync = vi.fn();
const launchImageLibraryAsync = vi.fn();

vi.mock('expo-image-picker', () => ({
    requestCameraPermissionsAsync: (...args: unknown[]) => requestCameraPermissionsAsync(...args),
    requestMediaLibraryPermissionsAsync: (...args: unknown[]) => requestMediaLibraryPermissionsAsync(...args),
    launchCameraAsync: (...args: unknown[]) => launchCameraAsync(...args),
    launchImageLibraryAsync: (...args: unknown[]) => launchImageLibraryAsync(...args),
    MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}));

vi.mock('expo-document-picker', () => ({
    getDocumentAsync: vi.fn(),
}));

vi.mock('expo-image-manipulator', () => ({
    manipulateAsync: vi.fn().mockResolvedValue({ uri: 'file:///manipulated.jpg' }),
    SaveFormat: { JPEG: 'jpeg' },
}));

const uploadPrivateMessageAttachment = vi.fn();
vi.mock('../src/lib/privateFiles', () => ({
    uploadPrivateMessageAttachment: (...args: unknown[]) => uploadPrivateMessageAttachment(...args),
}));

import { useMediaPicker, LocalMediaDraft } from '../src/hooks/useMediaPicker';

describe('useMediaPicker — captura de cámara: contrato canónico foto/video', () => {
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();
    const onVideoDraft = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
        requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
        uploadPrivateMessageAttachment.mockResolvedValue({
            attachmentId: 'att-1',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
        });
    });

    function buildPicker() {
        return useMediaPicker({ conversationId: 'conv-1', onMediaSent, setSendingMedia, onVideoDraft });
    }

    it('1) lanzar modo foto solicita mediaTypes=["images"] únicamente (nunca combinado)', async () => {
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await openCamera('photo');

        expect(launchCameraAsync).toHaveBeenCalledWith(
            expect.objectContaining({ mediaTypes: ['images'] })
        );
    });

    it('2) lanzar modo video solicita mediaTypes=["videos"] únicamente — nunca la opción combinada/deprecada que colapsa a foto en Android', async () => {
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await openCamera('video');

        const callArgs = launchCameraAsync.mock.calls[0][0];
        expect(callArgs.mediaTypes).toEqual(['videos']);
        // Nunca debe volver a pedirse el contrato ambiguo que causó el bug original.
        expect(callArgs.mediaTypes).not.toBe('All');
        expect(Array.isArray(callArgs.mediaTypes) && callArgs.mediaTypes.length).toBe(1);
    });

    it('captura de foto permanece sin cambios: se procesa con manipulateAsync y se envía inmediatamente como imagen', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'image',
                uri: 'file:///photo.jpg',
                width: 800,
                height: 600,
                fileName: 'photo.jpg',
            }],
        });
        uploadPrivateMessageAttachment.mockResolvedValue({
            attachmentId: 'att-2',
            mimeType: 'image/jpeg',
            fileName: 'photo.jpg',
        });
        const { openCamera } = buildPicker();

        await openCamera('photo');

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'file:///manipulated.jpg',
            'image/jpeg',
            expect.stringMatching(/\.jpg$/)
        );
        expect(onMediaSent).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Imagen' })
        );
        expect(onVideoDraft).not.toHaveBeenCalled();
    });

    it('sin selección de modo, openCamera por defecto sigue siendo foto (compatibilidad de firma)', async () => {
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await openCamera();

        expect(launchCameraAsync).toHaveBeenCalledWith(
            expect.objectContaining({ mediaTypes: ['images'] })
        );
    });

    it('la galería (picker de librería, no cámara) conserva su contrato combinado foto+video existente', async () => {
        launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openGallery } = buildPicker();

        await openGallery();

        expect(launchImageLibraryAsync).toHaveBeenCalledWith(
            expect.objectContaining({ mediaTypes: 'All' })
        );
    });
});

describe('useMediaPicker — LocalMediaDraft canónico: cámara y galería alimentan el mismo pipeline', () => {
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();
    const onVideoDraft = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
        requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    });

    function buildPicker() {
        return useMediaPicker({ conversationId: 'conv-1', onMediaSent, setSendingMedia, onVideoDraft });
    }

    it('seleccionar/grabar un video crea un draft en vez de enviarlo de inmediato (cámara)', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'file:///var/mobile/clip.mov',
                mimeType: 'video/quicktime',
                fileName: 'clip.mov',
                duration: 4200,
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(onVideoDraft).toHaveBeenCalledWith({
            uri: 'file:///var/mobile/clip.mov',
            kind: 'video',
            mimeType: 'video/quicktime',
            fileName: 'clip.mov',
            size: undefined,
            durationMs: 4200,
        });
        // Ningún upload/mensaje debe dispararse todavía — cero side effects
        // hasta que el usuario confirme el envío desde el preview.
        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(onMediaSent).not.toHaveBeenCalled();
    });

    it('seleccionar un video de galería (Android content:// o file://) también crea el mismo draft canónico', async () => {
        launchImageLibraryAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'content://media/external/video/media/999',
                mimeType: 'video/mp4',
                fileName: 'VID_20260910.mp4',
                fileSize: 15_000_000,
                duration: 30000,
            }],
        });
        const { openGallery } = buildPicker();

        await openGallery();

        expect(onVideoDraft).toHaveBeenCalledWith({
            uri: 'content://media/external/video/media/999',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'VID_20260910.mp4',
            size: 15_000_000,
            durationMs: 30000,
        });
        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
    });

    it('camara y galeria alimentan el mismo draft con forma idéntica (sin lógica de negocio duplicada por fuente)', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///cam.mp4', mimeType: 'video/mp4', fileName: 'cam.mp4' }],
        });
        launchImageLibraryAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///gallery.mp4', mimeType: 'video/mp4', fileName: 'gallery.mp4' }],
        });
        const { openCamera, openGallery } = buildPicker();

        await openCamera('video');
        await openGallery();

        const [cameraDraft] = onVideoDraft.mock.calls[0];
        const [galleryDraft] = onVideoDraft.mock.calls[1];
        expect(Object.keys(cameraDraft).sort()).toEqual(Object.keys(galleryDraft).sort());
        expect(cameraDraft.kind).toBe('video');
        expect(galleryDraft.kind).toBe('video');
    });

    it('Cancel (nunca invocar sendMediaDraft) produce cero uploads/mensajes', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileName: 'clip.mp4' }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');
        // El caller (ChatScreen) simplemente descarta el draft sin llamar
        // sendMediaDraft — se simula no invocándolo.

        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(onMediaSent).not.toHaveBeenCalled();
        expect(setSendingMedia).not.toHaveBeenCalled();
    });

    it('Send (sendMediaDraft) dispara exactamente un intento de upload desde el draft congelado', async () => {
        uploadPrivateMessageAttachment.mockResolvedValue({
            attachmentId: 'att-video-1',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
            durationMs: 4200,
        });
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'file:///clip.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
            durationMs: 4200,
        };

        await sendMediaDraft(draft);

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledTimes(1);
        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'file:///clip.mp4',
            'video/mp4',
            'clip.mp4',
            4200
        );
        expect(onMediaSent).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Video' })
        );
    });

    it('recorded iOS MOV: draft preserva mimeType video/quicktime y filename .mov intactos hacia sendMediaDraft', async () => {
        uploadPrivateMessageAttachment.mockResolvedValue({ attachmentId: 'a', mimeType: 'video/quicktime', fileName: 'clip.mov' });
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'file:///var/mobile/Containers/Data/clip.mov',
            kind: 'video',
            mimeType: 'video/quicktime',
            fileName: 'clip.mov',
        };

        await sendMediaDraft(draft);

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'file:///var/mobile/Containers/Data/clip.mov',
            'video/quicktime',
            'clip.mov',
            undefined
        );
    });

    it('recorded/gallery Android MP4 vía content://: byte-level identidad de URI preservada hasta el upload', async () => {
        uploadPrivateMessageAttachment.mockResolvedValue({ attachmentId: 'a', mimeType: 'video/mp4', fileName: 'VID.mp4' });
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'content://com.android.providers.media.documents/document/video%3A123',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'VID.mp4',
        };

        await sendMediaDraft(draft);

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'content://com.android.providers.media.documents/document/video%3A123',
            'video/mp4',
            'VID.mp4',
            undefined
        );
    });

    it('un fallo de upload real (no genérico) se propaga como mensaje de error clasificado, no como alerta fija', async () => {
        const { Alert } = await import('react-native');
        uploadPrivateMessageAttachment.mockRejectedValue(
            new Error('No se pudo subir el archivo de forma segura: Payload too large')
        );
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'file:///big.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'big.mp4',
        };

        await sendMediaDraft(draft);

        expect(Alert.alert).toHaveBeenCalledWith(
            'No se pudo enviar',
            expect.stringContaining('Payload too large')
        );
    });

    it('imagen: el flujo directo (sin draft) permanece verde tras introducir el draft de video', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'image', uri: 'file:///photo.jpg', width: 800, height: 600, fileName: 'photo.jpg' }],
        });
        uploadPrivateMessageAttachment.mockResolvedValue({ attachmentId: 'a', mimeType: 'image/jpeg', fileName: 'photo.jpg' });
        const { openCamera } = buildPicker();

        await openCamera('photo');

        expect(onVideoDraft).not.toHaveBeenCalled();
        expect(uploadPrivateMessageAttachment).toHaveBeenCalledTimes(1);
        expect(onMediaSent).toHaveBeenCalledWith(expect.objectContaining({ text: 'Imagen' }));
    });
});
