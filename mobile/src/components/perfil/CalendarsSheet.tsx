import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Switch, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// SDK 57: la API funcional clásica (getCalendarsAsync/EntityTypes/Calendar
// type) se movió al subpath /legacy -- el import raíz ahora expone la
// "Next API" basada en clases. Sin cambio de comportamiento, sólo de ruta.
import * as Calendar from 'expo-calendar/legacy';
import { API_URL } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { useUpdateCalendarAccount, useDisconnectCalendarAccount } from '../../api/queries';

import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { SheetFill, sheetSurface } from '../../design/Sheet';
interface CalendarsSheetProps {
    visible: boolean;
    onClose: () => void;
    cloudAccounts: any[];
    calendars: Calendar.Calendar[];
    hiddenCalendars: string[];
    loadingCals: boolean;
    onRefreshCalendars: () => void;
    onToggleCalendarVisibility: (id: string) => void;
}

export function CalendarsSheet({
    visible,
    onClose,
    cloudAccounts,
    calendars,
    hiddenCalendars,
    loadingCals,
    onRefreshCalendars,
    onToggleCalendarVisibility,
}: CalendarsSheetProps) {
    const insets = useSafeAreaInsets();
    const { mutate: updateAccount } = useUpdateCalendarAccount();
    const { mutate: disconnectAccount } = useDisconnectCalendarAccount();

    const handleConnectCloud = async (provider: 'google' | 'outlook') => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const url = `${API_URL}/calendar/auth/${provider}?token=${session.access_token}`;
        Linking.openURL(url);
    };

    const handleDisconnectCloud = (id: string, email: string) => {
        Alert.alert('Desconectar cuenta', `¿Estás seguro de quitar ${email}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Desconectar',
                style: 'destructive',
                onPress: () => disconnectAccount(id),
            }
        ]);
    };

    const handleToggleAutoSync = (id: string, current: boolean) => {
        updateAccount({ id, is_auto_sync_enabled: !current });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={[
                        styles.sheet,
                        {
                            paddingTop: 12,
                        },
                    ]}
                >
                    <SheetFill />
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Cuentas y Calendarios</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={24} color={colors.textFaint} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
                        ]}
                    >
                        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>CUENTAS CLOUD</Text>
                        <Text style={[styles.hint, { color: colors.textSoft }]}>
                            Conecta tus cuentas para que Ping sincronice compromisos automáticamente.
                        </Text>

                        {cloudAccounts.length > 0 && (
                            <View style={styles.cloudAccountsList}>
                                {cloudAccounts.map((acc: any) => (
                                    <View key={acc.id} style={[styles.cloudAccCard, { backgroundColor: colors.glassRaised, borderColor: colors.glassBorder }]}>
                                        <View style={styles.cloudAccRow}>
                                            <Ionicons
                                                name={acc.provider === 'google' ? "logo-google" : "logo-microsoft"}
                                                size={20}
                                                color={acc.provider === 'google' ? colors.brandGoogle : colors.brandMicrosoft}
                                            />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={[styles.cloudAccEmail, { color: colors.text }]}>{acc.email}</Text>
                                                <Text style={[styles.cloudAccMeta, { color: colors.textSoft }]}>Sincronización Cloud</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => handleDisconnectCloud(acc.id, acc.email)}>
                                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={[styles.autoSyncRow, { borderTopColor: colors.separator }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.autoSyncTitle, { color: colors.text }]}>Sincronización Automática</Text>
                                                <Text style={[styles.autoSyncDesc, { color: colors.textFaint }]}>
                                                    Agenda, completa o elimina eventos en tu nube automáticamente.
                                                </Text>
                                            </View>
                                            <Switch
                                                value={!!acc.is_auto_sync_enabled}
                                                onValueChange={() => handleToggleAutoSync(acc.id, !!acc.is_auto_sync_enabled)}
                                                trackColor={{ false: colors.glassRaised, true: colors.accent }}
                                                thumbColor={colors.onAccent}
                                            />
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={styles.cloudActions}>
                            {!cloudAccounts.find((a: any) => a.provider === 'google') && (
                                <TouchableOpacity
                                    style={styles.connectCloudBtn}
                                    onPress={() => handleConnectCloud('google')}
                                >
                                    <Ionicons name="logo-google" size={20} color={colors.brandGoogle} />
                                    <Text style={styles.connectCloudBtnText}>Conectar Google Calendar</Text>
                                </TouchableOpacity>
                            )}

                            {!cloudAccounts.find((a: any) => a.provider === 'outlook') && (
                                <TouchableOpacity
                                    style={styles.connectCloudBtn}
                                    onPress={() => handleConnectCloud('outlook')}
                                >
                                    <Ionicons name="logo-microsoft" size={20} color={colors.brandMicrosoft} />
                                    <Text style={styles.connectCloudBtnText}>Conectar Outlook (365)</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
                            <Text style={[styles.sectionTitle, { color: colors.textFaint, marginBottom: 0 }]}>CALENDARIOS DEL DISPOSITIVO</Text>
                            <TouchableOpacity onPress={onRefreshCalendars}>
                                <Ionicons name="refresh" size={18} color={colors.accentBright} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.hint, { color: colors.textSoft, marginBottom: 12 }]}>
                            Eventos de tu teléfono para considerarlos en tus propuestas de agenda.
                        </Text>

                        {loadingCals ? (
                            <ActivityIndicator size="small" color={colors.accentBright} style={{ marginTop: 20 }} />
                        ) : calendars.length > 0 ? (
                            <View style={[styles.calsContainer, { backgroundColor: colors.glassRaised, borderColor: colors.glassBorder }]}>
                                {calendars.map((cal: any, index) => {
                                    const isVisible = !hiddenCalendars.includes(cal.id);
                                    return (
                                        <TouchableOpacity
                                            key={cal.id}
                                            style={[
                                                styles.calRow,
                                                index < calendars.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                                                !isVisible && { opacity: 0.6 }
                                            ]}
                                            onPress={() => onToggleCalendarVisibility(cal.id)}
                                        >
                                            <View style={[styles.calDot, { backgroundColor: cal.color }]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.calTitle, { color: colors.text }, !isVisible && { textDecorationLine: 'line-through' }]}>
                                                    {cal.title}
                                                </Text>
                                                <Text style={[styles.calSource, { color: colors.textSoft }]}>{cal.source.name}</Text>
                                            </View>
                                            <Switch
                                                value={isVisible}
                                                onValueChange={() => onToggleCalendarVisibility(cal.id)}
                                                trackColor={{ false: colors.separator, true: colors.success }}
                                                thumbColor={colors.onAccent}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: colors.glassRaised }]} onPress={onRefreshCalendars}>
                                <Text style={[styles.permissionBtnText, { color: colors.accentBright }]}>Habilitar Calendarios</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </TouchableOpacity>
            </TouchableOpacity>
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
        height: '85%',
        ...sheetSurface,
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.glassRaised,
        marginTop: 12,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontFamily: fonts.extrabold,
    },
    closeBtn: {
        padding: 4,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: fonts.bold,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    hint: { fontFamily: fonts.regular,
        fontSize: 13,
        marginBottom: 16,
    },
    cloudAccountsList: {
        marginBottom: 16,
    },
    cloudAccCard: {
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
    },
    cloudAccRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    cloudAccEmail: {
        fontSize: 14,
        fontFamily: fonts.semibold,
    },
    cloudAccMeta: { fontFamily: fonts.regular,
        fontSize: 12,
    },
    autoSyncRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    autoSyncTitle: {
        fontSize: 13,
        fontFamily: fonts.semibold,
    },
    autoSyncDesc: { fontFamily: fonts.regular,
        fontSize: 11,
    },
    cloudActions: {
        gap: 10,
    },
    connectCloudBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 12,
        gap: 10,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    connectCloudBtnText: {
        fontFamily: fonts.bold,
        fontSize: 14,
        color: colors.text,
    },
    calsContainer: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    calRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    calDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
    },
    calTitle: {
        fontSize: 15,
        fontFamily: fonts.semibold,
    },
    calSource: { fontFamily: fonts.regular,
        fontSize: 12,
        marginTop: 2,
    },
    permissionBtn: {
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    permissionBtnText: {
        fontFamily: fonts.bold,
        fontSize: 14,
    },
});
