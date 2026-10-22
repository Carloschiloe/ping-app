import { beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadFileAsync, deleteFile, base64, isAvailableAsync, shareAsync, setImageAsync, requestDirectoryPermissionsAsync, createFileAsync, copyAsync } = vi.hoisted(() => ({
    downloadFileAsync: vi.fn(),
    deleteFile: vi.fn(),
    base64: vi.fn(),
    isAvailableAsync: vi.fn(),
    shareAsync: vi.fn(),
    setImageAsync: vi.fn(),
    requestDirectoryPermissionsAsync: vi.fn(),
    createFileAsync: vi.fn(),
    copyAsync: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
    Paths: { cache: { uri: 'file:///cache' } },
    File: class MockFile {
        static downloadFileAsync = downloadFileAsync;
        readonly uri: string;

        constructor(...parts: ({ uri: string } | string)[]) {
            this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
        }

        delete() {
            deleteFile(this.uri);
        }

        base64() {
            return base64();
        }
    },
}));

vi.mock('expo-sharing', () => ({
    isAvailableAsync,
    shareAsync,
}));

vi.mock('expo-file-system/legacy', () => ({
    StorageAccessFramework: {
        requestDirectoryPermissionsAsync,
        createFileAsync,
        copyAsync,
    },
}));

vi.mock('expo-clipboard', () => ({
    setImageAsync,
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

import {
    classifyAttachmentMime,
    cleanupTemporaryAttachment,
    copyAttachmentImageAsync,
    createSafeAttachmentFileName,
    createTemporaryAttachmentAsync,
    prepareAttachmentForGalleryAsync,
    saveAttachmentToDeviceAsync,
    saveAttachmentToGalleryAsync,
    shareAttachmentAsync,
} from '../src/utils/attachmentActions';

const SIGNED_URL = 'https://files.example.test/private/photo.jpg?token=secret-token';

beforeEach(() => {
    vi.clearAllMocks();
    downloadFileAsync.mockImplementation(async (_url: string, destination: { uri: string }) => ({
        uri: destination.uri,
    }));
    base64.mockResolvedValue('base64-image-bytes');
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
    setImageAsync.mockResolvedValue(undefined);
    requestDirectoryPermissionsAsync.mockResolvedValue({ granted: false });
    createFileAsync.mockResolvedValue('content://destination/file');
    copyAsync.mockResolvedValue(undefined);
});

describe('attachmentActions', () => {
    it('clasifica MIME ignorando mayúsculas y parámetros', () => {
        expect(classifyAttachmentMime('IMAGE/JPEG; charset=binary')).toBe('image');
        expect(classifyAttachmentMime('video/mp4')).toBe('video');
        expect(classifyAttachmentMime('audio/mpeg')).toBe('audio');
        expect(classifyAttachmentMime('application/pdf')).toBe('document');
        expect(classifyAttachmentMime('application/octet-stream')).toBe('unknown');
        expect(classifyAttachmentMime(undefined)).toBe('unknown');
    });

    it('sanitiza rutas, controles, nombres reservados y agrega extensión conocida', () => {
        expect(createSafeAttachmentFileName('CON?.jpg', 'image/jpeg')).toBe('attachment-CON-.jpg');
        expect(createSafeAttachmentFileName('../photo.jpg', 'image/jpeg')).toBe('photo.jpg');
        expect(createSafeAttachmentFileName('holiday photo', 'image/jpeg')).toBe('holiday photo.jpg');
        expect(createSafeAttachmentFileName('...', 'video/mp4')).toBe('attachment.mp4');
        expect(createSafeAttachmentFileName('a'.repeat(300) + '.mp4', 'video/mp4')).toHaveLength(120);
    });

    it('descarga a cache usando File.downloadFileAsync y no devuelve la URL firmada', async () => {
        const result = await createTemporaryAttachmentAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'image/jpeg',
            fileName: '../photo.jpg',
        });

        expect(downloadFileAsync).toHaveBeenCalledWith(
            SIGNED_URL,
            expect.objectContaining({ uri: expect.stringMatching(/^file:\/\/\/cache\/ping-attachment-/) }),
            expect.objectContaining({ idempotent: false }),
        );
        expect(result).toMatchObject({ fileName: 'photo.jpg', mimeType: 'image/jpeg', kind: 'image' });
        expect(result.localUri).not.toContain('secret-token');
    });

    it('convierte fallos de red en un error seguro y limpia el destino parcial', async () => {
        downloadFileAsync.mockRejectedValue(new Error(`request failed: ${SIGNED_URL}`));

        const promise = createTemporaryAttachmentAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
        });

        await expect(promise).rejects.toMatchObject({
            code: 'download_failed',
        });
        await expect(promise).rejects.not.toThrow('secret-token');
        expect(deleteFile).toHaveBeenCalled();
    });

    it('comparte el archivo local y limpia por defecto', async () => {
        await shareAttachmentAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'image/png',
            fileName: 'photo.png',
        });

        expect(shareAsync).toHaveBeenCalledWith(
            expect.stringMatching(/^file:\/\/\/cache\/ping-attachment-/),
            { mimeType: 'image/png' },
        );
        expect(deleteFile).toHaveBeenCalled();
    });

    it('permite conservar el temporal cuando cleanup es false', async () => {
        await shareAttachmentAsync(
            { signedUrl: SIGNED_URL, mimeType: 'video/mp4', fileName: 'clip.mp4' },
            { cleanup: false },
        );

        expect(deleteFile).not.toHaveBeenCalled();
    });

    it('usa el flujo de archivos del sistema para guardar documentos', async () => {
        await saveAttachmentToDeviceAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'application/pdf',
            fileName: 'contrato.pdf',
        });

        // Vitest runs with a non-Android platform, so the portable fallback
        // is the system share sheet and not a gallery-only adapter.
        expect(shareAsync).toHaveBeenCalledWith(
            expect.stringMatching(/^file:\/\/\/cache\/ping-attachment-/),
            { mimeType: 'application/pdf', dialogTitle: 'Guardar archivo' },
        );
        expect(deleteFile).toHaveBeenCalled();
    });

    it('copia la imagen usando los bytes base64 del archivo local y limpia por defecto', async () => {
        await copyAttachmentImageAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'image/jpeg',
            fileName: 'photo.jpg',
        });

        expect(base64).toHaveBeenCalled();
        expect(setImageAsync).toHaveBeenCalledWith('base64-image-bytes');
        expect(setImageAsync.mock.calls[0][0]).not.toContain('secret-token');
        expect(deleteFile).toHaveBeenCalled();
    });

    it('rechaza videos y convierte fallos del portapapeles en errores seguros', async () => {
        await expect(copyAttachmentImageAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'video/mp4',
            fileName: 'clip.mp4',
        })).rejects.toMatchObject({ code: 'clipboard_unsupported_type' });
        expect(downloadFileAsync).not.toHaveBeenCalled();

        setImageAsync.mockRejectedValue(new Error(`clipboard failed for ${SIGNED_URL}`));
        const promise = copyAttachmentImageAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'image/png',
            fileName: 'photo.png',
        });
        await expect(promise).rejects.toMatchObject({ code: 'clipboard_failed' });
        await expect(promise).rejects.not.toThrow('secret-token');
    });

    it('prepara galería solo para imagen/video y el adaptador no recibe signedUrl', async () => {
        const adapter = { saveLocalFileAsync: vi.fn().mockResolvedValue(undefined) };

        await saveAttachmentToGalleryAsync(
            { signedUrl: SIGNED_URL, mimeType: 'video/mp4', fileName: 'clip.mp4' },
            adapter,
        );

        expect(adapter.saveLocalFileAsync).toHaveBeenCalledWith(expect.objectContaining({
            mimeType: 'video/mp4',
            kind: 'video',
            localUri: expect.stringMatching(/^file:\/\/\/cache\/ping-attachment-/),
        }));
        expect(adapter.saveLocalFileAsync.mock.calls[0][0]).not.toHaveProperty('signedUrl');
        expect(deleteFile).toHaveBeenCalled();
    });

    it('rechaza documentos antes de descargar y expone la preparación segura para el integrador', async () => {
        const adapter = { saveLocalFileAsync: vi.fn() };

        await expect(saveAttachmentToGalleryAsync(
            { signedUrl: SIGNED_URL, mimeType: 'application/pdf', fileName: 'doc.pdf' },
            adapter,
        )).rejects.toMatchObject({ code: 'gallery_unsupported_type' });
        expect(downloadFileAsync).not.toHaveBeenCalled();

        const prepared = await prepareAttachmentForGalleryAsync({
            signedUrl: SIGNED_URL,
            mimeType: 'image/jpeg',
            fileName: 'photo.jpg',
        });
        cleanupTemporaryAttachment(prepared);
        expect(deleteFile).toHaveBeenCalled();
    });
});
