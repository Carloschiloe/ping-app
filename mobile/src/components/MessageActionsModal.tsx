import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

type MessageActionsModalProps = {
    visible: boolean;
    menuAnim: Animated.Value;
    canPin: boolean;
    isPinned: boolean;
    isOwnMessage: boolean;
    onClose: () => void;
    onReact: (emoji: string) => void;
    onReply: () => void;
    onCopy: () => void;
    onToggleSelect: () => void;
    onTogglePin: () => void;
    onDelete: () => void;
};

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageActionsModal({
    visible,
    menuAnim,
    canPin,
    isPinned,
    isOwnMessage,
    onClose,
    onReact,
    onReply,
    onCopy,
    onToggleSelect,
    onTogglePin,
    onDelete,
}: MessageActionsModalProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
                <Animated.View style={[styles.sheet, { transform: [{ translateY: menuAnim }] }]}> 
                    <View style={styles.emojiRow}>
                        {EMOJIS.map((emoji) => (
                            <TouchableOpacity key={emoji} style={styles.emojiBtn} onPress={() => onReact(emoji)}>
                                <Text style={styles.emojiText}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.actions}>
                        <TouchableOpacity style={styles.actionRow} onPress={onReply}>
                            <Ionicons name="arrow-undo-outline" size={22} color="#8b5cf6" />
                            <Text style={styles.actionLabel}>Responder</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionRow} onPress={onCopy}>
                            <Ionicons name="copy-outline" size={22} color={theme.colors.secondary} />
                            <Text style={styles.actionLabel}>Copiar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionRow} onPress={onToggleSelect}>
                            <Ionicons name="checkmark-circle-outline" size={22} color="#3b82f6" />
                            <Text style={styles.actionLabel}>Seleccionar</Text>
                        </TouchableOpacity>
                        {canPin && (
                            <TouchableOpacity style={styles.actionRow} onPress={onTogglePin}>
                                <Ionicons name={isPinned ? 'pin-outline' : 'pin'} size={22} color="#2563eb" />
                                <Text style={styles.actionLabel}>{isPinned ? 'Desfijar principal' : 'Fijar principal'}</Text>
                            </TouchableOpacity>
                        )}
                        {isOwnMessage && (
                            <TouchableOpacity style={[styles.actionRow, styles.deleteRow]} onPress={onDelete}>
                                <Ionicons name="trash-outline" size={22} color="#ef4444" />
                                <Text style={[styles.actionLabel, styles.deleteLabel]}>Eliminar</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={styles.cancel} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 10 },
    emojiBtn: { padding: 8 },
    emojiText: { fontSize: 26 },
    actions: { backgroundColor: theme.colors.surfaceMuted, borderRadius: 16, overflow: 'hidden', marginBottom: 15 },
    actionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    actionLabel: { fontSize: 16, color: theme.colors.text.primary, fontWeight: '500' },
    deleteRow: { borderBottomWidth: 0 },
    deleteLabel: { color: '#ef4444' },
    cancel: { alignItems: 'center', padding: 16 },
    cancelText: { fontSize: 16, fontWeight: '600', color: theme.colors.secondary },
});
