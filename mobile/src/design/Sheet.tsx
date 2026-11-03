import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from './tokens';

// Sheets and menus open in their own window, where the screen behind can't
// be blurred. They are lit glass instead: lighter at the top, a faint blue
// glow under the top edge and a bright hairline along it.
export const sheetSurface = {
    backgroundColor: colors.surfaceSolid,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderTopColor: colors.glassEdge,
};

// First child of a sheet: paints the light behind its content.
export function SheetFill() {
    return (
        <>
            <LinearGradient pointerEvents="none" colors={gradients.sheet} style={StyleSheet.absoluteFill} />
            <LinearGradient
                pointerEvents="none"
                colors={gradients.sheetGlow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.45 }}
                style={StyleSheet.absoluteFill}
            />
        </>
    );
}
