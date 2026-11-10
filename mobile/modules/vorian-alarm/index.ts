import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Vorian's own Android piece: the day's summary as an alarm clock, showing
// over the lock screen while it is said, and the "Hablar con Vorian" shortcut.
// Missing on builds before 1.0.5 and on iPhone; every call is then a no-op.

type VorianAlarmNative = {
    configureBriefing(enabled: boolean, hour: number, minute: number, days: number[], title: string, body: string): number | null;
    releaseLockScreen(): void;
    canUseFullScreen(): boolean;
    openFullScreenSettings(): void;
    setVoiceShortcut(): boolean;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<VorianAlarmNative>('VorianAlarm') : null;

export const hasVorianAlarm = () => native != null;

export function configureBriefingAlarm(input: { enabled: boolean; hour: number; minute: number; days: number[]; title: string; body: string }): number | null {
    try {
        return native?.configureBriefing(input.enabled, input.hour, input.minute, input.days, input.title, input.body) ?? null;
    } catch {
        return null;
    }
}

export function releaseLockScreen(): void {
    try { native?.releaseLockScreen(); } catch { /* nothing to release */ }
}

export function canUseFullScreenAlarm(): boolean {
    try { return native?.canUseFullScreen() ?? false; } catch { return false; }
}

export function openFullScreenAlarmSettings(): void {
    try { native?.openFullScreenSettings(); } catch { /* settings unavailable */ }
}

export function setVoiceShortcut(): void {
    try { native?.setVoiceShortcut(); } catch { /* launcher without shortcuts */ }
}
