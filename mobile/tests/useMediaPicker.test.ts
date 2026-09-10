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

import { useMediaPicker } from '../src/hooks/useMediaPicker';

describe('useMediaPicker — captura de cámara: contrato canónico foto/video', () => {
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();

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
        return useMediaPicker({ conversationId: 'conv-1', onMediaSent, setSendingMedia });
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

    it('3/4) el asset devuelto tras una captura de video real se clasifica como video, no como foto', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'file:///var/mobile/clip.mov',
                mimeType: 'video/quicktime',
                fileName: 'clip.mov',
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'file:///var/mobile/clip.mov',
            'video/quicktime',
            'clip.mov'
        );
        expect(onMediaSent).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Video' })
        );
    });

    it('5) Android MP4: MIME y filename del video capturado se preservan intactos hacia el pipeline de envío', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'content://media/external/video/media/999',
                mimeType: 'video/mp4',
                fileName: 'VID_20260910.mp4',
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'content://media/external/video/media/999',
            'video/mp4',
            'VID_20260910.mp4'
        );
    });

    it('captura de foto permanece sin cambios: se procesa con manipulateAsync y se envía como imagen', async () => {
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
