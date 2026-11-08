import { describe, expect, it, vi } from 'vitest';

const { notify } = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }));
vi.mock('../src/design/ConfirmDialog', () => ({ notify }));
vi.mock('../src/api/queries', () => ({ useAccess: () => ({ data: undefined }) }));
vi.mock('../src/design/Glass', () => ({ Glass: () => null }));
vi.mock('../src/design/typography', () => ({ fonts: {} }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native', () => ({ StyleSheet: { create: (s: unknown) => s }, Text: () => null, TouchableOpacity: () => null, View: () => null }));

import { trialBannerText } from '../src/components/hoy/TrialBanner';
import { showPlanRequired } from '../src/utils/planGate';

const access = (over: object) => ({ status: 'trial', trialEndsAt: null, daysLeft: 20, enforced: true, locked: false, ...over }) as any;

describe('free trial banner in Hoy', () => {
    it('shows only in the last week and after the end, and only with the switch on', () => {
        expect(trialBannerText(access({ status: 'trial', daysLeft: 20 }))).toBeNull();
        expect(trialBannerText(access({ status: 'trial_ending', daysLeft: 5 }))).toBe('Te quedan 5 días de prueba gratis');
        expect(trialBannerText(access({ status: 'trial_ending', daysLeft: 1 }))).toBe('Tu prueba gratis termina mañana');
        expect(trialBannerText(access({ status: 'expired', daysLeft: -2 }))).toBe('Tu prueba gratis terminó');
        expect(trialBannerText(access({ status: 'expired', enforced: false }))).toBeNull();
        expect(trialBannerText(access({ status: 'free_access', daysLeft: null }))).toBeNull();
        expect(trialBannerText(undefined)).toBeNull();
    });
});

describe('when the server says a plan is needed', () => {
    it('explains it once, even if several requests are turned away together', async () => {
        expect(showPlanRequired(1_000_000)).toBe(true);
        expect(showPlanRequired(1_002_000)).toBe(false);
        expect(showPlanRequired(1_020_000)).toBe(true);
        await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
    });
});
