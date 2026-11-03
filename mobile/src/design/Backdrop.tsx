import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from './tokens';

// Full-screen brushed graphite with a soft diagonal sheen.
export function Backdrop() {
    return (
        <>
            <LinearGradient
                pointerEvents="none"
                colors={gradients.backdrop}
                locations={[0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
                locations={[0.2, 0.42, 0.62]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.8 }}
                style={StyleSheet.absoluteFill}
            />
        </>
    );
}
