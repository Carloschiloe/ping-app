import React from 'react';
import { Modal, TouchableOpacity, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

type SummaryModalProps = {
    visible: boolean;
    summary: string | null;
    onClose: () => void;
};

export function SummaryModal({ visible, summary, onClose }: SummaryModalProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Ionicons name="sparkles" size={20} color={theme.colors.secondary} />
                        <Text style={styles.title}>Resumen</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={theme.colors.text.secondary} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.scroll}>
                        <Text style={styles.content}>{summary}</Text>
                    </ScrollView>
                    <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                        <Text style={styles.doneText}>Entendido</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    title: { fontSize: 18, fontWeight: '700', flex: 1 },
    scroll: { marginBottom: 20 },
    content: { fontSize: 15, lineHeight: 22, color: theme.colors.text.primary },
    doneBtn: { backgroundColor: theme.colors.secondary, borderRadius: 12, padding: 16, alignItems: 'center' },
    doneText: { color: theme.colors.white, fontWeight: '700' },
});
