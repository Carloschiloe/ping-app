import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

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
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Reacciones</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={theme.colors.text.secondary} />
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

const createStyles = (theme: any) => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700', color: theme.colors.text.primary },
    empty: { color: theme.colors.text.muted, paddingVertical: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    emoji: { fontSize: 18 },
    count: { fontSize: 14, fontWeight: '700', color: theme.colors.text.primary },
});
