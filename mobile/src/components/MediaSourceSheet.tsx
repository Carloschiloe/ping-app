import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';

// Canonical media-source chooser for chat. Deliberately NOT a native
// Alert.alert/Modal — both are real native presentations (UIAlertController
// / UIViewController on iOS), and RN's Alert.alert gives no guaranteed
// ordering between its onPress callback and its own native dismissal (see
// Alert.js's doc comment: "invoke the respective onPress callback AND
// dismiss the alert" — no ordering promised). Since selecting an option
// here immediately triggers a SECOND native presentation
// (expo-image-picker's UIViewController.present() for camera/gallery, or
// the document picker), presenting that second surface while the chooser's
// own native dismissal transition is still in flight collides with iOS's
// one-presentation-per-window constraint — this was the proven root cause
// of the camera appearing but being completely non-interactive (even its
// own native close button unresponsive), with the software keyboard still
// showing through it.
//
// This sheet is plain React Native views (View/TouchableOpacity), rendered
// and unmounted entirely within the existing single native window/
// UIViewController — there is no second native presentation to race
// against. Selecting an option is a synchronous state update
// (setShowMediaSheet(false) in the caller) with zero native dismissal
// transition to wait for, so the subsequent camera/gallery/document-picker
// launch is guaranteed to be the only native presentation in flight.
export type MediaSourceSheetProps = {
    visible: boolean;
    onClose: () => void;
    onPickPhoto: () => void;
    onPickVideo: () => void;
    onPickGallery: () => void;
    onPickDocument: () => void;
};

export function MediaSourceSheet({
    visible,
    onClose,
    onPickPhoto,
    onPickVideo,
    onPickGallery,
    onPickDocument,
}: MediaSourceSheetProps) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    if (!visible) return null;

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
            <View style={styles.sheet}>
                <Text style={styles.title}>Enviar archivo</Text>
                <TouchableOpacity style={styles.row} onPress={onPickPhoto}>
                    <Ionicons name="camera-outline" size={22} color={theme.colors.text.secondary} />
                    <Text style={styles.rowLabel}>Tomar foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.row} onPress={onPickVideo}>
                    <Ionicons name="videocam-outline" size={22} color={theme.colors.text.secondary} />
                    <Text style={styles.rowLabel}>Grabar video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.row} onPress={onPickGallery}>
                    <Ionicons name="image-outline" size={22} color={theme.colors.text.secondary} />
                    <Text style={styles.rowLabel}>Galería (Foto o Video)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.row} onPress={onPickDocument}>
                    <Ionicons name="document-outline" size={22} color={theme.colors.text.secondary} />
                    <Text style={styles.rowLabel}>Documento PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancel} onPress={onClose}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default MediaSourceSheet;

const createStyles = (theme: any) => StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFill,
        zIndex: 1000,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: theme.colors.overlay,
    },
    sheet: {
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 8,
        paddingBottom: 24,
        paddingHorizontal: 8,
    },
    title: {
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.muted,
        paddingVertical: 10,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 12,
    },
    rowLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    cancel: {
        alignItems: 'center',
        padding: 16,
        marginTop: 4,
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.secondary,
    },
});
