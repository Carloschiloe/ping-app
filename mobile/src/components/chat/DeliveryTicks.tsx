import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../design/tokens';

export type DeliveryState = 'sent' | 'delivered' | 'read';

interface DeliveryTicksProps {
    state: DeliveryState;
    // On top of a photo the ticks are white so they read over any picture.
    onMedia?: boolean;
}

// One tick = sent, two ticks = delivered, two bright ticks = read. Each tick is
// a short thick "L" turned 45 degrees, so the marks stay crisp at any size.
export function DeliveryTicks({ state, onMedia = false }: DeliveryTicksProps) {
    const color = state === 'read' ? colors.readTick : onMedia ? colors.onAccent : colors.onAccentSoft;
    const tick = <View style={[styles.tick, { borderColor: color }]} />;
    return (
        <View
            style={[styles.wrap, state === 'sent' && styles.wrapSingle]}
            accessibilityLabel={state === 'read' ? 'Leído' : state === 'delivered' ? 'Entregado' : 'Enviado'}
        >
            {tick}
            {state !== 'sent' && <View style={styles.second}>{tick}</View>}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { width: 20, height: 14, justifyContent: 'center' },
    wrapSingle: { width: 13 },
    tick: {
        width: 6,
        height: 11,
        borderRightWidth: 2.2,
        borderBottomWidth: 2.2,
        borderBottomRightRadius: 1.5,
        transform: [{ rotate: '45deg' }],
        marginLeft: 3,
        marginTop: -3,
    },
    second: { position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center' },
});
