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
