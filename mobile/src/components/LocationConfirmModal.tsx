import React from 'react';
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { latLngToOsmTile } from '../utils/mapTiles';

export interface LocationPreview {
    latitude: number;
    longitude: number;
    label: string;
    address?: string;
}

interface LocationConfirmModalProps {
    visible: boolean;
    location: LocationPreview | null;
    loading: boolean;
    error: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Opens platform maps for directions. */
async function openDirections(lat: number, lng: number) {
    const nativeUrl =
        Platform.OS === 'ios'
            ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
            : `google.navigation:q=${lat},${lng}`;
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
    await Linking.openURL(canOpen ? nativeUrl : fallback);
}

async function openInMaps(lat: number, lng: number) {
    const nativeUrl =
        Platform.OS === 'ios'
            ? `http://maps.apple.com/?ll=${lat},${lng}&q=Ubicaci%C3%B3n`
            : `geo:${lat},${lng}?q=${lat},${lng}`;
    const fallback = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const canOpen = await Linking.canOpenURL(nativeUrl).catch(() => false);
    await Linking.openURL(canOpen ? nativeUrl : fallback);
}

export default function LocationConfirmModal({
    visible,
    location,
    loading,
    error,
    onConfirm,
    onCancel,
}: LocationConfirmModalProps) {
    const { theme } = useAppTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                            Compartir ubicación
                        </Text>
                        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={[styles.mapContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
                        {loading ? (
                            <View style={styles.loadingOverlay}>
                                <ActivityIndicator color={theme.colors.accent} />
                                <Text style={{ marginTop: 8, color: theme.colors.text.secondary }}>
                                    Obteniendo ubicación...
                                </Text>
                            </View>
                        ) : location ? (
                            <>
                                <TouchableOpacity
                                    activeOpacity={0.9}
                                    style={{ flex: 1 }}
                                    onPress={() => openInMaps(location.latitude, location.longitude)}
                                >
                                    <Image
                                        source={{ uri: latLngToOsmTile(location.latitude, location.longitude, 16) }}
                                        style={styles.mapImage}
                                        resizeMode="cover"
                                    />
                                    {/* Center Marker */}
                                    <View style={styles.markerContainer}>
                                        <View style={styles.markerShadow} />
                                        <Ionicons name="location-sharp" size={36} color="#ef4444" style={styles.markerIcon} />
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.mapActionsOverlay}>
                                    <TouchableOpacity
                                        style={[styles.mapActionBtn, { backgroundColor: theme.colors.surface }]}
                                        onPress={() => openDirections(location.latitude, location.longitude)}
                                    >
                                        <Ionicons name="navigate-outline" size={16} color={theme.colors.accent} />
                                        <Text style={[styles.mapActionText, { color: theme.colors.accent }]}>Cómo llegar</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <View style={styles.errorContainer}>
                                <Ionicons name="location-outline" size={32} color={theme.colors.danger} />
                                <Text style={{ marginTop: 8, color: theme.colors.danger, textAlign: 'center' }}>
                                    {error || 'No se pudo cargar el mapa'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Location info */}
                    {location && (
                        <View style={styles.info}>
                            <Ionicons name="location" size={18} color={theme.colors.accent} />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={[styles.locationLabel, { color: theme.colors.text.primary }]}
                                    numberOfLines={2}
                                >
                                    {location.label}
                                </Text>
                                {location.address ? (
                                    <Text
                                        style={[styles.locationAddress, { color: theme.colors.text.secondary }]}
                                        numberOfLines={1}
                                    >
                                        {location.address}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    )}

                    {/* Actions */}
                    <View style={[styles.actions, { borderTopColor: theme.colors.border }]}>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnCancel, { borderColor: theme.colors.border }]}
                            onPress={onCancel}
                        >
                            <Text style={{ color: theme.colors.text.secondary, fontWeight: '600' }}>
                                Cancelar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.btn,
                                styles.btnConfirm,
                                { backgroundColor: theme.colors.accent },
                                (!location || loading || !!error) && { opacity: 0.4 },
                            ]}
                            onPress={onConfirm}
                            disabled={!location || loading || !!error}
                        >
                            <Ionicons name="location" size={16} color={theme.colors.white} />
                            <Text style={{ color: theme.colors.white, fontWeight: '700' }}>
                                Enviar ubicación
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 18,
    },
    title: { fontSize: 17, fontWeight: '700' },
    mapContainer: {
        height: 200,
        width: '100%',
        position: 'relative',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorContainer: {
        ...StyleSheet.absoluteFill,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    hint: { fontSize: 14, marginTop: 4 },
    mapImage: {
        width: '100%',
        height: '100%',
    },
    markerContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: -18,
        marginTop: -32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerShadow: {
        position: 'absolute',
        bottom: 4,
        width: 12,
        height: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.3)',
        transform: [{ scaleX: 2 }],
    },
    markerIcon: {
        textShadowColor: 'rgba(0,0,0,0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    mapActionsOverlay: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        flexDirection: 'row',
        gap: 8,
    },
    mapActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    mapActionText: {
        fontSize: 12,
        fontWeight: '600',
    },
    mapBadge: {
        position: 'absolute',
        bottom: 10,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        opacity: 0.9,
    },
    mapBadgeText: { fontSize: 11, fontWeight: '700' },
    info: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 16,
    },
    locationLabel: { fontSize: 15, fontWeight: '600' },
    locationAddress: { fontSize: 12, marginTop: 2 },
    actions: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    btn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    btnCancel: { borderWidth: 1 },
    btnConfirm: {},
});
