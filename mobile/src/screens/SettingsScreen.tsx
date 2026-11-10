import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
// SDK 57: la API funcional clásica (getCalendarsAsync/EntityTypes/Calendar
// type) se movió al subpath /legacy -- el import raíz ahora expone la
// "Next API" basada en clases. Sin cambio de comportamiento, sólo de ruta.
import * as Calendar from 'expo-calendar/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCalendarAccounts } from '../api/queries';
import { CalendarsSheet } from '../components/perfil/CalendarsSheet';
import { FocusModeSheet } from '../components/perfil/FocusModeSheet';
import { MemorySheet } from '../components/perfil/MemorySheet';
import { FeedbackSheet } from '../components/perfil/FeedbackSheet';
import { BlockedPeopleSheet } from '../components/perfil/BlockedPeopleSheet';
import { DeleteAccountSheet } from '../components/perfil/DeleteAccountSheet';
import { ICON_INSET, Row, Section, Toggle, kit } from '../components/perfil/SettingsKit';
import { openLegal } from '../utils/legalLinks';
import { exportMyData } from '../utils/exportMyData';
import { appSoundsEnabled, loadAppSoundsPreference, playAppSound, setAppSoundsEnabled } from '../utils/appSounds';
import { TAB_BAR_CLEARANCE } from '../design/FloatingTabBar';
import { Glass } from '../design/Glass';
import { colors, gradients, space } from '../design/tokens';
import { fonts, type } from '../design/typography';

// Everything the person can set, grouped the way a phone's settings are.
// Perfil keeps only who they are; it opens this screen.

export default function SettingsScreen() {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { user } = useAuth();
    const isFocused = useIsFocused();

    const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
    const [hiddenCalendars, setHiddenCalendars] = useState<string[]>([]);
    const [loadingCals, setLoadingCals] = useState(false);
    const { data: cloudAccounts = [], refetch: refetchAccounts } = useCalendarAccounts();

    const [hasBiometricHw, setHasBiometricHw] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
    const [lastSeenEnabled, setLastSeenEnabled] = useState(true);

    const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
    const [summaryHour, setSummaryHour] = useState(8);
    const [summaryMinute, setSummaryMinute] = useState(0);
    const [summaryDays, setSummaryDays] = useState<number[]>(ALL_WEEK);
    const [summaryPickerOpen, setSummaryPickerOpen] = useState(false);
    const [overdueNoticesEnabled, setOverdueNoticesEnabled] = useState(true);
    const [soundsOn, setSoundsOn] = useState(appSoundsEnabled());

    const [focusActive, setFocusActive] = useState(false);
    const [focusRemainingLabel, setFocusRemainingLabel] = useState('');

    const [calendarsVisible, setCalendarsVisible] = useState(false);
    const [focusModeVisible, setFocusModeVisible] = useState(false);
    const [memoryVisible, setMemoryVisible] = useState(false);
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [blockedVisible, setBlockedVisible] = useState(false);
    const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
    const [exportingData, setExportingData] = useState(false);

    const handleExportData = async () => {
        if (exportingData) return;
        setExportingData(true);
        try {
            await exportMyData();
        } catch {
            Alert.alert('No se pudo preparar', 'Inténtalo de nuevo en un momento.');
        } finally {
            setExportingData(false);
        }
    };

    const loadHiddenCalendars = useCallback(async () => {
        const stored = await AsyncStorage.getItem('ping_hidden_calendars');
        if (stored) setHiddenCalendars(JSON.parse(stored));
    }, []);

    const checkCalendars = useCallback(async () => {
        const { status } = await Calendar.getCalendarPermissionsAsync();
        if (status !== 'granted') return;
        setLoadingCals(true);
        try {
            const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            setCalendars(all.filter(c => c.allowsModifications));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingCals(false);
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const initialCalendarLoad = setTimeout(() => {
            void checkCalendars();
            void loadHiddenCalendars();
            void refetchAccounts();
        }, 0);

        LocalAuthentication.hasHardwareAsync().then(hasHw => setHasBiometricHw(hasHw));
        AsyncStorage.getItem('ping_biometric_lock').then(val => {
            if (val === 'true') setBiometricEnabled(true);
        });
        loadAppSoundsPreference().then(setSoundsOn);

        supabase.from('profiles').select('privacy_read_receipts, privacy_last_seen').eq('id', user.id).single().then(({ data }) => {
            if (data) {
                setReadReceiptsEnabled(data.privacy_read_receipts ?? true);
                setLastSeenEnabled(data.privacy_last_seen ?? true);
            }
        });
        supabase.from('profiles').select('assistant_daily_summary, assistant_summary_hour, assistant_summary_minute, assistant_summary_days, assistant_overdue_notices').eq('id', user.id).single().then(({ data }) => {
            if (data) {
                setDailySummaryEnabled(data.assistant_daily_summary ?? true);
                setSummaryHour(data.assistant_summary_hour ?? 8);
                setSummaryMinute(data.assistant_summary_minute ?? 0);
                setSummaryDays(Array.isArray(data.assistant_summary_days) ? data.assistant_summary_days : ALL_WEEK);
                setOverdueNoticesEnabled(data.assistant_overdue_notices ?? true);
            }
        });

        AsyncStorage.getItem('ping_focus_until').then(val => {
            if (val) {
                const until = new Date(val);
                const remaining = until.getTime() - Date.now();
                if (remaining > 0) {
                    setFocusActive(true);
                    const mins = Math.ceil(remaining / 60000);
                    setFocusRemainingLabel(mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins}min`);
                } else {
                    AsyncStorage.removeItem('ping_focus_until');
                    setFocusActive(false);
                    setFocusRemainingLabel('');
                }
            } else {
                setFocusActive(false);
                setFocusRemainingLabel('');
            }
        });

        return () => clearTimeout(initialCalendarLoad);
    }, [user, isFocused, refetchAccounts, checkCalendars, loadHiddenCalendars]);

    const handleToggleBiometric = async (value: boolean) => {
        if (value) {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Autentícate para habilitar el Bloqueo',
                cancelLabel: 'Cancelar',
                disableDeviceFallback: false,
            });
            if (!result.success) return;
        }
        setBiometricEnabled(value);
        await AsyncStorage.setItem('ping_biometric_lock', value ? 'true' : 'false');
    };

    const handleToggleReadReceipts = async (value: boolean) => {
        setReadReceiptsEnabled(value);
        await supabase.from('profiles').update({ privacy_read_receipts: value }).eq('id', user!.id);
    };

    const handleToggleLastSeen = async (value: boolean) => {
        setLastSeenEnabled(value);
        await supabase.from('profiles').update({ privacy_last_seen: value }).eq('id', user!.id);
    };

    const handleToggleDailySummary = async (value: boolean) => {
        setDailySummaryEnabled(value);
        await supabase.from('profiles').update({ assistant_daily_summary: value }).eq('id', user!.id);
    };

    const saveSummaryChoice = async (change: Record<string, unknown>, undo: () => void) => {
        const { error } = await supabase.from('profiles').update(change).eq('id', user!.id);
        if (error) {
            undo();
            Alert.alert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
        }
    };

    const handleSelectSummaryTime = (date: Date) => {
        setSummaryPickerOpen(false);
        const hour = date.getHours();
        const minute = date.getMinutes();
        const before = { hour: summaryHour, minute: summaryMinute };
        setSummaryHour(hour);
        setSummaryMinute(minute);
        void saveSummaryChoice({ assistant_summary_hour: hour, assistant_summary_minute: minute }, () => {
            setSummaryHour(before.hour);
            setSummaryMinute(before.minute);
        });
    };

    const handleToggleSummaryDay = (day: number) => {
        const next = summaryDays.includes(day) ? summaryDays.filter((d) => d !== day) : [...summaryDays, day].sort();
        // At least one day; to stop it altogether there is the switch above.
        if (next.length === 0) return;
        const before = summaryDays;
        setSummaryDays(next);
        void saveSummaryChoice({ assistant_summary_days: next }, () => setSummaryDays(before));
    };

    const handleToggleSounds = async (value: boolean) => {
        setSoundsOn(value);
        await setAppSoundsEnabled(value);
        // Turning them on plays one, so the person hears what they chose.
        if (value) playAppSound('received');
    };

    const handleToggleOverdueNotices = async (value: boolean) => {
        setOverdueNoticesEnabled(value);
        await supabase.from('profiles').update({ assistant_overdue_notices: value }).eq('id', user!.id);
    };

    const handleActivateFocus = async (minutes: number) => {
        const until = new Date(Date.now() + minutes * 60000);
        await AsyncStorage.setItem('ping_focus_until', until.toISOString());
        setFocusActive(true);
        const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}min` : ''}` : `${minutes}min`;
        setFocusRemainingLabel(label.trim());
    };

    const handleCancelFocus = async () => {
        await AsyncStorage.removeItem('ping_focus_until');
        setFocusActive(false);
        setFocusRemainingLabel('');
    };

    const toggleCalendarVisibility = async (id: string) => {
        const updated = hiddenCalendars.includes(id)
            ? hiddenCalendars.filter(cid => cid !== id)
            : [...hiddenCalendars, id];
        setHiddenCalendars(updated);
        await AsyncStorage.setItem('ping_hidden_calendars', JSON.stringify(updated));
    };

    const cloudStatus = cloudAccounts.length > 0
        ? `${cloudAccounts.length} cuenta${cloudAccounts.length > 1 ? 's' : ''}`
        : 'Sin cuentas conectadas';
    const localCalsCount = calendars.length > 0 ? calendars.length - hiddenCalendars.length : 0;
    const calsStatus = localCalsCount > 0 ? ` + ${localCalsCount} cal${localCalsCount > 1 ? 's' : ''}` : '';
    const integrationsSub = `${cloudStatus}${calsStatus}`;

    const focusStatusLabel = focusActive
        ? (focusRemainingLabel ? focusRemainingLabel : 'Activo')
        : 'Desactivado';

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{
                paddingTop: Math.max(insets.top, 16) + 12,
                paddingBottom: Math.max(insets.bottom, 12) + TAB_BAR_CLEARANCE,
            }}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Volver a Perfil" hitSlop={10}>
                    <Glass style={styles.back} intensity={30} tint={colors.glassTintLight}>
                        <Ionicons name="chevron-back" size={20} color={colors.text} />
                    </Glass>
                </TouchableOpacity>
                <View>
                    <Text style={type.overline}>PERFIL</Text>
                    <Text style={styles.headerTitle}>Ajustes</Text>
                </View>
            </View>

            <Section order={0} label="AVISOS">
                <Row icon="sunny-outline" title="Resumen del día" subtitle="Lo que tienes, a la hora y los días que elijas">
                    <Toggle value={dailySummaryEnabled} onValueChange={handleToggleDailySummary} />
                </Row>
                {dailySummaryEnabled && (
                    <View style={[kit.row, styles.hourRow]}>
                        <View style={styles.timeLine}>
                            <Text style={kit.rowSubtitle}>Hora del resumen</Text>
                            <TouchableOpacity
                                onPress={() => setSummaryPickerOpen(true)}
                                accessibilityLabel={`Hora del resumen, ${clock(summaryHour, summaryMinute)}. Toca para cambiarla`}
                                style={styles.timePill}
                            >
                                <Ionicons name="time-outline" size={16} color={colors.accent} />
                                <Text style={styles.timePillText}>{clock(summaryHour, summaryMinute)}</Text>
                                <Ionicons name="pencil-outline" size={13} color={colors.textFaint} />
                            </TouchableOpacity>
                        </View>
                        <Text style={kit.rowSubtitle}>Días</Text>
                        <View style={styles.hourChips}>
                            {WEEK.map(({ day, short, name }) => {
                                const selected = summaryDays.includes(day);
                                return (
                                    <TouchableOpacity
                                        key={day}
                                        onPress={() => handleToggleSummaryDay(day)}
                                        accessibilityLabel={`Resumen el ${name}`}
                                        accessibilityState={{ selected }}
                                        style={[styles.hourChip, selected && styles.hourChipActive]}
                                    >
                                        {selected && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                        <Text style={[styles.hourChipText, selected && styles.hourChipTextActive]}>{short}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={styles.daysHint}>{describeDays(summaryDays)}</Text>
                        {summaryPickerOpen && (
                            <DateTimePicker
                                value={timeAt(summaryHour, summaryMinute)}
                                mode="time"
                                is24Hour
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onValueChange={(_, date) => handleSelectSummaryTime(date)}
                                onDismiss={() => setSummaryPickerOpen(false)}
                            />
                        )}
                    </View>
                )}
                <Row icon="alarm-outline" title="Avisar si algo se me pasa" divider>
                    <Toggle value={overdueNoticesEnabled} onValueChange={handleToggleOverdueNotices} />
                </Row>
                <Row icon="musical-note-outline" title="Sonidos" subtitle="Envío, recepción y compromisos cumplidos" divider>
                    <Toggle value={soundsOn} onValueChange={handleToggleSounds} />
                </Row>
                <Row divider icon="moon-outline" title="Modo foco" accessibilityLabel="Modo foco" onPress={() => setFocusModeVisible(true)}>
                    <Text style={[kit.rowStatus, focusActive && kit.rowStatusActive]}>{focusStatusLabel}</Text>
                </Row>
            </Section>

            <Section order={1} label="PRIVACIDAD Y SEGURIDAD">
                {hasBiometricHw && (
                    <Row icon="finger-print-outline" title="Bloqueo con huella o rostro">
                        <Toggle value={biometricEnabled} onValueChange={handleToggleBiometric} />
                    </Row>
                )}
                <Row icon="checkmark-done-outline" title="Confirmaciones de lectura" divider={hasBiometricHw}>
                    <Toggle value={readReceiptsEnabled} onValueChange={handleToggleReadReceipts} />
                </Row>
                <Row icon="time-outline" title="Última vez en línea" divider>
                    <Toggle value={lastSeenEnabled} onValueChange={handleToggleLastSeen} />
                </Row>
                <Row divider icon="hand-left-outline" title="Personas bloqueadas" onPress={() => setBlockedVisible(true)} />
            </Section>

            <Section order={2} label="VORIAN">
                <Row icon="bulb-outline" title="Lo que Vorian recuerda" subtitle="Ver u olvidar lo que le contaste" onPress={() => setMemoryVisible(true)} />
                <Row divider icon="calendar-outline" title="Cuentas y calendarios" subtitle={integrationsSub} onPress={() => setCalendarsVisible(true)} />
            </Section>

            <Section order={3} label="TUS DATOS">
                <Row icon="download-outline" title="Descargar mis datos" subtitle={exportingData ? 'Preparando el archivo…' : 'Una copia de lo que guardaste en Vorian'} onPress={handleExportData} />
                <Row divider danger icon="trash-outline" title="Eliminar mi cuenta" accessibilityLabel="Eliminar mi cuenta" onPress={() => setDeleteAccountVisible(true)} />
            </Section>

            <Section order={4} label="AYUDA">
                <Row icon="chatbox-ellipses-outline" title="Comentarios y sugerencias" subtitle="Cuéntanos qué mejorar" onPress={() => setFeedbackVisible(true)} />
                <Row divider icon="document-lock-outline" title="Política de privacidad" onPress={() => openLegal('privacy')} />
                <Row divider icon="document-text-outline" title="Términos de uso" onPress={() => openLegal('terms')} />
            </Section>

            <CalendarsSheet
                visible={calendarsVisible}
                onClose={() => setCalendarsVisible(false)}
                cloudAccounts={cloudAccounts}
                calendars={calendars}
                hiddenCalendars={hiddenCalendars}
                loadingCals={loadingCals}
                onRefreshCalendars={checkCalendars}
                onToggleCalendarVisibility={toggleCalendarVisibility}
            />
            <FocusModeSheet
                visible={focusModeVisible}
                onClose={() => setFocusModeVisible(false)}
                focusActive={focusActive}
                focusRemainingLabel={focusRemainingLabel}
                onActivateFocus={handleActivateFocus}
                onCancelFocus={handleCancelFocus}
            />
            <MemorySheet visible={memoryVisible} onClose={() => setMemoryVisible(false)} />
            <FeedbackSheet visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
            <BlockedPeopleSheet visible={blockedVisible} onClose={() => setBlockedVisible(false)} />
            <DeleteAccountSheet visible={deleteAccountVisible} onClose={() => setDeleteAccountVisible(false)} />
        </ScrollView>
    );
}

// Days for the summary, Monday first as people read a week; 0 = Sunday, as the server counts them.
const WEEK = [
    { day: 1, short: 'L', name: 'lunes' },
    { day: 2, short: 'M', name: 'martes' },
    { day: 3, short: 'M', name: 'miércoles' },
    { day: 4, short: 'J', name: 'jueves' },
    { day: 5, short: 'V', name: 'viernes' },
    { day: 6, short: 'S', name: 'sábado' },
    { day: 0, short: 'D', name: 'domingo' },
];
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

const clock = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

function timeAt(hour: number, minute: number): Date {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date;
}

/** Says in words which days were chosen. */
export function describeDays(days: number[]): string {
    const set = new Set(days);
    if (set.size === 7) return 'Todos los días';
    if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'De lunes a viernes';
    if (set.size === 2 && set.has(0) && set.has(6)) return 'Solo fines de semana';
    const names = WEEK.filter(({ day }) => set.has(day)).map(({ name }) => name);
    if (names.length === 1) return `Solo los ${names[0] === 'sábado' || names[0] === 'domingo' ? `${names[0]}s` : names[0]}`;
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`.replace(/^./, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.sm },
    headerTitle: { ...type.display, marginTop: 2 },
    back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderTopColor: colors.glassEdge },

    hourRow: { flexDirection: 'column', alignItems: 'flex-start', gap: space.sm, paddingTop: 0, paddingLeft: ICON_INSET },
    hourChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    hourChip: {
        minWidth: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: colors.glassRaised,
    },
    hourChipActive: { backgroundColor: colors.accent },
    hourChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSoft },
    hourChipTextActive: { color: colors.onAccent },
    timeLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', paddingRight: space.lg },
    timePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.md,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.glassRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.glassBorder,
    },
    timePillText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, letterSpacing: 0.5 },
    daysHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
});
