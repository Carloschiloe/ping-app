import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, addWeeks, format, isSameDay, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { dayKey, monthGrid, weekDays, type DayMark } from '../../utils/calendarDays';
import { colors } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { Glass } from '../../design/Glass';

interface WeekStripProps {
    marks: Record<string, DayMark>;
    selectedDay: Date | null;
    onSelectDay: (day: Date | null) => void;
}

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The week at a glance above the Hoy list. A dot marks a day with something
// due (red when something is late). Tapping a day shows only that day;
// tapping it again shows everything. The calendar icon opens the whole month.
export function WeekStrip({ marks, selectedDay, onSelectDay }: WeekStripProps) {
    const [anchor, setAnchor] = useState(() => new Date());
    const [monthOpen, setMonthOpen] = useState(false);
    const today = new Date();

    const days = useMemo(() => (monthOpen ? monthGrid(anchor) : weekDays(anchor)), [anchor, monthOpen]);
    const title = capitalize(format(anchor, "MMMM yyyy", { locale: es }));
    const step = (direction: 1 | -1) => setAnchor((a) => (monthOpen ? addMonths(a, direction) : addWeeks(a, direction)));

    const renderDay = (day: Date) => {
        const mark = marks[dayKey(day)];
        const isSelected = !!selectedDay && isSameDay(day, selectedDay);
        const isToday = isSameDay(day, today);
        const outside = monthOpen && !isSameMonth(day, anchor);
        const textColor = isSelected ? colors.onAccent
            : outside ? colors.textFaint
                : isToday ? colors.accentBright
                    : colors.text;
        return (
            <TouchableOpacity
                key={dayKey(day)}
                style={styles.dayCell}
                onPress={() => onSelectDay(isSelected ? null : day)}
                accessibilityRole="button"
                accessibilityLabel={format(day, "EEEE d 'de' MMMM", { locale: es })}
                accessibilityState={{ selected: isSelected }}
            >
                <View
                    style={[
                        styles.dayCircle,
                        isToday && !isSelected && { borderColor: colors.accent, borderWidth: 1.5 },
                        isSelected && { backgroundColor: colors.accent },
                    ]}
                >
                    <Text style={[styles.dayNumber, { color: textColor }]}>{format(day, 'd')}</Text>
                </View>
                <View
                    style={[
                        styles.dot,
                        mark && { backgroundColor: mark === 'overdue' ? colors.danger : colors.accent },
                    ]}
                />
            </TouchableOpacity>
        );
    };

    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

    return (
        <Glass style={styles.container} intensity={30}>
            <View style={styles.topRow}>
                <TouchableOpacity onPress={() => step(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={monthOpen ? 'Mes anterior' : 'Semana anterior'}>
                    <Ionicons name="chevron-back" size={18} color={colors.textSoft} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <TouchableOpacity onPress={() => step(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={monthOpen ? 'Mes siguiente' : 'Semana siguiente'}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                {!isSameDay(anchor, today) && (
                    <TouchableOpacity onPress={() => setAnchor(new Date())} style={styles.todayBtn} accessibilityRole="button">
                        <Text style={[styles.todayText, { color: colors.accentBright }]}>Hoy</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    onPress={() => setMonthOpen((open) => !open)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={monthOpen ? 'Ver solo la semana' : 'Ver el mes'}
                    style={[styles.monthBtn, monthOpen && { backgroundColor: colors.accentTint }]}
                >
                    <Ionicons name={monthOpen ? 'contract-outline' : 'calendar-outline'} size={18} color={monthOpen ? colors.accentBright : colors.textSoft} />
                </TouchableOpacity>
            </View>

            <View style={styles.row}>
                {WEEKDAY_LETTERS.map((letter, i) => (
                    <Text key={i} style={[styles.weekday, { color: colors.textFaint }]}>{letter}</Text>
                ))}
            </View>
            {rows.map((week) => (
                <View key={dayKey(week[0])} style={styles.row}>{week.map(renderDay)}</View>
            ))}
        </Glass>
    );
}

const styles = StyleSheet.create({
    container: { borderRadius: 20, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 6 },
    title: { fontSize: 14, fontFamily: fonts.bold },
    todayBtn: { paddingHorizontal: 8, paddingVertical: 3 },
    todayText: { fontSize: 13, fontFamily: fonts.bold },
    monthBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: fonts.semibold, marginBottom: 2 },
    dayCell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
    dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dayNumber: { fontSize: 14, fontFamily: fonts.semibold },
    dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
