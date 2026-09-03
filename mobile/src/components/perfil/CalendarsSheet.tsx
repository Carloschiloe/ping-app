import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Switch, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import * as Calendar from 'expo-calendar';
import { API_URL } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { useUpdateCalendarAccount, useDisconnectCalendarAccount } from '../../api/queries';

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
    const { theme } = useAppTheme();
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
                            backgroundColor: theme.colors.background,
                            paddingTop: 12,
                        },
                    ]}
                >
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Cuentas y Calendarios</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={24} color={theme.colors.text.muted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
                        ]}
                    >
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.muted }]}>CUENTAS CLOUD</Text>
                        <Text style={[styles.hint, { color: theme.colors.text.secondary }]}>
                            Conecta tus cuentas para que Ping sincronice compromisos automáticamente.
                        </Text>

                        {cloudAccounts.length > 0 && (
                            <View style={styles.cloudAccountsList}>
                                {cloudAccounts.map((acc: any) => (
                                    <View key={acc.id} style={[styles.cloudAccCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                                        <View style={styles.cloudAccRow}>
                                            <Ionicons
                                                name={acc.provider === 'google' ? "logo-google" : "logo-microsoft"}
                                                size={20}
                                                color={acc.provider === 'google' ? "#ea4335" : "#00a4ef"}
                                            />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={[styles.cloudAccEmail, { color: theme.colors.text.primary }]}>{acc.email}</Text>
                                                <Text style={[styles.cloudAccMeta, { color: theme.colors.text.secondary }]}>Sincronización Cloud</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => handleDisconnectCloud(acc.id, acc.email)}>
                                                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={[styles.autoSyncRow, { borderTopColor: theme.colors.separator }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.autoSyncTitle, { color: theme.colors.text.primary }]}>Sincronización Automática</Text>
                                                <Text style={[styles.autoSyncDesc, { color: theme.colors.text.muted }]}>
                                                    Agenda, completa o elimina eventos en tu nube automáticamente.
                                                </Text>
                                            </View>
                                            <Switch
                                                value={!!acc.is_auto_sync_enabled}
                                                onValueChange={() => handleToggleAutoSync(acc.id, !!acc.is_auto_sync_enabled)}
                                                trackColor={{ false: theme.colors.separator, true: theme.colors.accent }}
                                                thumbColor={theme.colors.white}
                                            />
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={styles.cloudActions}>
                            {!cloudAccounts.find((a: any) => a.provider === 'google') && (
                                <TouchableOpacity
                                    style={[styles.connectCloudBtn, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' }]}
                                    onPress={() => handleConnectCloud('google')}
                                >
                                    <Ionicons name="logo-google" size={20} color="#4285F4" />
                                    <Text style={[styles.connectCloudBtnText, { color: '#444' }]}>Conectar Google Calendar</Text>
                                </TouchableOpacity>
                            )}

                            {!cloudAccounts.find((a: any) => a.provider === 'outlook') && (
                                <TouchableOpacity
                                    style={[styles.connectCloudBtn, { backgroundColor: '#0078d4' }]}
                                    onPress={() => handleConnectCloud('outlook')}
                                >
                                    <Ionicons name="logo-microsoft" size={20} color="white" />
                                    <Text style={[styles.connectCloudBtnText, { color: 'white' }]}>Conectar Outlook (365)</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.text.muted, marginBottom: 0 }]}>CALENDARIOS DEL DISPOSITIVO</Text>
                            <TouchableOpacity onPress={onRefreshCalendars}>
                                <Ionicons name="refresh" size={18} color={theme.colors.accent} />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.hint, { color: theme.colors.text.secondary, marginBottom: 12 }]}>
                            Eventos de tu teléfono para considerarlos en tus propuestas de agenda.
                        </Text>

                        {loadingCals ? (
                            <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginTop: 20 }} />
                        ) : calendars.length > 0 ? (
                            <View style={[styles.calsContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.separator }]}>
                                {calendars.map((cal: any, index) => {
                                    const isVisible = !hiddenCalendars.includes(cal.id);
                                    return (
                                        <TouchableOpacity
                                            key={cal.id}
                                            style={[
                                                styles.calRow,
                                                index < calendars.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
                                                !isVisible && { opacity: 0.6 }
                                            ]}
                                            onPress={() => onToggleCalendarVisibility(cal.id)}
                                        >
                                            <View style={[styles.calDot, { backgroundColor: cal.color }]} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.calTitle, { color: theme.colors.text.primary }, !isVisible && { textDecorationLine: 'line-through' }]}>
                                                    {cal.title}
                                                </Text>
                                                <Text style={[styles.calSource, { color: theme.colors.text.secondary }]}>{cal.source.name}</Text>
                                            </View>
                                            <Switch
                                                value={isVisible}
                                                onValueChange={() => onToggleCalendarVisibility(cal.id)}
                                                trackColor={{ false: theme.colors.separator, true: theme.colors.success }}
                                                thumbColor={theme.colors.white}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onRefreshCalendars}>
                                <Text style={[styles.permissionBtnText, { color: theme.colors.accent }]}>Habilitar Calendarios</Text>
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
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '85%',
    },
    handle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
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
        fontWeight: '800',
    },
    closeBtn: {
        padding: 4,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
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
    hint: {
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
        fontWeight: '600',
    },
    cloudAccMeta: {
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
        fontWeight: '600',
    },
    autoSyncDesc: {
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
    },
    connectCloudBtnText: {
        fontWeight: '700',
        fontSize: 14,
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
        fontWeight: '600',
    },
    calSource: {
        fontSize: 12,
        marginTop: 2,
    },
    permissionBtn: {
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    permissionBtnText: {
        fontWeight: '700',
        fontSize: 14,
    },
});
