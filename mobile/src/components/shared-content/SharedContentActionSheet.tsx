import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { SharedContentItem } from '../../types/sharedContent';
import { useSharedContentUrl } from '../../hooks/useSharedContentUrl';
import { useAppTheme } from '../../theme/ThemeContext';
import {
    copySharedContentImageAsync,
    saveSharedContentItemAsync,
    shareSharedContentItemAsync,
} from '../../utils/sharedContentActions';

type Props = {
    visible: boolean;
    item: SharedContentItem | null;
    signedUrl?: string | null;
    inline?: boolean;
    canDelete: boolean;
    onClose: () => void;
    onForward: () => void;
    onDelete: () => void;
};

export function SharedContentActionSheet({
    visible,
    item,
    signedUrl,
    inline = false,
    canDelete,
    onClose,
    onForward,
    onDelete,
}: Props) {
    const { theme } = useAppTheme();
    const [busy, setBusy] = useState(false);
    const resolved = useSharedContentUrl(item, visible && !signedUrl);
    const url = signedUrl || resolved.url;
    const isLink = item?.type === 'link';

    if (!visible || !item) return null;

    const run = async (action: 'save' | 'share' | 'copy') => {
        if (busy) return;
        setBusy(true);
        try {
            if (isLink) {
                const link = item.link?.url || item.legacyUrl;
                if (!link) throw new Error('link-unavailable');
                if (action === 'copy') await Clipboard.setStringAsync(link);
                else await Share.share({ message: link, url: link });
                Alert.alert(action === 'copy' ? 'Enlace copiado' : 'Enlace compartido');
            } else if (action === 'save') {
                const destination = await saveSharedContentItemAsync(item, url);
                Alert.alert('Guardado', destination === 'gallery'
                    ? 'El archivo se guardó en la galería del dispositivo.'
                    : 'El archivo se guardó en el dispositivo.');
            } else if (action === 'share') {
                await shareSharedContentItemAsync(item, url);
                Alert.alert('Compartido', 'El archivo está listo para enviarse.');
            } else {
                await copySharedContentImageAsync(item, url);
                Alert.alert('Copiado', 'La imagen se copió al portapapeles.');
            }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            const cancelled = error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'save_cancelled';
            if (!cancelled) Alert.alert('No se pudo completar', 'El archivo no pudo procesarse. Inténtalo nuevamente.');
        } finally {
            setBusy(false);
        }
    };

    const actions = isLink
        ? [
            { icon: 'copy-outline' as const, label: 'Copiar enlace', onPress: () => void run('copy') },
            { icon: 'share-outline' as const, label: 'Compartir enlace', onPress: () => void run('share') },
        ]
        : [
            { icon: 'download-outline' as const, label: 'Guardar en el dispositivo', onPress: () => void run('save') },
            { icon: 'share-outline' as const, label: 'Compartir archivo', onPress: () => void run('share') },
            ...(item.type === 'image' ? [{ icon: 'copy-outline' as const, label: 'Copiar imagen', onPress: () => void run('copy') }] : []),
        ];

    const sheet = (
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.sheetHeader}>
                <View style={styles.titleWrap}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>Acciones del archivo</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                        {item.file?.name || item.link?.domain || 'Contenido compartido'}
                    </Text>
                </View>
                <TouchableOpacity disabled={busy} onPress={onClose} accessibilityLabel="Cerrar acciones" style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                </TouchableOpacity>
            </View>
            {actions.map((action) => (
                <TouchableOpacity key={action.label} disabled={busy} onPress={action.onPress} style={styles.actionRow}>
                    <Ionicons name={action.icon} size={22} color={theme.colors.accent} />
                    <Text style={[styles.actionLabel, { color: theme.colors.text.primary }]}>{action.label}</Text>
                </TouchableOpacity>
            ))}
            <TouchableOpacity disabled={busy} onPress={onForward} style={styles.actionRow}>
                <Ionicons name="arrow-redo-outline" size={22} color={theme.colors.accent} />
                <Text style={[styles.actionLabel, { color: theme.colors.text.primary }]}>Reenviar</Text>
            </TouchableOpacity>
            {canDelete && (
                <TouchableOpacity disabled={busy} onPress={onDelete} style={styles.actionRow}>
                    <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
                    <Text style={[styles.actionLabel, { color: theme.colors.danger }]}>Eliminar</Text>
                </TouchableOpacity>
            )}
            <TouchableOpacity disabled={busy} onPress={onClose} style={[styles.cancel, { borderTopColor: theme.colors.border }]}>
                <Text style={[styles.actionLabel, { color: theme.colors.text.secondary }]}>Cancelar</Text>
            </TouchableOpacity>
        </View>
    );

    if (inline) {
        return (
            <View style={styles.inlineRoot}>
                <Pressable style={styles.inlineBackdrop} onPress={busy ? undefined : onClose} />
                {sheet}
            </View>
        );
    }
    return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalRoot}>{sheet}</View></Modal>;
}

const styles = StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    inlineRoot: { ...StyleSheet.absoluteFill, zIndex: 30, justifyContent: 'flex-end' },
    inlineBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 26, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    titleWrap: { flex: 1 },
    title: { fontSize: 19, fontWeight: '800' },
    subtitle: { marginTop: 3, fontSize: 12 },
    closeButton: { padding: 8 },
    actionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14 },
    actionLabel: { fontSize: 16, fontWeight: '600' },
    cancel: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
});
