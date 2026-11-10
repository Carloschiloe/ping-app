import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('M10 — Ping notices', () => {
    it('opens the chat with Ping when a Ping notice is tapped, also from a closed app', () => {
        const push = read('hooks/usePushNotifications.ts');
        expect(push).toContain("if (data?.type === 'ping_assistant') openPingChat(navigationRef);");
        expect(push).toContain('getLastNotificationResponseAsync()');
        expect(push).toContain("nav.navigate('Main', { screen: 'Chats', params: { screen: 'PingAI'");
    });

    it('lets the user choose the notices in Ajustes, saved on their own profile', () => {
        const profile = read('screens/SettingsScreen.tsx');
        for (const column of ['assistant_daily_summary', 'assistant_overdue_notices']) {
            expect(profile).toContain(`update({ ${column}: `);
        }
        expect(profile).toContain('label="AVISOS"');
        // Any time and minute, and the days of the week.
        expect(profile).toContain('assistant_summary_hour: hour, assistant_summary_minute: minute');
        expect(profile).toContain('assistant_summary_days: next');
        expect(profile).toContain('<SummaryTimeSheet');
        expect(profile).toContain("{ day: 0, short: 'D', name: 'domingo' }");
    });
});
