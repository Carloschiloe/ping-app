import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('Welcome pages', () => {
    const nav = read('src/navigation/index.tsx');
    const welcome = read('src/screens/WelcomeScreen.tsx');

    it('show once per person before the app, and permissions wait for them', () => {
        expect(nav).toContain('hasSeenWelcome(userId)');
        expect(nav).toContain('session && profileComplete && !welcomeSeen');
        expect(nav).toContain('{signedIn && welcomeSeen && <PushNotificationHandler />}');
        expect(read('src/utils/welcome.ts')).toContain('`ping.welcome.v3:${userId}`');
    });

    it('explain each permission before asking, and only ask on a tap', () => {
        expect(welcome).toContain('onPress={askNotifications}');
        expect(welcome).not.toMatch(/useEffect\([^)]*requestPermissionsAsync/s);
        expect(welcome).toContain('Se solicitará solo cuando busques a una persona.');
        expect(welcome).toContain('Omitir');
    });
});

describe('App sounds', () => {
    const sounds = read('src/utils/appSounds.ts');

    it('are quiet, only while the app is open, and can be turned off in Ajustes', () => {
        expect(sounds).toContain("AppState.currentState !== 'active'");
        expect(sounds).toMatch(/if \(!enabled/);
        for (const file of ['sent', 'received', 'done']) {
            expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'sounds', `${file}.wav`))).toBe(true);
        }
        expect(read('src/screens/SettingsScreen.tsx')).toContain('title="Sonidos"');
    });

    it('play on sending, on a new message from someone else, and on done', () => {
        const chat = read('src/screens/ChatScreen.tsx');
        expect(chat.match(/playAppSound\('sent'\)/g)?.length).toBe(3);
        expect(chat).toContain("isNewIncomingMessage(newestMessageIdRef.current, newestMessage, user?.id)");
        expect(read('src/hooks/useCloseCommitment.ts')).toContain("playAppSound('done')");
        expect(sounds).toContain('newest.sender_id === myUserId');
        expect(sounds).toContain('if (!previousNewestId');
    });
});
