import {
    useFonts,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { colors } from './tokens';

export const fonts = {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
} as const;

// One type scale for the whole app. Weight comes from the font family, so
// these styles never set fontWeight.
export const type = {
    display: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: -0.9, color: colors.text },
    title: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: -0.3, color: colors.text },
    headline: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.2, color: colors.text },
    body: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
    subhead: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSoft },
    caption: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSoft },
    overline: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.1, color: colors.textSoft },
} as const;

export function useDesignFonts() {
    const [loaded] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Inter_800ExtraBold,
    });
    return loaded;
}
