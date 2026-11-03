// Ping's visual language: frosted glass over brushed silver waves, with one
// electric-blue accent. Every redesigned screen reads its colors, radii and
// spacing from here, never from literal values.

export const colors = {
    ink: '#08090B',
    glassTint: 'rgba(12,14,20,0.52)',
    // The conversation list: a thin veil that lets the waves show through.
    glassTintLight: 'rgba(10,12,18,0.38)',
    // Controls that sit on the waves (filters, secondary buttons): dark enough
    // that their labels always read.
    glassDim: 'rgba(10,12,18,0.50)',
    // Where real blur isn't available the glass turns almost solid.
    glassFallback: 'rgba(26,28,34,0.94)',
    glassBorder: 'rgba(255,255,255,0.16)',
    glassPressed: 'rgba(255,255,255,0.08)',
    glassRaised: 'rgba(255,255,255,0.10)',
    separator: 'rgba(255,255,255,0.07)',
    // Menus and sheets that float over content: a soft graphite, solid
    // enough to read but lighter than the screen behind it.
    surfaceSolid: 'rgba(50,54,64,0.97)',
    // The lit top edge of a sheet.
    glassEdge: 'rgba(255,255,255,0.30)',

    // Inside a conversation the waves sit behind a darker veil, so the
    // messages stay the main thing on screen.
    chatVeil: 'rgba(8,9,11,0.46)',
    bubbleThem: 'rgba(30,34,44,0.84)',

    text: '#F4F6F9',
    textSoft: 'rgba(244,246,249,0.80)',
    textFaint: 'rgba(244,246,249,0.60)',
    silver: '#D3D8E0',

    accent: '#3B82F6',
    accentBright: '#7DB2FF',
    accentDeep: '#1D4ED8',
    accentTint: 'rgba(59,130,246,0.20)',
    onAccent: '#FFFFFF',
    onAccentSoft: 'rgba(255,255,255,0.74)',
    onAccentTint: 'rgba(255,255,255,0.16)',
    // Read ticks sit on a blue bubble, so they are a light cyan, not blue.
    readTick: '#9BE7FF',

    online: '#4ADE80',
    danger: '#F2735F',
    dangerTint: 'rgba(242,115,95,0.16)',
    warning: '#FBBF24',
    warningTint: 'rgba(251,191,36,0.16)',
    success: '#4ADE80',
    successTint: 'rgba(74,222,128,0.16)',
    // Dims the screen behind a sheet or menu.
    scrim: 'rgba(8,9,11,0.40)',
} as const;

export const gradients = {
    accent: ['#5B9BFF', '#2563EB'] as const,
    // Sheets: light graphite at the top falling into a deeper one.
    sheet: ['rgba(70,76,92,0.98)', 'rgba(36,40,50,0.98)'] as const,
    sheetGlow: ['rgba(91,155,255,0.20)', 'rgba(91,155,255,0)'] as const,
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
