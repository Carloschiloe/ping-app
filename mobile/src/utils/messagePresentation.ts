type QuotedMessageTheme = {
    secondary: string;
    background: string;
    white: string;
    text: {
        primary: string;
        secondary: string;
    };
};

type AudioMessageTheme = {
    accent: string;
    bubbleTextMe: string;
    bubbleTextThem: string;
};

export function getAudioMessagePalette(
    isOwnMessage: boolean,
    colors: AudioMessageTheme
) {
    const foreground = isOwnMessage ? colors.bubbleTextMe : colors.bubbleTextThem;
    return {
        iconColor: isOwnMessage ? foreground : colors.accent,
        waveColor: isOwnMessage ? foreground : colors.accent,
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

export function getQuotedMessagePalette(
    isOwnMessage: boolean,
    isDark: boolean,
    colors: QuotedMessageTheme
) {
    if (isOwnMessage && isDark) {
        return {
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderLeftColor: colors.white,
            nameColor: colors.white,
            textColor: 'rgba(255,255,255,0.8)',
        };
    }

    if (isOwnMessage) {
        return {
            backgroundColor: 'rgba(30,58,95,0.08)',
            borderLeftColor: colors.secondary,
            nameColor: colors.secondary,
            textColor: colors.text.primary,
        };
    }

    return {
        backgroundColor: colors.background,
        borderLeftColor: colors.secondary,
        nameColor: colors.secondary,
        textColor: colors.text.secondary,
    };
}
