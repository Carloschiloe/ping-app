import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';

type ReactionGroup = {
    emoji: string;
    count: number;
};

type ReactionsModalProps = {
    visible: boolean;
    reactions: ReactionGroup[];
    onClose: () => void;
};

export function ReactionsModal({ visible, reactions, onClose }: ReactionsModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Reacciones</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.textSoft} />
                        </TouchableOpacity>
                    </View>
                    {reactions.length === 0 ? (
                        <Text style={styles.empty}>Sin reacciones</Text>
                    ) : (
                        reactions.map((r) => (
                            <View key={r.emoji} style={styles.row}>
                                <Text style={styles.emoji}>{r.emoji}</Text>
                                <Text style={styles.count}>{r.count}</Text>
                            </View>
                        ))
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surfaceSolid, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
    empty: { color: colors.textFaint, paddingVertical: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    emoji: { fontFamily: fonts.regular, fontSize: 18 },
    count: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
});
