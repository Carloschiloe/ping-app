// Ping's visual language: frosted glass over brushed silver waves, with one
// electric-blue accent. Every redesigned screen reads its colors, radii and
// spacing from here, never from literal values.

export const colors = {
    ink: '#08090B',
    glassTint: 'rgba(16,18,24,0.42)',
    // The conversation list: a thin veil that lets the waves show through.
    glassTintLight: 'rgba(14,16,22,0.16)',
    // Where real blur isn't available the glass turns almost solid.
    glassFallback: 'rgba(26,28,34,0.94)',
    glassBorder: 'rgba(255,255,255,0.16)',
    glassPressed: 'rgba(255,255,255,0.08)',
    glassRaised: 'rgba(255,255,255,0.10)',
    separator: 'rgba(255,255,255,0.07)',

    text: '#F4F6F9',
    textSoft: 'rgba(244,246,249,0.70)',
    textFaint: 'rgba(244,246,249,0.45)',
    silver: '#D3D8E0',

    accent: '#3B82F6',
    accentBright: '#7DB2FF',
    accentDeep: '#1D4ED8',
    accentTint: 'rgba(59,130,246,0.20)',
    onAccent: '#FFFFFF',

    online: '#4ADE80',
    danger: '#F2735F',
} as const;

export const gradients = {
    accent: ['#5B9BFF', '#2563EB'] as const,
    // Avatars without a photo: cool metallic tones.
    avatar: [
        ['#4A5263', '#262B35'],
        ['#50545C', '#2A2C31'],
        ['#3A4A66', '#1E2738'],
        ['#4B5059', '#272A30'],
        ['#40505F', '#222A33'],
        ['#585C65', '#2E3036'],
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
