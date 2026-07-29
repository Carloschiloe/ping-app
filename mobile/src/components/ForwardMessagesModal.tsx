import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

type ForwardMessagesModalProps = {
    visible: boolean;
    conversations: any[];
    currentConversationId: string;
    selectedCount: number;
    isForwarding: boolean;
    onClose: () => void;
    onSelectConversation: (conversationId: string) => void;
};

function conversationLabel(conversation: any) {
    if (conversation?.isGroup) {
        return conversation?.groupMetadata?.name || 'Grupo';
    }
    return conversation?.otherUser?.full_name
        || conversation?.otherUser?.email?.split('@')[0]
        || 'Mis notas';
}

export function ForwardMessagesModal({
    visible,
    conversations,
    currentConversationId,
    selectedCount,
    isForwarding,
    onClose,
    onSelectConversation,
}: ForwardMessagesModalProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const destinations = conversations.filter((conversation) => conversation.id !== currentConversationId);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Reenviar</Text>
                            <Text style={styles.subtitle}>
                                {selectedCount === 1 ? '1 mensaje' : `${selectedCount} mensajes`}
                            </Text>
                        </View>
                        <TouchableOpacity
                            accessibilityLabel="Cerrar selector de conversación"
                            disabled={isForwarding}
                            onPress={onClose}
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    </View>

                    {destinations.length === 0 ? (
                        <View style={styles.empty}>
                            <Ionicons name="chatbubbles-outline" size={32} color={theme.colors.text.muted} />
                            <Text style={styles.emptyText}>No hay otra conversación disponible.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={destinations}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    disabled={isForwarding}
                                    onPress={() => onSelectConversation(item.id)}
                                    style={styles.conversation}
                                >
                                    <View style={styles.avatar}>
                                        <Ionicons
                                            name={item.isGroup ? 'people' : 'person'}
                                            size={21}
                                            color={theme.colors.primary}
                                        />
                                    </View>
                                    <Text style={styles.conversationName} numberOfLines={1}>
                                        {conversationLabel(item)}
                                    </Text>
                                    {isForwarding ? (
                                        <ActivityIndicator size="small" color={theme.colors.primary} />
                                    ) : (
                                        <Ionicons name="arrow-redo" size={20} color={theme.colors.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: any) => StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: theme.colors.overlay,
    },
    sheet: {
        maxHeight: '72%',
        minHeight: 260,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 28,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: theme.colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        color: theme.colors.text.primary,
        fontSize: 21,
        fontWeight: '800',
    },
    subtitle: {
        marginTop: 2,
        color: theme.colors.text.secondary,
        fontSize: 13,
    },
    closeButton: {
        padding: 8,
    },
    conversation: {
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted,
    },
    conversationName: {
        flex: 1,
        color: theme.colors.text.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 40,
    },
    emptyText: {
        color: theme.colors.text.secondary,
        fontSize: 15,
        textAlign: 'center',
    },
});
