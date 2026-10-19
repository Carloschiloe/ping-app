import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { setImageAsync } from 'expo-clipboard';
import { isAvailableAsync, shareAsync, type SharingOptions } from 'expo-sharing';
import { Platform } from 'react-native';

export type AttachmentMimeKind = 'image' | 'video' | 'audio' | 'document' | 'unknown';

export type AttachmentActionErrorCode =
    | 'invalid_url'
    | 'aborted'
    | 'download_failed'
    | 'sharing_unavailable'
    | 'sharing_failed'
    | 'gallery_adapter_missing'
    | 'gallery_unsupported_type'
    | 'gallery_save_failed'
    | 'save_cancelled'
    | 'save_failed'
    | 'clipboard_unsupported_type'
    | 'clipboard_failed';

export class AttachmentActionError extends Error {
    readonly code: AttachmentActionErrorCode;

    constructor(code: AttachmentActionErrorCode, message: string) {
        super(message);
        this.name = 'AttachmentActionError';
        this.code = code;
    }
}

export type SignedAttachment = {
    signedUrl: string;
    mimeType: string;
    fileName?: string | null;
};

export type TemporaryAttachment = Readonly<{
    localUri: string;
    fileName: string;
    mimeType: string;
    kind: AttachmentMimeKind;
}>;

export type CreateTemporaryAttachmentOptions = Readonly<{
    signal?: AbortSignal;
}>;

export type ShareAttachmentOptions = CreateTemporaryAttachmentOptions & Readonly<{
    cleanup?: boolean;
    dialogTitle?: string;
}>;

/**
 * Adapter boundary for the optional gallery integration.
 *
 * The adapter receives only a local cache URI and safe metadata. It never
 * receives the signed URL. The adapter implementation belongs to the
 * integrator that owns the installed gallery/MediaLibrary version.
 */
export interface AttachmentGalleryAdapter {
    saveLocalFileAsync(file: TemporaryAttachment): Promise<void>;
}

export type GallerySaveOptions = CreateTemporaryAttachmentOptions & Readonly<{
    cleanup?: boolean;
}>;

export type CopyAttachmentOptions = CreateTemporaryAttachmentOptions & Readonly<{
    cleanup?: boolean;
}>;

export type SaveAttachmentOptions = ShareAttachmentOptions;

const DEFAULT_MIME_TYPE = 'application/octet-stream';
const TEMPORARY_FILE_PREFIX = 'ping-attachment-';
const MAX_SAFE_FILENAME_LENGTH = 120;
let temporaryFileSequence = 0;

const MIME_EXTENSIONS: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/json': '.json',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'audio/aac': '.aac',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'audio/x-m4a': '.m4a',
};

function normalizeMimeType(mimeType: string | null | undefined): string {
    const normalized = typeof mimeType === 'string'
        ? mimeType.split(';', 1)[0].trim().toLowerCase()
        : '';
    return normalized || DEFAULT_MIME_TYPE;
}

export function classifyAttachmentMime(mimeType: string | null | undefined): AttachmentMimeKind {
    const normalized = normalizeMimeType(mimeType);

    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('audio/')) return 'audio';
    if (
        normalized.startsWith('application/')
        && normalized !== DEFAULT_MIME_TYPE
    ) return 'document';
    if (normalized.startsWith('text/')) return 'document';
    return 'unknown';
}

function extensionForMimeType(mimeType: string): string {
    return MIME_EXTENSIONS[normalizeMimeType(mimeType)] || '';
}

function isReservedBaseName(baseName: string): boolean {
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName);
}

/**
 * Returns a single path-safe filename. It never uses the signed URL as a
 * filename source, so query parameters and tokens cannot reach the cache.
 */
export function createSafeAttachmentFileName(
    fileName: string | null | undefined,
    mimeType: string,
): string {
    const fallbackExtension = extensionForMimeType(mimeType);
    let safeName = typeof fileName === 'string'
        ? (fileName.normalize('NFKC').split(/[\\/]/).pop() || '')
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^[-.]+/, '')
            .replace(/\.+$/, '')
        : '';

    if (!safeName) safeName = `attachment${fallbackExtension}`;

    const lastDot = safeName.lastIndexOf('.');
    const baseName = lastDot > 0 ? safeName.slice(0, lastDot) : safeName;
    const reservedCheckName = baseName.replace(/[^a-z0-9]+$/i, '');
    if (isReservedBaseName(reservedCheckName)) safeName = `attachment-${safeName}`;

    if (!safeName.includes('.') && fallbackExtension) safeName += fallbackExtension;

    if (safeName.length <= MAX_SAFE_FILENAME_LENGTH) return safeName;

    const extension = safeName.lastIndexOf('.') > 0
        ? safeName.slice(safeName.lastIndexOf('.'))
        : '';
    const maxBaseLength = Math.max(1, MAX_SAFE_FILENAME_LENGTH - extension.length);
    return `${safeName.slice(0, maxBaseLength)}${extension}`;
}

function isValidSignedUrl(signedUrl: string): boolean {
    if (typeof signedUrl !== 'string' || signedUrl.length === 0) return false;

    try {
        const parsed = new URL(signedUrl);
        return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
        return false;
    }
}

function nextTemporaryFileName(fileName: string): string {
    temporaryFileSequence = (temporaryFileSequence + 1) % 1_000_000;
    return `${TEMPORARY_FILE_PREFIX}${Date.now().toString(36)}-${temporaryFileSequence.toString(36)}-${fileName}`;
}

function cacheUriPrefix(): string {
    const cacheUri = Paths.cache.uri;
    return cacheUri.endsWith('/') ? cacheUri : `${cacheUri}/`;
}

function isOwnedTemporaryUri(localUri: string): boolean {
    const prefix = cacheUriPrefix();
    const fileName = localUri.startsWith(prefix) ? localUri.slice(prefix.length) : '';
    return Boolean(
        fileName
        && fileName.startsWith(TEMPORARY_FILE_PREFIX)
        && !fileName.includes('/')
        && !fileName.includes('?')
        && !fileName.includes('#'),
    );
}

/** Best-effort deletion of a file created by this module in the cache. */
export function cleanupTemporaryAttachment(file: Pick<TemporaryAttachment, 'localUri'>): void {
    if (!isOwnedTemporaryUri(file.localUri)) return;

    try {
        new File(file.localUri).delete();
    } catch {
        // Cleanup must not mask the result of the share/gallery action.
    }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
        throw new AttachmentActionError('aborted', 'La descarga fue cancelada.');
    }
}

/** Downloads a signed URL to the app cache without returning the signed URL. */
export async function createTemporaryAttachmentAsync(
    attachment: SignedAttachment,
    options: CreateTemporaryAttachmentOptions = {},
): Promise<TemporaryAttachment> {
    if (!isValidSignedUrl(attachment.signedUrl)) {
        throw new AttachmentActionError('invalid_url', 'La URL del archivo no es válida.');
    }

    throwIfAborted(options.signal);

    const mimeType = normalizeMimeType(attachment.mimeType);
    const fileName = createSafeAttachmentFileName(attachment.fileName, mimeType);
    const destination = new File(Paths.cache, nextTemporaryFileName(fileName));

    try {
        const downloaded = await File.downloadFileAsync(attachment.signedUrl, destination, {
            idempotent: false,
            ...(options.signal ? { signal: options.signal } : {}),
        });
        throwIfAborted(options.signal);

        return {
            localUri: downloaded.uri,
            fileName,
            mimeType,
            kind: classifyAttachmentMime(mimeType),
        };
    } catch {
        cleanupTemporaryAttachment({ localUri: destination.uri });
        if (options.signal?.aborted) {
            throw new AttachmentActionError('aborted', 'La descarga fue cancelada.');
        }
        throw new AttachmentActionError(
            'download_failed',
            'No se pudo descargar el archivo adjunto.',
        );
    }
}

export async function shareLocalAttachmentAsync(
    attachment: TemporaryAttachment,
    options: Pick<ShareAttachmentOptions, 'dialogTitle'> = {},
): Promise<void> {
    let available: boolean;
    try {
        available = await isAvailableAsync();
    } catch {
        throw new AttachmentActionError(
            'sharing_unavailable',
            'La función de compartir no está disponible.',
        );
    }

    if (!available) {
        throw new AttachmentActionError(
            'sharing_unavailable',
            'La función de compartir no está disponible.',
        );
    }

    const shareOptions: SharingOptions = { mimeType: attachment.mimeType };
    if (options.dialogTitle) shareOptions.dialogTitle = options.dialogTitle;

    try {
        await shareAsync(attachment.localUri, shareOptions);
    } catch {
        throw new AttachmentActionError(
            'sharing_failed',
            'No se pudo compartir el archivo adjunto.',
        );
    }
}

/** Downloads and shares an attachment while keeping the signed URL private. */
export async function shareAttachmentAsync(
    attachment: SignedAttachment,
    options: ShareAttachmentOptions = {},
): Promise<void> {
    const temporaryAttachment = await createTemporaryAttachmentAsync(attachment, options);

    try {
        await shareLocalAttachmentAsync(temporaryAttachment, options);
    } finally {
        if (options.cleanup !== false) cleanupTemporaryAttachment(temporaryAttachment);
    }
}

/**
 * Downloads any attachment and saves it through the platform's file flow.
 * Android uses the Storage Access Framework so the user chooses a folder
 * without broad filesystem permissions. iOS uses the system share sheet,
 * which includes "Guardar en Archivos" and other safe destinations.
 */
export async function saveAttachmentToDeviceAsync(
    attachment: SignedAttachment,
    options: SaveAttachmentOptions = {},
): Promise<void> {
    const temporaryAttachment = await createTemporaryAttachmentAsync(attachment, options);

    try {
        if (Platform.OS === 'android') {
            const directory = await LegacyFileSystem.StorageAccessFramework
                .requestDirectoryPermissionsAsync();
            if (!directory.granted) {
                throw new AttachmentActionError(
                    'save_cancelled',
                    'Guardado cancelado por el usuario.',
                );
            }

            const destination = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
                directory.directoryUri,
                temporaryAttachment.fileName,
                temporaryAttachment.mimeType,
            );
            await LegacyFileSystem.StorageAccessFramework.copyAsync({
                from: temporaryAttachment.localUri,
                to: destination,
            });
            return;
        }

        await shareLocalAttachmentAsync(temporaryAttachment, {
            dialogTitle: options.dialogTitle || 'Guardar archivo',
        });
    } catch (error) {
        if (error instanceof AttachmentActionError) throw error;
        throw new AttachmentActionError(
            'save_failed',
            'No se pudo guardar el archivo en el dispositivo.',
        );
    } finally {
        if (options.cleanup !== false) cleanupTemporaryAttachment(temporaryAttachment);
    }
}

/** Downloads an image, copies its local bytes to the image clipboard, and never copies its URL. */
export async function copyAttachmentImageAsync(
    attachment: SignedAttachment,
    options: CopyAttachmentOptions = {},
): Promise<void> {
    if (classifyAttachmentMime(attachment.mimeType) !== 'image') {
        throw new AttachmentActionError(
            'clipboard_unsupported_type',
            'Solo se pueden copiar imágenes al portapapeles.',
        );
    }

    const temporaryAttachment = await createTemporaryAttachmentAsync(attachment, options);

    try {
        const base64Image = await new File(temporaryAttachment.localUri).base64();
        if (!base64Image) throw new Error('empty-image');
        await setImageAsync(base64Image);
    } catch {
        throw new AttachmentActionError(
            'clipboard_failed',
            'No se pudo copiar la imagen al portapapeles.',
        );
    } finally {
        if (options.cleanup !== false) cleanupTemporaryAttachment(temporaryAttachment);
    }
}

export async function prepareAttachmentForGalleryAsync(
    attachment: SignedAttachment,
    options: CreateTemporaryAttachmentOptions = {},
): Promise<TemporaryAttachment> {
    const kind = classifyAttachmentMime(attachment.mimeType);
    if (kind !== 'image' && kind !== 'video') {
        throw new AttachmentActionError(
            'gallery_unsupported_type',
            'Solo se pueden guardar imágenes y videos en la galería.',
        );
    }

    return createTemporaryAttachmentAsync(attachment, options);
}

/**
 * Downloads an image/video, passes only its local file to the gallery adapter,
 * and optionally removes the temporary cache file afterwards.
 */
export async function saveAttachmentToGalleryAsync(
    attachment: SignedAttachment,
    galleryAdapter: AttachmentGalleryAdapter,
    options: GallerySaveOptions = {},
): Promise<void> {
    if (!galleryAdapter || typeof galleryAdapter.saveLocalFileAsync !== 'function') {
        throw new AttachmentActionError(
            'gallery_adapter_missing',
            'La integración con la galería no está configurada.',
        );
    }

    const temporaryAttachment = await prepareAttachmentForGalleryAsync(attachment, options);

    try {
        await galleryAdapter.saveLocalFileAsync(temporaryAttachment);
    } catch {
        throw new AttachmentActionError(
            'gallery_save_failed',
            'No se pudo guardar el archivo en la galería.',
        );
    } finally {
        if (options.cleanup !== false) cleanupTemporaryAttachment(temporaryAttachment);
    }
}
