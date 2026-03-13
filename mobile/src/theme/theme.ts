export const theme = {
    colors: {
        primary: '#1e3a5f',      // Azul Ping
        secondary: '#6366f1',    // Indigo
        success: '#22c55e',      // Verde
        danger: '#ef4444',       // Rojo
        warning: '#f59e0b',      // Ambar
        info: '#3b82f6',         // Azul claro
        background: '#f3f4f6',   // Gris muy claro
        chatBackground: '#ECE5DD', // Fondo chat tipo WA
        white: '#ffffff',
        black: '#000000',
        text: {
            primary: '#111827',
            secondary: '#4b5563',
            muted: '#9ca3af',
            light: '#ffffff',
        },
        border: '#e5e7eb',
        whatsapp: {
            teal: '#005c4b',
            lightTeal: '#00a884',
            green: '#25D366',
        }
    },
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
    },
    borderRadius: {
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        full: 9999,
    },
    typography: {
        h1: { fontSize: 24, fontWeight: '700' },
        h2: { fontSize: 20, fontWeight: '700' },
        h3: { fontSize: 18, fontWeight: '600' },
        body: { fontSize: 16, fontWeight: '400' },
        caption: { fontSize: 12, fontWeight: '400' },
    }
} as const;

export type Theme = typeof theme;
