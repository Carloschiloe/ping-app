import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => store.get(key) ?? null,
        setItem: async (key: string, value: string) => { store.set(key, value); },
    },
}));

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('hands-free voice', () => {
    beforeEach(() => { store.clear(); vi.resetModules(); });

    it('keeps the screen on only while the voice is open', () => {
        const voice = read('components/agent/LiveVoiceSession.tsx');
        expect(voice).toContain('activateKeepAwakeAsync(KEEP_AWAKE_TAG)');
        expect(voice).toContain('deactivateKeepAwake(KEEP_AWAKE_TAG)');
    });

    it('opens in voice once per launch, only when the person chose it', async () => {
        const off = await import('../src/utils/openInVoice');
        expect(await off.shouldOpenInVoiceOnLaunch()).toBe(false);

        vi.resetModules();
        const on = await import('../src/utils/openInVoice');
        await on.saveOpenInVoice(true);
        expect(await on.shouldOpenInVoiceOnLaunch()).toBe(true);
        expect(await on.shouldOpenInVoiceOnLaunch()).toBe(false);
    });

    it('offers the option in Ajustes and starts the voice from the app launch', () => {
        expect(read('screens/SettingsScreen.tsx')).toContain('title="Abrir directo en voz"');
        expect(read('navigation/index.tsx')).toContain('useOpenInVoice(navigationRef);');
        expect(read('hooks/useOpenInVoice.ts')).toContain("startWith: 'voice'");
    });

    it('saying goodbye ends at the chat list', () => {
        expect(read('components/agent/LiveVoiceSession.tsx')).toContain("if (message.type === 'farewell') closeReasonRef.current = 'farewell';");
        expect(read('screens/AgentPreviewScreen.tsx')).toContain("if (reason === 'farewell') navigation.popTo('ConversationsList');");
        // Going back to the chat list that is already open keeps the tab bar.
        expect(read('screens/ChatInfoScreen.tsx')).not.toContain("navigate('ConversationsList')");
    });

    it('the summary of the day opens the voice to say it, on arrival with the app open or on tapping it', () => {
        const push = read('hooks/usePushNotifications.ts');
        expect(push).toContain("data?.kind === 'daily_summary' && typeof data?.spoken === 'string'");
        expect(push).toContain('if (briefing) openBriefing(navigationRef, briefing);');
        expect(push).toContain('openPingNotice(navigationRef, launchData);');
        expect(push).toContain("new Set(['Call', 'IncomingCall'])");
        const screen = read('screens/AgentPreviewScreen.tsx');
        expect(screen).toContain('briefing={pendingBriefing}');
        expect(screen).toContain('setPendingBriefing(undefined);');
        expect(read('components/agent/LiveVoiceSession.tsx')).toContain('briefing: briefing?.trim() || undefined,');
    });
});
