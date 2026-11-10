import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';

// Picking the summary time with one tap for the hour and one for the minutes,
// in Vorian's glass instead of the phone's clock dial. Minutes go in steps of
// five, which is how often Vorian checks whether a summary is due.

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const two = (value: number) => String(value).padStart(2, '0');
const rows = (items: number[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

interface Props {
    visible: boolean;
    hour: number;
    minute: number;
    onClose: () => void;
    onSave: (hour: number, minute: number) => void;
}

export function SummaryTimeSheet({ visible, hour, minute, onClose, onSave }: Props) {
    const insets = useSafeAreaInsets();
    const [h, setH] = useState(hour);
    const [m, setM] = useState(minute);
    useEffect(() => {
        if (!visible) return;
        setH(hour);
        setM((Math.round(minute / 5) * 5) % 60);
    }, [visible, hour, minute]);

    const grid = (items: number[], selected: number, onPick: (value: number) => void, label: (value: number) => string) => (
        <View style={styles.grid}>
            {rows(items, 6).map((row, index) => (
                <View key={index} style={styles.gridRow}>
                    {row.map((value) => {
                        const active = value === selected;
                        return (
                            <TouchableOpacity
                                key={value}
                                onPress={() => onPick(value)}
                                accessibilityLabel={label(value)}
                                accessibilityState={{ selected: active }}
                                style={[styles.cell, active && styles.cellActive]}
                            >
                                {active && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                <Text style={[styles.cellText, active && styles.cellTextActive]}>{two(value)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
                    <SheetFill />
                    <View style={styles.handle} />
                    <Text style={styles.title}>Hora del resumen</Text>
                    <Text style={styles.preview} accessibilityLabel={`Elegida: ${two(h)}:${two(m)}`}>
                        {two(h)}<Text style={styles.previewColon}>:</Text>{two(m)}
                    </Text>

                    <Text style={styles.label}>HORA</Text>
                    {grid(HOURS, h, setH, (value) => `${value} horas`)}

                    <Text style={styles.label}>MINUTOS</Text>
                    {grid(MINUTES, m, setM, (value) => `${value} minutos`)}

                    <View style={styles.actions}>
                        <TouchableOpacity onPress={onClose} style={[styles.button, styles.buttonGhost]} accessibilityLabel="Cancelar">
                            <Text style={styles.buttonGhostText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onSave(h, m)} style={styles.button} accessibilityLabel={`Guardar ${two(h)}:${two(m)}`}>
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                            <Text style={styles.buttonText}>Guardar</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, ...sheetSurface },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.glassRaised, marginBottom: 14 },
    title: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, textAlign: 'center' },
    preview: { fontFamily: fonts.semibold, fontSize: 52, color: colors.text, textAlign: 'center', letterSpacing: 2, marginVertical: 6 },
    previewColon: { color: colors.accent },
    label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.textFaint, marginTop: 12, marginBottom: 8 },
    grid: { gap: 8 },
    gridRow: { flexDirection: 'row', gap: 8 },
    cell: {
        flex: 1,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    cellActive: { borderColor: colors.accent },
    cellText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textSoft },
    cellTextActive: { color: colors.onAccent },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    button: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    buttonGhost: { backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    buttonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
    buttonGhostText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
