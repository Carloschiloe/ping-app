import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients } from './tokens';
import { fonts } from './typography';
import { SheetFill, sheetSurface } from './Sheet';
import {
    TIME_PICKS, compose, dayOffset, dayStrip, describeChoice, quickPicks, startOfDay, two,
} from '../utils/timePicker';

// Vorian's own clock, the same everywhere a day or a time is chosen:
// one-tap shortcuts, a strip of days, and two wheels for the hour and the
// minute (one by one), with what will be saved written out in words.

const ITEM = 48;
const VISIBLE = 3;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type WheelProps = { values: number[]; value: number; onChange: (value: number) => void; label: string };

function Wheel({ values, value, onChange, label }: WheelProps) {
    const ref = useRef<ScrollView>(null);
    const [shown, setShown] = useState(value);
    const dragging = useRef(false);

    // Follows changes made from outside (a shortcut), without fighting a drag.
    useEffect(() => {
        if (dragging.current) return;
        setShown(value);
        ref.current?.scrollTo({ y: values.indexOf(value) * ITEM, animated: true });
    }, [value, values]);

    const indexAt = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
        Math.min(values.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ITEM)));

    const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        dragging.current = false;
        const next = values[indexAt(e)];
        setShown(next);
        if (next !== value) onChange(next);
    };

    return (
        <ScrollView
            ref={ref}
            style={styles.wheel}
            contentContainerStyle={{ paddingVertical: ITEM }}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM}
            decelerationRate="fast"
            nestedScrollEnabled
            contentOffset={{ x: 0, y: values.indexOf(value) * ITEM }}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => { dragging.current = true; }}
            onScroll={(e) => setShown(values[indexAt(e)])}
            onMomentumScrollEnd={settle}
            onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e); }}
            accessibilityLabel={`${label}: ${two(shown)}`}
        >
            {values.map((v) => (
                <TouchableOpacity
                    key={v}
                    style={styles.wheelItem}
                    activeOpacity={0.7}
                    onPress={() => { onChange(v); }}
                    accessibilityLabel={`${label} ${v}`}
                >
                    <Text style={[styles.wheelText, v === shown && styles.wheelTextOn]}>{two(v)}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

export type VorianClockMode = 'datetime' | 'date' | 'time';

interface Props {
    visible: boolean;
    /** 'datetime' picks a day and a time; 'date' only the day; 'time' a daily time. */
    mode?: VorianClockMode;
    title: string;
    subtitle?: string;
    value: Date;
    /** Warn when the choice is already in the past. */
    future?: boolean;
    saveLabel?: string;
    onClose: () => void;
    onSave: (value: Date) => void;
}

export function VorianClock({ visible, mode = 'datetime', title, subtitle, value, future = false, saveLabel = 'Guardar', onClose, onSave }: Props) {
    const insets = useSafeAreaInsets();
    const [now, setNow] = useState(() => new Date());
    const [day, setDay] = useState(() => startOfDay(value));
    const [hour, setHour] = useState(value.getHours());
    const [minute, setMinute] = useState(value.getMinutes());
    const [pick, setPick] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setNow(new Date());
        setDay(startOfDay(value));
        setHour(value.getHours());
        setMinute(value.getMinutes());
        setPick(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const days = useMemo(() => dayStrip(now), [now]);
    const picks = useMemo(() => quickPicks(now), [now]);
    const dayRef = useRef<ScrollView>(null);
    const withDay = mode !== 'time';
    const withTime = mode !== 'date';
    const chosen = compose(day, withTime ? hour : 10, withTime ? minute : 0);
    const past = future && withDay && chosen.getTime() < now.getTime() - 60_000;

    const applyPick = (label: string, at: Date) => {
        setPick(label);
        setDay(startOfDay(at));
        setHour(at.getHours());
        setMinute(at.getMinutes());
        const offset = Math.max(0, dayOffset(at, now));
        dayRef.current?.scrollTo({ x: Math.max(0, offset - 2) * 52, animated: true });
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <TouchableOpacity activeOpacity={1} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
                    <SheetFill />
                    <View style={styles.handle} />
                    <Text style={styles.title}>{title}</Text>
                    {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}

                    {withDay ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                            {picks.map((p) => (
                                <TouchableOpacity
                                    key={p.label}
                                    style={[styles.chip, pick === p.label && styles.chipOn]}
                                    onPress={() => applyPick(p.label, p.at)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: pick === p.label }}
                                >
                                    {pick === p.label && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                    <Text style={[styles.chipText, pick === p.label && styles.chipTextOn]}>{p.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    ) : (
                        <View style={styles.chipsWrap}>
                            {TIME_PICKS.map((t) => {
                                const on = t.hour === hour && t.minute === minute;
                                return (
                                    <TouchableOpacity
                                        key={t.hour}
                                        style={[styles.chip, on && styles.chipOn]}
                                        onPress={() => { setHour(t.hour); setMinute(t.minute); }}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: on }}
                                    >
                                        {on && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${t.hour}:${two(t.minute)}`}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {withDay && (
                        <ScrollView ref={dayRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
                            {days.map((d) => {
                                const on = d.date.getTime() === day.getTime();
                                return (
                                    <TouchableOpacity
                                        key={d.offset}
                                        style={[styles.day, on && styles.dayOn]}
                                        onPress={() => { setDay(d.date); setPick(null); }}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: on }}
                                    >
                                        {on && <LinearGradient colors={gradients.accent} style={StyleSheet.absoluteFill} />}
                                        <Text style={[styles.dayTop, on && styles.dayTopOn]}>{d.top}</Text>
                                        <Text style={[styles.dayNum, on && styles.dayNumOn]}>{d.day}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    {withTime && (
                        <View style={styles.wheels}>
                            <View pointerEvents="none" style={styles.band} />
                            <Wheel values={HOURS} value={hour} onChange={(v) => { setHour(v); setPick(null); }} label="Hora" />
                            <Text style={styles.colon}>:</Text>
                            <Wheel values={MINUTES} value={minute} onChange={(v) => { setMinute(v); setPick(null); }} label="Minutos" />
                        </View>
                    )}

                    <Text style={[styles.summary, past && styles.summaryPast]} accessibilityLiveRegion="polite">
                        {past ? 'Esa hora ya pasó' : mode === 'date' ? describeChoice(chosen, now).replace(/ a las .*/, '') : describeChoice(chosen, now, withDay)}
                    </Text>

                    <View style={styles.actions}>
                        <TouchableOpacity onPress={onClose} style={[styles.button, styles.buttonGhost]} accessibilityLabel="Cancelar">
                            <Text style={styles.buttonGhostText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onSave(chosen)} style={styles.button} accessibilityLabel={`${saveLabel}: ${describeChoice(chosen, now, withDay)}`}>
                            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                            <Text style={styles.buttonText}>{saveLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 12, ...sheetSurface },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.glassRaised, marginBottom: 14 },
    title: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, textAlign: 'center' },
    subtitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft, textAlign: 'center', marginTop: 4 },
    chips: { gap: 8, paddingVertical: 14 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 14 },
    chip: {
        paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', overflow: 'hidden',
        backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    chipOn: { borderColor: colors.accentBright },
    chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSoft },
    chipTextOn: { color: colors.onAccent },
    days: { gap: 6, paddingBottom: 6 },
    day: {
        width: 46, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
    },
    dayOn: { borderColor: colors.accentBright },
    dayTop: { fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint },
    dayTopOn: { color: colors.onAccentSoft },
    dayNum: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
    dayNumOn: { color: colors.onAccent },
    wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, height: ITEM * VISIBLE },
    band: {
        position: 'absolute', left: 40, right: 40, top: ITEM, height: ITEM, borderRadius: 16,
        backgroundColor: colors.accentTint, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentBright,
    },
    wheel: { width: 84, height: ITEM * VISIBLE, flexGrow: 0 },
    wheelItem: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
    wheelText: { fontFamily: fonts.medium, fontSize: 22, color: colors.textFaint },
    wheelTextOn: { fontFamily: fonts.semibold, fontSize: 32, color: colors.text },
    colon: { fontFamily: fonts.semibold, fontSize: 30, color: colors.accentBright, marginHorizontal: 6 },
    summary: { fontFamily: fonts.medium, fontSize: 14, color: colors.silver, textAlign: 'center', marginTop: 12 },
    summaryPast: { color: colors.warning },
    actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    button: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    buttonGhost: { backgroundColor: colors.glassRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
    buttonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
    buttonGhostText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
