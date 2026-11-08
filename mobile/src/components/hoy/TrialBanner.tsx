import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccess, type Access } from '../../api/queries';
import { notify } from '../../design/ConfirmDialog';
import { Glass } from '../../design/Glass';
import { colors, radius, space } from '../../design/tokens';
import { fonts } from '../../design/typography';
import { PLAN_REQUIRED_MESSAGE, PLAN_REQUIRED_TITLE } from '../../utils/planGate';

/** What the banner says, or null when there is nothing to tell. */
export function trialBannerText(access: Access | undefined): string | null {
    if (!access?.enforced) return null;
    if (access.status === 'expired') return 'Tu prueba gratis terminó';
    if (access.status !== 'trial_ending' || access.daysLeft == null) return null;
    if (access.daysLeft <= 1) return 'Tu prueba gratis termina mañana';
    return `Te quedan ${access.daysLeft} días de prueba gratis`;
}

/** A quiet strip in Hoy during the last week of the free trial and after it ends. */
export function TrialBanner() {
    const { data } = useAccess();
    const text = trialBannerText(data);
    if (!text) return null;
    const ended = data?.status === 'expired';
    const explain = () => void notify(ended
        ? { title: PLAN_REQUIRED_TITLE, message: PLAN_REQUIRED_MESSAGE }
        : {
            title: text,
            message: 'Cuando termine, podrás seguir leyendo y respondiendo tus mensajes. El asistente, los resúmenes, los compromisos nuevos y las llamadas necesitarán un plan.',
        });
    return (
        <TouchableOpacity onPress={explain} accessibilityRole="button" accessibilityLabel={text}>
            <Glass style={styles.banner} intensity={40} tint={colors.glassDim}>
                <View style={[styles.icon, { backgroundColor: ended ? colors.warningTint : colors.accentTint }]}>
                    <Ionicons name={ended ? 'lock-closed-outline' : 'time-outline'} size={14} color={ended ? colors.warning : colors.accentBright} />
                </View>
                <Text style={styles.text} numberOfLines={1}>{text}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Glass>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingVertical: 10,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        marginTop: space.sm,
    },
    icon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
});
