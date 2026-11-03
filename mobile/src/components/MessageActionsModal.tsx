import React from 'react';
import { Modal, TouchableOpacity, View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';

type MessageActionsModalProps = {
    visible: boolean;
    menuAnim: Animated.Value;
    canPin: boolean;
    isPinned: boolean;
    isOwnMessage: boolean;
    isAttachment?: boolean;
    attachmentKind?: 'image' | 'video' | 'audio' | 'document' | null;
    onClose: () => void;
    onReact: (emoji: string) => void;
    onReply: () => void;
    onForward: () => void;
    onCopy: () => void;
    onShare?: () => void;
    onSave?: () => void;
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
    isAttachment = false,
    attachmentKind = null,
    onClose,
    onReact,
    onReply,
    onForward,
    onCopy,
    onShare,
    onSave,
    onToggleSelect,
    onTogglePin,
    onDelete,
}: MessageActionsModalProps) {
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
                            <Ionicons name="arrow-undo-outline" size={22} color={colors.accentBright} />
                            <Text style={styles.actionLabel}>Responder</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionRow} onPress={onForward}>
                            <Ionicons name="arrow-redo-outline" size={22} color={colors.accentBright} />
                            <Text style={styles.actionLabel}>Reenviar</Text>
                        </TouchableOpacity>
                        {(!isAttachment || attachmentKind === 'image') && (
                            <TouchableOpacity style={styles.actionRow} onPress={onCopy}>
                                <Ionicons name="copy-outline" size={22} color={colors.accentBright} />
                                <Text style={styles.actionLabel}>{attachmentKind === 'image' ? 'Copiar imagen' : 'Copiar'}</Text>
                            </TouchableOpacity>
                        )}
                        {isAttachment && onShare && (
                            <TouchableOpacity style={styles.actionRow} onPress={onShare}>
                                <Ionicons name="share-social-outline" size={22} color={colors.success} />
                                <Text style={styles.actionLabel}>Compartir archivo</Text>
                            </TouchableOpacity>
                        )}
                        {isAttachment && onSave && (
                            <TouchableOpacity style={styles.actionRow} onPress={onSave}>
                                <Ionicons name="download-outline" size={22} color={colors.success} />
                                <Text style={styles.actionLabel}>Guardar archivo</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.actionRow} onPress={onToggleSelect}>
                            <Ionicons name="checkmark-circle-outline" size={22} color={colors.accentBright} />
                            <Text style={styles.actionLabel}>Seleccionar</Text>
                        </TouchableOpacity>
                        {canPin && (
                            <TouchableOpacity style={styles.actionRow} onPress={onTogglePin}>
                                <Ionicons name={isPinned ? 'pin-outline' : 'pin'} size={22} color={colors.accentBright} />
                                <Text style={styles.actionLabel}>{isPinned ? 'Desfijar principal' : 'Fijar principal'}</Text>
                            </TouchableOpacity>
                        )}
                        {isOwnMessage && (
                            <TouchableOpacity style={[styles.actionRow, styles.deleteRow]} onPress={onDelete}>
                                <Ionicons name="trash-outline" size={22} color={colors.danger} />
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

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surfaceSolid, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 10 },
    emojiBtn: { padding: 8 },
    emojiText: { fontFamily: fonts.regular, fontSize: 26 },
    actions: { backgroundColor: colors.glassRaised, borderRadius: 16, overflow: 'hidden', marginBottom: 15 },
    actionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.glassBorder },
    actionLabel: { fontSize: 16, color: colors.text, fontFamily: fonts.medium },
    deleteRow: { borderBottomWidth: 0 },
    deleteLabel: { color: colors.danger },
    cancel: { alignItems: 'center', padding: 16 },
    cancelText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.accentBright },
});
