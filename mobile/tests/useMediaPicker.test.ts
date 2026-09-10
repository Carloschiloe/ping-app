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
// PING — CAMERA OPENS WITH CHAT KEYBOARD OVER IT: the canonical
// native-media launch boundary (openCamera/openGallery/openDocumentPicker)
// must blur the composer TextInput and wait for the real keyboardDidHide
// event (not a guessed delay) before presenting any native fullscreen
// surface. This mock Keyboard lets tests control exactly when that event
// fires, so the dismiss-and-wait contract can be proven deterministically.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const keyboardDismiss = vi.fn();
let keyboardDidHideListeners: Array<() => void> = [];
const keyboardAddListener = vi.fn((event: string, handler: () => void) => {
    if (event === 'keyboardDidHide') keyboardDidHideListeners.push(handler);
    return { remove: vi.fn(() => {
        keyboardDidHideListeners = keyboardDidHideListeners.filter((h) => h !== handler);
    }) };
});
function fireKeyboardDidHide() {
    [...keyboardDidHideListeners].forEach((handler) => handler());
}

vi.mock('react-native', () => ({
    Alert: { alert: vi.fn() },
    Keyboard: {
        dismiss: (...args: unknown[]) => keyboardDismiss(...args),
        addListener: (...args: [string, () => void]) => keyboardAddListener(...args),
    },
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

const getDocumentAsync = vi.fn();
vi.mock('expo-document-picker', () => ({
    getDocumentAsync: (...args: unknown[]) => getDocumentAsync(...args),
}));

vi.mock('expo-image-manipulator', () => ({
    manipulateAsync: vi.fn().mockResolvedValue({ uri: 'file:///manipulated.jpg' }),
    SaveFormat: { JPEG: 'jpeg' },
}));

const uploadPrivateMessageAttachment = vi.fn();
vi.mock('../src/lib/privateFiles', () => ({
    uploadPrivateMessageAttachment: (...args: unknown[]) => uploadPrivateMessageAttachment(...args),
}));

// Canonical size policy now comes ONLY from getAppConfig() (mobile/src/lib/
// appConfig.ts), never a locally-invented constant in useMediaPicker.ts —
// see the size-policy describe block below, which sets this mock's return
// value explicitly per test to prove the preflight actually consumes it
// (rather than a hardcoded number that happens to match).
const getAppConfig = vi.fn();
vi.mock('../src/lib/appConfig', () => ({
    getAppConfig: (...args: unknown[]) => getAppConfig(...args),
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
        // Some fixtures below set fileSize/size — the preflight only calls
        // getAppConfig() when a size is present, so a default resolved
        // value is needed here even though this block isn't testing the
        // size policy itself.
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 50 * 1024 * 1024 } });
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

        // durationMs NO forma parte del draft: el contrato duration_ms del
        // backend es exclusivo de audio (create_message_attachment_intent
        // rechaza cualquier duración en un adjunto no-audio con "Audio
        // duration is invalid", HTTP 400) — ver useMediaPicker.ts. asset.duration
        // (aquí 4200) debe ser ignorado, no reenviado.
        expect(onVideoDraft).toHaveBeenCalledWith({
            uri: 'file:///var/mobile/clip.mov',
            kind: 'video',
            mimeType: 'video/quicktime',
            fileName: 'clip.mov',
            size: undefined,
        });
        // Ningún upload/mensaje debe dispararse todavía — cero side effects
        // hasta que el usuario confirme el envío desde el preview.
        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(onMediaSent).not.toHaveBeenCalled();
    });

    it('seleccionar un video de galería (Android content:// o file://) también crea el mismo draft canónico, sin durationMs', async () => {
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

    it('Send (sendMediaDraft) dispara exactamente un intento de upload desde el draft congelado, sin durationMs (contrato audio-only del backend)', async () => {
        uploadPrivateMessageAttachment.mockResolvedValue({
            attachmentId: 'att-video-1',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
        });
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'file:///clip.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
        };

        await sendMediaDraft(draft);

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledTimes(1);
        // Exactamente 4 argumentos: uploadPrivateMessageAttachment nunca
        // recibe un 5º argumento (durationMs) para video — ese metadata es
        // audio-only en el backend (create_message_attachment_intent RPC) y
        // reenviarlo para video producía el HTTP 400 en
        // /attachments/upload-intents ("Audio duration is invalid").
        expect(uploadPrivateMessageAttachment).toHaveBeenCalledWith(
            'conv-1',
            'file:///clip.mp4',
            'video/mp4',
            'clip.mp4'
        );
        expect(uploadPrivateMessageAttachment.mock.calls[0]).toHaveLength(4);
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
            'clip.mov'
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
            'VID.mp4'
        );
    });

    it('un fallo real de upload muestra siempre el mensaje de dominio seguro al usuario, nunca el detalle interno crudo', async () => {
        const { Alert } = await import('react-native');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        uploadPrivateMessageAttachment.mockRejectedValue(
            new Error('No se pudo subir el archivo de forma segura.', { cause: { message: 'Payload too large', status: 413 } })
        );
        const { sendMediaDraft } = buildPicker();
        const draft: LocalMediaDraft = {
            uri: 'file:///big.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
            fileName: 'big.mp4',
        };

        await sendMediaDraft(draft);

        // UX: el usuario ve siempre el mismo mensaje de dominio seguro, no un
        // mensaje interno/backend arbitrario.
        expect(Alert.alert).toHaveBeenCalledWith(
            'No se pudo enviar',
            'El archivo no se subió. Inténtalo nuevamente.'
        );
        expect(Alert.alert).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Payload too large')
        );
        // Diagnóstico: el detalle real se preserva internamente (logged),
        // nunca perdido — solo no se le muestra al usuario.
        expect(warnSpy).toHaveBeenCalledWith(
            '[MediaPicker] Private upload failed',
            expect.objectContaining({ message: 'No se pudo subir el archivo de forma segura.' })
        );
        warnSpy.mockRestore();
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

describe('useMediaPicker — canonical size policy consumed from getAppConfig() (never a locally-invented constant)', () => {
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();
    const onVideoDraft = vi.fn();

    // Deliberately NOT the real 50MB — proves the preflight actually reads
    // whatever getAppConfig() returns, rather than happening to match a
    // hardcoded number baked into useMediaPicker.ts.
    const MOCK_MAX_BYTES = 10 * 1024 * 1024;

    beforeEach(() => {
        vi.clearAllMocks();
        requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
        requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: MOCK_MAX_BYTES } });
    });

    function buildPicker() {
        return useMediaPicker({ conversationId: 'conv-1', onMediaSent, setSendingMedia, onVideoDraft });
    }

    it('video con fileSize por encima del máximo devuelto por getAppConfig se rechaza ANTES de construir el draft o llamar a la red', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'file:///huge.mp4',
                mimeType: 'video/mp4',
                fileName: 'huge.mp4',
                fileSize: MOCK_MAX_BYTES + 1,
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(getAppConfig).toHaveBeenCalled();
        expect(onVideoDraft).not.toHaveBeenCalled();
        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
            'No se pudo enviar',
            expect.stringContaining('demasiado grande')
        );
    });

    it('el mensaje de rechazo refleja el número real devuelto por getAppConfig, en MB', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///huge.mp4', mimeType: 'video/mp4', fileName: 'huge.mp4', fileSize: MOCK_MAX_BYTES + 1 }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(Alert.alert).toHaveBeenCalledWith('No se pudo enviar', expect.stringContaining('10 MB'));
    });

    it('video de galería con fileSize por encima del máximo también se rechaza antes del draft', async () => {
        launchImageLibraryAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'content://media/external/video/media/999',
                mimeType: 'video/mp4',
                fileName: 'huge.mp4',
                fileSize: MOCK_MAX_BYTES + 1,
            }],
        });
        const { openGallery } = buildPicker();

        await openGallery();

        expect(onVideoDraft).not.toHaveBeenCalled();
    });

    it('video con fileSize justo bajo el máximo devuelto por getAppConfig crea el draft normalmente', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'file:///ok.mp4',
                mimeType: 'video/mp4',
                fileName: 'ok.mp4',
                fileSize: MOCK_MAX_BYTES - 1,
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(onVideoDraft).toHaveBeenCalledTimes(1);
    });

    it('cuando fileSize es desconocido (undefined), el preflight nunca bloquea ni consulta la red — el draft se crea igual', async () => {
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///unknown-size.mp4', mimeType: 'video/mp4', fileName: 'clip.mp4' }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(onVideoDraft).toHaveBeenCalledTimes(1);
        // No conocer el tamaño significa que no hay nada que comparar — el
        // preflight no necesita ni debe golpear la red sólo para descartar.
        expect(getAppConfig).not.toHaveBeenCalled();
    });

    it('imagen con fileSize por encima del máximo también se rechaza antes de subir', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'image', uri: 'file:///huge.jpg', width: 4000, height: 3000, fileSize: MOCK_MAX_BYTES + 1 }],
        });
        const { openCamera } = buildPicker();

        await openCamera('photo');

        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
            'No se pudo enviar',
            expect.stringContaining('demasiado grande')
        );
    });

    it('documento con size por encima del máximo se rechaza antes de subir, sin llamar a manipulateAsync/upload', async () => {
        const { Alert } = await import('react-native');
        getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [{ uri: 'file:///huge.pdf', mimeType: 'application/pdf', name: 'huge.pdf', size: MOCK_MAX_BYTES + 1 }],
        });
        const { openDocumentPicker } = buildPicker();

        await openDocumentPicker();

        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
            'No se pudo enviar',
            expect.stringContaining('demasiado grande')
        );
    });

    it('documento bajo el máximo se envía normalmente', async () => {
        getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [{ uri: 'file:///doc.pdf', mimeType: 'application/pdf', name: 'doc.pdf', size: 1024 }],
        });
        uploadPrivateMessageAttachment.mockResolvedValue({ attachmentId: 'a', mimeType: 'application/pdf', fileName: 'doc.pdf' });
        const { openDocumentPicker } = buildPicker();

        await openDocumentPicker();

        expect(uploadPrivateMessageAttachment).toHaveBeenCalledTimes(1);
    });

    it('un backend con política distinta (stale/desactualizado en mobile) no puede ser sobrepasado: si getAppConfig devuelve un límite MÁS BAJO que lo que el mobile cacheaba antes, el nuevo límite (más estricto) se respeta', async () => {
        // Simula que el backend bajó el límite real — mobile SIEMPRE re-lee
        // getAppConfig() en el momento del preflight (no confía en un valor
        // congelado), así que un límite más estricto se aplica de inmediato.
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 1024 } });
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileName: 'clip.mp4', fileSize: 2048 }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(onVideoDraft).not.toHaveBeenCalled();
    });

    it('política desconocida (maxMessageAttachmentBytes: null): el preflight NUNCA rechaza localmente, aunque el asset declare un tamaño enorme', async () => {
        // getAppConfig() puede legítimamente resolver a "unknown" (primera
        // consulta y backend inalcanzable) — appConfig.ts nunca inventa un
        // número en ese caso, y useMediaPicker.ts debe tratarlo igual que
        // "no bloquear": dejar pasar al draft/upload, donde el backend real
        // sigue siendo la autoridad final.
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: null } });
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{
                type: 'video',
                uri: 'file:///huge-but-unvalidatable.mp4',
                mimeType: 'video/mp4',
                fileName: 'huge.mp4',
                fileSize: 500 * 1024 * 1024, // 500MB — would be rejected under any real policy
            }],
        });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(onVideoDraft).toHaveBeenCalledTimes(1);
    });

    it('política desconocida NO puede evadir la aplicación real del backend: el envío igual llega a uploadPrivateMessageAttachment, donde el backend/Storage aplican el límite verdadero', async () => {
        // Este test certifica el contrato completo de "no bypass": una
        // política local desconocida sólo desactiva la validación LOCAL —
        // no desactiva ni omite la llamada real de subida, que es donde el
        // backend (completeMessageAttachment) y Storage (file_size_limit)
        // aplican el límite verdadero de forma independiente del cliente.
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: null } });
        uploadPrivateMessageAttachment.mockResolvedValue({ attachmentId: 'a', mimeType: 'video/mp4', fileName: 'clip.mp4' });
        launchCameraAsync.mockResolvedValue({
            canceled: false,
            assets: [{ type: 'video', uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileName: 'clip.mp4', fileSize: 500 * 1024 * 1024 }],
        });
        const { openCamera, sendMediaDraft } = buildPicker();

        await openCamera('video');
        const [draft] = onVideoDraft.mock.calls[0];
        await sendMediaDraft(draft);

        // El intento real de subida SÍ ocurrió — el backend real es quien
        // decide, no una validación local que no pudo evaluarse.
        expect(uploadPrivateMessageAttachment).toHaveBeenCalledTimes(1);
    });
});

describe('useMediaPicker — canonical native-media launch boundary: composer debe perder foco/cerrar teclado ANTES de cualquier superficie nativa', () => {
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();
    const onVideoDraft = vi.fn();
    const isComposerFocused = vi.fn();
    const blurComposer = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        keyboardDidHideListeners = [];
        requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
        requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 50 * 1024 * 1024 } });
    });

    afterEach(() => {
        keyboardDidHideListeners = [];
    });

    function buildPicker() {
        return useMediaPicker({
            conversationId: 'conv-1',
            onMediaSent,
            setSendingMedia,
            onVideoDraft,
            isComposerFocused,
            blurComposer,
        });
    }

    // (1) focused chat input → launch video camera → blur/dismiss occurs first
    it('composer enfocado + "Grabar video": blurComposer/Keyboard.dismiss ocurren ANTES de launchCameraAsync, y launchCameraAsync espera a keyboardDidHide', async () => {
        isComposerFocused.mockReturnValue(true);
        const callOrder: string[] = [];
        blurComposer.mockImplementation(() => callOrder.push('blur'));
        keyboardDismiss.mockImplementation(() => callOrder.push('dismiss'));
        launchCameraAsync.mockImplementation(async () => {
            callOrder.push('launchCameraAsync');
            return { canceled: true, assets: null };
        });

        const { openCamera } = buildPicker();
        const openPromise = openCamera('video');

        // launchCameraAsync no debe resolverse todavía: el hook está
        // esperando el evento real keyboardDidHide, no un timeout arbitrario.
        await Promise.resolve();
        await Promise.resolve();
        expect(callOrder).not.toContain('launchCameraAsync');
        expect(blurComposer).toHaveBeenCalled();
        expect(keyboardDismiss).toHaveBeenCalled();

        fireKeyboardDidHide();
        await openPromise;

        expect(callOrder.indexOf('blur')).toBeLessThan(callOrder.indexOf('launchCameraAsync'));
        expect(callOrder.indexOf('dismiss')).toBeLessThan(callOrder.indexOf('launchCameraAsync'));
    });

    // (2) focused chat input → launch photo camera → same contract
    it('composer enfocado + "Tomar foto": mismo contrato de blur/dismiss antes de launchCameraAsync', async () => {
        isComposerFocused.mockReturnValue(true);
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openCamera } = buildPicker();
        const openPromise = openCamera('photo');
        await Promise.resolve();
        expect(blurComposer).toHaveBeenCalled();
        fireKeyboardDidHide();
        await openPromise;

        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
    });

    // (3) focused chat input → gallery/document picker → same contract
    it('composer enfocado + galería: mismo contrato de blur/dismiss antes de launchImageLibraryAsync', async () => {
        isComposerFocused.mockReturnValue(true);
        launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openGallery } = buildPicker();
        const openPromise = openGallery();
        await Promise.resolve();
        expect(blurComposer).toHaveBeenCalled();
        fireKeyboardDidHide();
        await openPromise;

        expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    });

    it('composer enfocado + documento: mismo contrato de blur/dismiss antes de getDocumentAsync', async () => {
        isComposerFocused.mockReturnValue(true);
        getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openDocumentPicker } = buildPicker();
        const openPromise = openDocumentPicker();
        await Promise.resolve();
        expect(blurComposer).toHaveBeenCalled();
        fireKeyboardDidHide();
        await openPromise;

        expect(getDocumentAsync).toHaveBeenCalledTimes(1);
    });

    it('composer SIN foco: no se llama blurComposer/Keyboard.dismiss ni se espera — la superficie nativa se lanza de inmediato, sin demora artificial', async () => {
        isComposerFocused.mockReturnValue(false);
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openCamera } = buildPicker();
        await openCamera('video');

        expect(blurComposer).not.toHaveBeenCalled();
        expect(keyboardDismiss).not.toHaveBeenCalled();
        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
    });

    it('sin isComposerFocused/blurComposer conectados (caller no los provee): degrada a no-op, no rompe el flujo', async () => {
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const picker = useMediaPicker({
            conversationId: 'conv-1',
            onMediaSent,
            setSendingMedia,
            onVideoDraft,
        });

        await expect(picker.openCamera('video')).resolves.toBeUndefined();
        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
    });

    // (4) returning/cancelling picker does not leave composer broken
    it('cancelar la cámara tras el blur no dispara ningún upload ni dibuja el composer como roto (routeSelectedAsset nunca se llama)', async () => {
        isComposerFocused.mockReturnValue(true);
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openCamera } = buildPicker();
        const openPromise = openCamera('video');
        await Promise.resolve();
        fireKeyboardDidHide();
        await openPromise;

        expect(onVideoDraft).not.toHaveBeenCalled();
        expect(uploadPrivateMessageAttachment).not.toHaveBeenCalled();
        // blurComposer fue llamado exactamente una vez — no hay un segundo
        // blur/relanzamiento espurio tras la cancelación.
        expect(blurComposer).toHaveBeenCalledTimes(1);
    });

    it('si keyboardDidHide nunca llega (borde), el lanzamiento igual procede tras el timeout de seguridad — nunca cuelga para siempre', async () => {
        vi.useFakeTimers();
        isComposerFocused.mockReturnValue(true);
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

        const { openCamera } = buildPicker();
        const openPromise = openCamera('video');
        await vi.advanceTimersByTimeAsync(500); // > safety ceiling, sin fireKeyboardDidHide()
        await openPromise;

        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});

describe('useMediaPicker — CAMERA UI PHYSICALLY UNUSABLE (segunda causa raíz): el chooser ya no es una presentación nativa competidora', () => {
    // PING — CAMERA UI PHYSICALLY UNUSABLE: el diagnóstico físico (cámara
    // visible pero sin interacción, incluso el botón de cerrar nativo sin
    // respuesta) fue causado por Alert.alert (un UIAlertController nativo
    // real) cuyo onPress no garantiza haber terminado su propia transición
    // de dismissal antes de ejecutarse (ver Alert.js: "invoke the
    // respective onPress callback and dismiss the alert" — sin orden
    // garantizado) — expo-image-picker llama directamente a
    // UIViewController.present(), y iOS sólo permite una transición de
    // presentación/dismissal por ventana a la vez. La corrección: el
    // chooser (MediaSourceSheet.tsx, en ChatScreen.tsx) ya NO es
    // Alert.alert/Modal — es un overlay de React plano sin presentación
    // nativa propia, así que openCamera/openGallery/openDocumentPicker son
    // SIEMPRE la única presentación nativa en curso cuando se invocan.
    const onMediaSent = vi.fn();
    const setSendingMedia = vi.fn();
    const onVideoDraft = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        keyboardDidHideListeners = [];
        requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
        requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
        getAppConfig.mockResolvedValue({ limits: { maxMessageAttachmentBytes: 50 * 1024 * 1024 } });
    });

    function buildPicker() {
        return useMediaPicker({ conversationId: 'conv-1', onMediaSent, setSendingMedia, onVideoDraft });
    }

    it('useMediaPicker.ts fuente: pickMediaSource/Alert.alert ya no existen — el hook nunca presenta el chooser como Alert nativo', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'hooks', 'useMediaPicker.ts'),
            'utf-8'
        );

        expect(src).not.toContain('pickMediaSource');
        expect(src).not.toMatch(/Alert\.alert\(\s*['"]Enviar archivo/);
    });

    it('MediaSourceSheet.tsx: es un overlay de React plano — nunca usa Alert.alert ni <Modal> (import ni JSX)', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'components', 'MediaSourceSheet.tsx'),
            'utf-8'
        );
        const importLine = src.split('\n').find((line) => line.includes("from 'react-native'"));

        // Sólo se verifica el import real de react-native (no comentarios de
        // prosa, que sí mencionan "Alert.alert" al explicar por qué NO se usa).
        expect(importLine).toBeDefined();
        expect(importLine).not.toContain('Alert');
        expect(importLine).not.toContain('Modal');
        expect(importLine).toContain('View');
        expect(importLine).toContain('TouchableOpacity');
        expect(src).not.toMatch(/Alert\.alert\(/);
        expect(src).not.toMatch(/<Modal\b/);
    });

    // (A) diagnóstico: openCamera('video') invocado directamente — sin
    // chooser/Alert de por medio — ya funcionaba estructuralmente incluso
    // antes de este fix (nada en openCamera dependía de Alert). Se certifica
    // aquí como baseline explícito.
    it('(A) diagnóstico — invocación directa de openCamera("video") sin pasar por ningún chooser: no depende de Alert.alert en absoluto', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await openCamera('video');

        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    // (B) el patrón real: "cerrar el chooser (estado síncrono) → invocar
    // openCamera" — simulando exactamente lo que ChatScreen.tsx hace ahora
    // al seleccionar "Grabar video" en MediaSourceSheet. Ninguna llamada a
    // Alert.alert ocurre en ningún punto de esta secuencia — no hay una
    // segunda presentación nativa con la que competir.
    it('(B) patrón real del chooser: cerrar (estado síncrono) inmediatamente antes de invocar openCamera produce exactamente una presentación nativa, nunca dos', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        // Simula ChatScreen.tsx's selectVideo(): closeMediaSheet() (estado
        // síncrono, ninguna llamada nativa) seguido de openCamera('video').
        let sheetVisible = true;
        const closeMediaSheet = () => { sheetVisible = false; };
        const selectVideo = () => { closeMediaSheet(); return openCamera('video'); };

        await selectVideo();

        expect(sheetVisible).toBe(false);
        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('foto: mismo patrón (A) y (B) — sin Alert.alert', async () => {
        const { Alert } = await import('react-native');
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await openCamera('photo');

        expect(launchCameraAsync).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('galería/documento: el chooser real tampoco depende de Alert.alert para presentarse ni para cerrarse', async () => {
        const { Alert } = await import('react-native');
        launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
        getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openGallery, openDocumentPicker } = buildPicker();

        await openGallery();
        await openDocumentPicker();

        expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
        expect(getDocumentAsync).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('volver/cancelar desde la cámara deja al composer utilizable: openCamera resuelve limpiamente sin dejar ningún estado de chooser pendiente', async () => {
        launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
        const { openCamera } = buildPicker();

        await expect(openCamera('video')).resolves.toBeUndefined();
        // Una segunda invocación inmediata funciona igual de limpio — no
        // quedó ningún candado/estado de presentación colgado.
        await expect(openCamera('video')).resolves.toBeUndefined();
        expect(launchCameraAsync).toHaveBeenCalledTimes(2);
    });
});
