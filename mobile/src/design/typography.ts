import {
    useFonts,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { colors } from './tokens';

export const fonts = {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extrabold: 'Manrope_800ExtraBold',
} as const;

// One type scale for the whole app. Weight comes from the font family, so
// these styles never set fontWeight.
export const type = {
    display: { fontFamily: fonts.extrabold, fontSize: 34, letterSpacing: -1.1, color: colors.text },
    title: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.text },
    headline: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.2, color: colors.text },
    body: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
    subhead: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSoft },
    caption: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textSoft },
    overline: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.textFaint },
} as const;

export function useDesignFonts() {
    const [loaded] = useFonts({
        Manrope_400Regular,
        Manrope_500Medium,
        Manrope_600SemiBold,
        Manrope_700Bold,
        Manrope_800ExtraBold,
    });
    return loaded;
}
