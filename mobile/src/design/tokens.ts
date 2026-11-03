// Ping's visual language: graphite surfaces, warm gold accents and glass
// layers over a slow aurora. Every redesigned screen reads its colors,
// radii and spacing from here, never from literal values.

export const colors = {
    ink: '#0B0B0D',
    graphite: '#141417',
    graphiteRaised: '#1C1C21',
    glass: 'rgba(255,255,255,0.06)',
    glassSolid: 'rgba(28,28,33,0.92)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassHighlight: 'rgba(255,255,255,0.16)',
    separator: 'rgba(255,255,255,0.06)',

    text: '#F5F2EA',
    textSoft: 'rgba(245,242,234,0.64)',
    textFaint: 'rgba(245,242,234,0.40)',

    gold: '#E3C27A',
    goldBright: '#F0D69A',
    goldDeep: '#B8893A',
    goldGlow: 'rgba(227,194,122,0.35)',
    goldTint: 'rgba(227,194,122,0.14)',
    onGold: '#1A1406',

    online: '#8FD9A8',
    danger: '#F2735F',

    auroraWarm: '#7A5E2C',
    auroraEmber: '#4A3518',
    auroraCool: '#2C2C36',
} as const;

export const gradients = {
    gold: ['#F0D69A', '#C99A48'] as const,
    // Avatars without a photo: warm metallic tones that sit well on graphite.
    avatar: [
        ['#4A3A22', '#2A2116'],
        ['#3A3A44', '#22222A'],
        ['#5A4526', '#33271A'],
        ['#2F3A36', '#1C2321'],
        ['#463040', '#271C25'],
        ['#3D3428', '#24201A'],
    ] as const,
};

export const radius = {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 26,
    full: 999,
} as const;

export const space = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
} as const;
