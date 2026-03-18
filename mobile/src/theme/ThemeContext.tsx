import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, Theme } from './theme';

type ThemeContextValue = {
    theme: Theme;
    isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
    theme: lightTheme,
    isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const value = useMemo(() => ({
        theme: isDark ? darkTheme : lightTheme,
        isDark,
    }), [isDark]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
    return useContext(ThemeContext);
}
