import React from 'react';
import {
    ActivityIndicator,
    Linking,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LocationArt } from './LocationArt';
import { colors } from '../design/tokens';
import { fonts } from '../design/typography';
import { SheetFill, sheetSurface } from '../design/Sheet';

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
    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={[styles.sheet]}>
                    <SheetFill />
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>
                            Compartir ubicación
                        </Text>
                        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close" size={24} color={colors.textSoft} />
                        </TouchableOpacity>
                    </View>

                    {/* Body */}
                    <View style={[styles.mapContainer, { backgroundColor: colors.glassRaised }]}>
                        {loading ? (
                            <View style={styles.loadingOverlay}>
                                <ActivityIndicator color={colors.accent} />
                                <Text style={{ marginTop: 8, color: colors.textSoft }}>
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
                                    <LocationArt latitude={location.latitude} longitude={location.longitude} pinSize={36} />
                                </TouchableOpacity>

                                <View style={styles.mapActionsOverlay}>
                                    <TouchableOpacity
                                        style={[styles.mapActionBtn, { backgroundColor: colors.surfaceSolid }]}
                                        onPress={() => openDirections(location.latitude, location.longitude)}
                                    >
                                        <Ionicons name="navigate-outline" size={16} color={colors.accent} />
                                        <Text style={[styles.mapActionText, { color: colors.accent }]}>Cómo llegar</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <View style={styles.errorContainer}>
                                <Ionicons name="location-outline" size={32} color={colors.danger} />
                                <Text style={{ marginTop: 8, color: colors.danger, textAlign: 'center' }}>
                                    {error || 'No se pudo cargar el mapa'}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Location info */}
                    {location && (
                        <View style={styles.info}>
                            <Ionicons name="location" size={18} color={colors.accent} />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={[styles.locationLabel, { color: colors.text }]}
                                    numberOfLines={2}
                                >
                                    {location.label}
                                </Text>
                                {location.address ? (
                                    <Text
                                        style={[styles.locationAddress, { color: colors.textSoft }]}
                                        numberOfLines={1}
                                    >
                                        {location.address}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                    )}

                    {/* Actions */}
                    <View style={[styles.actions, { borderTopColor: colors.glassBorder }]}>
                        <TouchableOpacity
                            style={[styles.btn, styles.btnCancel, { borderColor: colors.glassBorder }]}
                            onPress={onCancel}
                        >
                            <Text style={{ color: colors.textSoft, fontFamily: fonts.semibold }}>
                                Cancelar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.btn,
                                styles.btnConfirm,
                                { backgroundColor: colors.accent },
                                (!location || loading || !!error) && { opacity: 0.4 },
                            ]}
                            onPress={onConfirm}
                            disabled={!location || loading || !!error}
                        >
                            <Ionicons name="location" size={16} color={colors.onAccent} />
                            <Text style={{ color: colors.onAccent, fontFamily: fonts.bold }}>
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
        backgroundColor: colors.scrim,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 32,
        ...sheetSurface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 18,
    },
    title: { fontSize: 17, fontFamily: fonts.bold },
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
    hint: { fontFamily: fonts.regular, fontSize: 14, marginTop: 4 },
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
        shadowColor: colors.ink,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    mapActionText: {
        fontSize: 12,
        fontFamily: fonts.semibold,
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
    mapBadgeText: { fontSize: 11, fontFamily: fonts.bold },
    info: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 16,
    },
    locationLabel: { fontSize: 15, fontFamily: fonts.semibold },
    locationAddress: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
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
