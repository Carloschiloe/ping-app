import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from './tokens';

type PanelProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    // `solid` is for surfaces that sit behind swipeable rows and need one
    // flat color; the default is a satin gradient.
    solid?: boolean;
};

// A satin metal surface with a thin bright edge on top.
export function Panel({ children, style, solid = false }: PanelProps) {
    return (
        <View style={[styles.shell, solid && { backgroundColor: colors.panel }, style]}>
            {!solid && <LinearGradient pointerEvents="none" colors={gradients.panel} style={StyleSheet.absoluteFill} />}
            <View pointerEvents="none" style={styles.highlight} />
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    shell: {
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.panelBorder,
    },
    highlight: {
        position: 'absolute',
        top: 0,
        left: 14,
        right: 14,
        height: 1,
        backgroundColor: colors.panelHighlight,
        zIndex: 1,
    },
});
