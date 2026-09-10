import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Alert, Keyboard } from 'react-native';
import {
    PrivateMessageAttachment,
    uploadPrivateMessageAttachment,
} from '../lib/privateFiles';
import { getAppConfig } from '../lib/appConfig';

// Safety ceiling only — NOT the expected wait. keyboardDidHide (below) is
// the real, proven completion signal RN's own Keyboard module fires when
// the native dismiss animation actually finishes; this timeout exists
// solely to avoid hanging forever in the rare case that event never fires
// (e.g. the keyboard was already gone, or a platform quirk swallows it).
const KEYBOARD_DISMISS_SAFETY_MS = 400;

// Canonical native-media launch boundary: before presenting ANY fullscreen
// native surface (camera, gallery, document picker) from chat, the composer
// TextInput must relinquish focus and the keyboard must be fully dismissed
// first. Without this, the composer keeps the software keyboard's first-
// responder status while iOS/Android present the native modal on top of
// it — the keyboard does not implicitly hide just because an unrelated
// native surface is being presented (this was the exact root cause: no
// code anywhere called blur()/Keyboard.dismiss() before
// launchCameraAsync/launchImageLibraryAsync/getDocumentAsync).
//
// Waits for the real `keyboardDidHide` event (not a guessed delay) only
// when the composer actually reports being focused — if it isn't focused,
// there is nothing to wait for, so this resolves immediately with zero
// artificial delay. blurComposer is optional so this hook still works if a
// caller doesn't wire a composer ref (defensive, not the expected path).
async function dismissComposerKeyboard(isComposerFocused?: () => boolean, blurComposer?: () => void): Promise<void> {
    if (!isComposerFocused?.() || !blurComposer) return;

    await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            subscription.remove();
            clearTimeout(safetyTimer);
            resolve();
        };
        const subscription = Keyboard.addListener('keyboardDidHide', finish);
        const safetyTimer = setTimeout(finish, KEYBOARD_DISMISS_SAFETY_MS);
        blurComposer();
        Keyboard.dismiss();
    });
}

// Canonical cross-platform draft for a locally selected/captured media asset,
// frozen before any upload/attachment/message side effect. One shape for
// camera capture and gallery selection — no separate business logic per
// source. `kind` drives presentation (only 'video' is currently gated
// behind a pre-send preview); `size` is best-effort, since not every
// picker/provider populates it.
//
// `durationMs` is intentionally NOT part of this draft. The backend's
// duration_ms contract is audio-only (see attachmentApplication.service.ts
// and the create_message_attachment_intent RPC, which rejects any duration
// metadata on a non-audio attachment with "Audio duration is invalid",
// HTTP 400). expo-image-picker reports asset.duration for every video
// asset, so forwarding it unconditionally made every video upload-intent
// request hit that guard. Video has no duration-display feature anywhere in
// the app, so there is nothing to preserve here — the fix is to never
// collect it for video, not to relax the audio-only DB invariant.
export type LocalMediaDraft = {
    uri: string;
    kind: 'image' | 'video';
    mimeType: string;
    fileName: string;
    size?: number;
};

function isVideoAsset(asset: any): boolean {
    return asset.type === 'video' || asset.uri.endsWith('.mp4') || asset.uri.endsWith('.mov');
}

// Rejects an oversized asset BEFORE any network call (no upload-intent
// request, no local byte read, no Storage upload) only when BOTH the
// asset's declared size AND the canonical policy limit are known numbers.
// asset.fileSize is nullable on both platforms (some providers don't
// populate it), and the canonical limit can itself be "unknown"
// (maxMessageAttachmentBytes: null — see appConfig.ts) if this is the
// first-ever check and the backend was unreachable. In either unknown
// case, this preflight cannot block — a false local rejection would be
// worse than letting the existing post-upload backend/Storage checks
// (the real, authoritative enforcement) be the final safety net. It never
// silently bypasses the policy when both values ARE known.
//
// The limit itself is NOT a locally-invented constant: it comes from
// getAppConfig() (mobile/src/lib/appConfig.ts), which fetches/caches the
// canonical policy from GET /config — backend's single authoritative source
// (privateFile.service.ts's MAX_MESSAGE_ATTACHMENT_BYTES). This check is
// UX-only: the backend/Storage post-upload verification is what actually
// enforces the policy, so a stale or unreachable config value here can only
// ever produce an inaccurate/absent local message, never bypass the real
// limit.
async function exceedsSizePolicy(sizeBytes: unknown): Promise<boolean> {
    if (typeof sizeBytes !== 'number') return false;
    const { limits } = await getAppConfig();
    if (limits.maxMessageAttachmentBytes === null) return false;
    return sizeBytes > limits.maxMessageAttachmentBytes;
}

function formatMegabytes(bytes: number): string {
    return Math.round(bytes / (1024 * 1024)).toString();
}

// Only meaningful to call once exceedsSizePolicy() has already confirmed a
// known numeric limit was exceeded — if the policy were unknown, that
// preflight would never have rejected in the first place, so this always
// has a real number to report by the time it runs.
async function buildTooLargeMessage(): Promise<string> {
    const { limits } = await getAppConfig();
    if (limits.maxMessageAttachmentBytes === null) {
        // Defensive fallback for the (should-be-unreachable) case where the
        // policy became unknown between the reject decision and this call
        // — e.g. cache cleared concurrently. Still never invents a number.
        return 'No se pudo validar el tamaño del archivo. Se verificará al enviarlo.';
    }
    return `El archivo es demasiado grande para enviarlo (máximo ${formatMegabytes(limits.maxMessageAttachmentBytes)} MB).`;
}

// Domain-facing failure message for the send flow. The real backend/storage
// error (status, code, exact validation message) is preserved internally —
// logged via console.warn for dev/staging diagnostics, and still carried on
// the thrown error itself for anything upstream that wants it — but it must
// never become the permanent user-facing string: an arbitrary internal
// message (a Postgres exception, a Storage API error, a Zod validation
// detail) is not something a user can act on, and some of those messages
// could describe internal shape in ways not meant for end users.
const MEDIA_SEND_FAILURE_MESSAGE = 'El archivo no se subió. Inténtalo nuevamente.';

function logMediaSendFailure(error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.warn('[MediaPicker] Private upload failed', { message });
}

function buildDraftFromAsset(asset: any): LocalMediaDraft {
    const isVideo = isVideoAsset(asset);
    return {
        uri: asset.uri,
        kind: isVideo ? 'video' : 'image',
        mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileName: asset.fileName || (isVideo ? 'video.mp4' : 'imagen.jpg'),
        size: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
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
    // Composer focus/blur bridge (see ChatInput.tsx's ChatInputHandle) —
    // used at the shared native-media launch boundary (openCamera/
    // openGallery/openDocumentPicker) so the chat TextInput always
    // relinquishes focus before a fullscreen native surface is presented.
    // Optional so existing/future callers without a wired composer ref
    // still work (dismissComposerKeyboard degrades to a no-op).
    isComposerFocused?: () => boolean;
    blurComposer?: () => void;
}

export function useMediaPicker({
    conversationId,
    onMediaSent,
    setSendingMedia,
    onVideoDraft,
    isComposerFocused,
    blurComposer,
}: UseMediaPickerProps) {
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
            // rejection, backend validation rejection, etc.) is logged with
            // safe diagnostics for dev/staging (URI scheme, mimeType, byte
            // length, HTTP status/error code — never tokens/signed URLs/
            // bytes) inside privateFiles.ts and here. The user only ever
            // sees the safe domain-facing message below — the real internal
            // message is not something a user can act on.
            logMediaSendFailure(error);
            Alert.alert('No se pudo enviar', MEDIA_SEND_FAILURE_MESSAGE);
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
                draft.fileName
            );
            onMediaSent({
                text: draft.kind === 'video' ? 'Video' : 'Imagen',
                attachment,
            });
        } catch (error) {
            logMediaSendFailure(error);
            Alert.alert('No se pudo enviar', MEDIA_SEND_FAILURE_MESSAGE);
        } finally {
            setSendingMedia(false);
        }
    };

    const openDocumentPicker = async () => {
        try {
            await dismissComposerKeyboard(isComposerFocused, blurComposer);
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*', 'video/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];
            if (await exceedsSizePolicy(asset.size)) {
                Alert.alert('No se pudo enviar', await buildTooLargeMessage());
                return;
            }
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
    //
    // The size preflight runs here, before the draft is even built for
    // video (so an unsendable asset never reaches the preview screen — a
    // preview implies "this can be sent") and before any upload attempt for
    // images. When the size is unknown, this cannot block; the post-upload
    // backend/Storage checks remain the final safety net either way.
    const routeSelectedAsset = async (asset: any) => {
        if (await exceedsSizePolicy(asset.fileSize)) {
            Alert.alert('No se pudo enviar', await buildTooLargeMessage());
            return;
        }
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
        await dismissComposerKeyboard(isComposerFocused, blurComposer);
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
        await dismissComposerKeyboard(isComposerFocused, blurComposer);
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: mode === 'video' ? ['videos'] : ['images'],
            quality: 0.7,
            videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets[0]) return;
        await routeSelectedAsset(result.assets[0]);
    };

    // Fire-and-forget pre-warm: by the time the user actually picks/
    // captures something, the canonical config is likely already cached, so
    // the real preflight check below doesn't have to wait on a network
    // round-trip. Never blocks anything, never throws (getAppConfig always
    // resolves — see appConfig.ts). Exposed so the caller's media-source
    // chooser (see MediaSourceSheet.tsx) can call it when it opens.
    const prewarmAppConfig = () => {
        void getAppConfig();
    };

    return {
        prewarmAppConfig,
        openCamera,
        openGallery,
        openDocumentPicker,
        sendMediaDraft,
    };
}
