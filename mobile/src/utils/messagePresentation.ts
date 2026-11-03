import { colors } from '../design/tokens';

// My bubbles are blue, so everything on them is white; on the other
// person's glass bubble the accent carries the controls.
export function getAudioMessagePalette(isOwnMessage: boolean) {
    const foreground = isOwnMessage ? colors.onAccent : colors.text;
    const accent = isOwnMessage ? colors.onAccent : colors.accentBright;
    return {
        iconColor: accent,
        waveColor: accent,
        labelColor: foreground,
        transcriptColor: foreground,
    };
}

export type ResolvedMediaTapPresentation =
    | { kind: 'image'; url: string }
    | { kind: 'video'; url: string }
    | { kind: 'external'; url: string };

/**
 * Canonical presentation decision for tapping a message with an already-resolved
 * private media URL. Attachment identity (image vs video) MUST come from the
 * canonical attachment metadata (mimeType), never be inferred from the signed URL
 * itself — the signed URL is an opaque, short-lived private storage reference, not
 * a source of truth. Non-image/non-video (or unknown) MIME types fall back to an
 * external open rather than being force-fit into the in-app viewer.
 */
export function resolveMediaTapPresentation(
    resolvedUrl: string,
    mimeType: string | undefined | null
): ResolvedMediaTapPresentation {
    const mime = mimeType || '';
    if (mime.startsWith('image/')) return { kind: 'image', url: resolvedUrl };
    if (mime.startsWith('video/')) return { kind: 'video', url: resolvedUrl };
    return { kind: 'external', url: resolvedUrl };
}

export function getQuotedMessagePalette(isOwnMessage: boolean) {
    if (isOwnMessage) {
        return {
            backgroundColor: colors.onAccentTint,
            borderLeftColor: colors.onAccent,
            nameColor: colors.onAccent,
            textColor: colors.onAccentSoft,
        };
    }
    return {
        backgroundColor: colors.glassRaised,
        borderLeftColor: colors.accentBright,
        nameColor: colors.accentBright,
        textColor: colors.textSoft,
    };
}
