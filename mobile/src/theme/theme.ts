const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
} as const;

const borderRadius = {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 22,
    full: 9999,
} as const;

const typography = {
    h1: { fontSize: 24, fontWeight: '700' },
    h2: { fontSize: 20, fontWeight: '700' },
    h3: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400' },
    caption: { fontSize: 12, fontWeight: '400' },
} as const;

function createTheme(mode: 'light' | 'dark') {
    const isDark = mode === 'dark';

    return {
        mode,
        isDark,
        colors: {
            primary: isDark ? '#0f2747' : '#1e3a5f',
            secondary: isDark ? '#7c8cff' : '#6366f1',
            success: '#22c55e',
            danger: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
            background: isDark ? '#07111f' : '#f3f4f6',
            screen: isDark ? '#0a1526' : '#ffffff',
            surface: isDark ? '#0f1c2f' : '#ffffff',
            surfaceMuted: isDark ? '#12233a' : '#f8fafc',
            surfaceElevated: isDark ? '#162842' : '#ffffff',
            chatBackground: isDark ? '#0b141a' : '#ECE5DD',
            white: '#ffffff',
            black: '#000000',
            inputBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
            border: isDark ? '#1f334d' : '#e5e7eb',
            separator: isDark ? '#16263d' : '#f1f5f9',
            overlay: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.35)',
            accent: isDark ? '#8ea2ff' : '#4f46e5',
            accentSoft: isDark ? '#18274b' : '#e0e7ff',
            highlight: isDark ? '#4c3d0f' : '#fef08a',
            highlightText: isDark ? '#fde68a' : '#854d0e',
            online: '#10b981',
            unread: isDark ? '#8ea2ff' : '#4f46e5',
            bubbleMe: isDark ? '#144d37' : '#e7ffdb',
            bubbleThem: isDark ? '#18222f' : '#ffffff',
            bubbleTextMe: '#f8fafc',
            bubbleTextThem: isDark ? '#f8fafc' : '#111827',
            text: {
                primary: isDark ? '#f8fafc' : '#111827',
                secondary: isDark ? '#b4c0d0' : '#4b5563',
                muted: isDark ? '#7f8ba1' : '#9ca3af',
                light: '#ffffff',
            },
            whatsapp: {
                teal: '#005c4b',
                lightTeal: '#00a884',
                green: '#25D366',
            },
            headerGradient: isDark ? ['#07111f', '#123663'] : ['#0f172a', '#1e3a8a'],
            headerCard: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
        },
        spacing,
        borderRadius,
        typography,
    } as const;
}

export const lightTheme = createTheme('light');
export const darkTheme = createTheme('dark');
export const theme = lightTheme;

export type Theme = typeof lightTheme;
