import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import createConfig from '../app.config';

const originalVariant = process.env.APP_VARIANT;
const originalVoice = process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED;

afterEach(() => {
    if (originalVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = originalVariant;
    if (originalVoice === undefined) delete process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED;
    else process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED = originalVoice;
});

describe('contacts/media picker — SDK 57 API and least-privilege build contract', () => {
    it('uses the class-based contacts API and never the throwing legacy root methods', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'screens', 'NewChatScreen.tsx'),
            'utf8',
        );
        expect(source).toContain('Contact.getAllDetails');
        expect(source).not.toContain('Contacts.getContactsAsync');
        expect(source).not.toContain('Contacts.getPermissionsAsync');
        expect(source).not.toContain('Contacts.requestPermissionsAsync');
    });

    it('keeps contacts and camera available while excluding write/media-library permissions', () => {
        process.env.APP_VARIANT = 'staging';
        delete process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED;
        const config = createConfig({ config: {} } as any);
        const permissions = config.android?.permissions || [];
        const blocked = config.android?.blockedPermissions || [];

        expect(permissions).toEqual(expect.arrayContaining([
            'android.permission.CAMERA',
            'android.permission.READ_CONTACTS',
        ]));
        expect(blocked).toEqual(expect.arrayContaining([
            'android.permission.WRITE_CONTACTS',
            'android.permission.READ_MEDIA_IMAGES',
            'android.permission.READ_MEDIA_VIDEO',
            'android.permission.READ_MEDIA_AUDIO',
        ]));
        expect(blocked).not.toContain('android.permission.CAMERA');
        expect(blocked).not.toContain('android.permission.READ_CONTACTS');
    });

    it('declares the image picker plugin without adding a microphone permission', () => {
        process.env.APP_VARIANT = 'production';
        process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED = 'true';
        const config = createConfig({ config: {} } as any);
        const imagePicker = (config.plugins || []).find((plugin) =>
            Array.isArray(plugin) && plugin[0] === 'expo-image-picker'
        );

        expect(imagePicker).toEqual([
            'expo-image-picker',
            expect.objectContaining({ microphonePermission: false }),
        ]);
    });
});
