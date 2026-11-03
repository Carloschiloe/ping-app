// Ping's visual language: brushed graphite surfaces, silver text and one
// electric-blue accent. Every redesigned screen reads its colors, radii and
// spacing from here, never from literal values.

export const colors = {
    ink: '#0C0D10',
    panel: '#1C1D21',
    panelPressed: '#26282D',
    panelRaised: '#2A2C31',
    panelBorder: 'rgba(255,255,255,0.09)',
    panelHighlight: 'rgba(255,255,255,0.20)',
    separator: 'rgba(255,255,255,0.06)',

    text: '#F2F4F7',
    textSoft: 'rgba(242,244,247,0.66)',
    textFaint: 'rgba(242,244,247,0.40)',
    silver: '#C9CED6',

    accent: '#3B82F6',
    accentBright: '#7DB2FF',
    accentDeep: '#1D4ED8',
    accentTint: 'rgba(59,130,246,0.16)',
    accentGlow: 'rgba(59,130,246,0.55)',
    onAccent: '#FFFFFF',

    online: '#4ADE80',
    danger: '#F2735F',
} as const;

export const gradients = {
    // The screen itself: light falls from the top-left over brushed graphite.
    backdrop: ['#2B2D33', '#16171B', '#0C0D10'] as const,
    // Satin metal for panels, buttons and the tab bar.
    panel: ['#2E3036', '#1F2025'] as const,
    accent: ['#5B9BFF', '#2563EB'] as const,
    silver: ['#F4F6F9', '#A9B0BA'] as const,
    // Avatars without a photo: cool metallic tones.
    avatar: [
        ['#3A4150', '#232831'],
        ['#40434A', '#25272C'],
        ['#2F3D55', '#1C2433'],
        ['#3B3F47', '#22252A'],
        ['#34404D', '#1E252E'],
        ['#454850', '#2A2C31'],
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
