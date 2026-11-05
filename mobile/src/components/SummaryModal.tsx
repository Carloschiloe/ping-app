import React from 'react';
import { Modal, TouchableOpacity, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';

type SummaryModalProps = {
    visible: boolean;
    summary: string | null;
    onClose: () => void;
    onAskPing?: () => void;
};

export function SummaryModal({ visible, summary, onClose, onAskPing }: SummaryModalProps) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <SheetFill />
                    <View style={styles.header}>
                        <Ionicons name="sparkles" size={20} color={colors.accentBright} />
                        <Text style={styles.title}>Resumen</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.textSoft} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.scroll}>
                        <Text style={styles.content}>{summary}</Text>
                    </ScrollView>
                    {onAskPing && (
                        <TouchableOpacity style={styles.askBtn} onPress={onAskPing}>
                            <Text style={styles.askText}>Preguntarle a Ping sobre este chat</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                        <Text style={styles.doneText}>Entendido</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%', ...sheetSurface },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    title: { fontSize: 18, fontFamily: fonts.bold, flex: 1, color: colors.text },
    scroll: { marginBottom: 20 },
    content: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
    doneBtn: { backgroundColor: colors.accentBright, borderRadius: 12, padding: 16, alignItems: 'center' },
    doneText: { color: colors.onAccent, fontFamily: fonts.bold },
    askBtn: { borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10, backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    askText: { color: colors.accentBright, fontFamily: fonts.semibold },
});
