import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

// ProfileScreen pulls in native modules, so its summary is checked as code.
const profile = read('screens/ProfileScreen.tsx');

describe('Perfil stays tidy and can carry a cover photo', () => {
    it('Perfil keeps only who you are, your plan and the way into Ajustes', () => {
        expect(profile).toContain('title="Ajustes"');
        expect(profile).toContain("navigation.navigate('Settings')");
        expect(profile).toContain('const plan = planLine(access);');
        for (const setting of ['<Toggle', 'MemorySheet', 'DeleteAccountSheet', 'Descargar mis datos', 'privacy_read_receipts']) {
            expect(profile, setting).not.toContain(setting);
        }
    });

    it('Ajustes groups every setting under a clear label', () => {
        const settings = read('screens/SettingsScreen.tsx');
        for (const label of ['AVISOS', 'PRIVACIDAD Y SEGURIDAD', 'VORIAN', 'TUS DATOS', 'AYUDA']) {
            expect(settings).toContain(`label="${label}"`);
        }
        expect(read('navigation/index.tsx')).toContain('<ProfileStackNav.Screen name="Settings" component={SettingsScreen} />');
    });

    it('the cover is picked in Editar perfil and uploaded as a private file', () => {
        const sheet = read('components/perfil/EditProfileSheet.tsx');
        expect(sheet).toContain('accessibilityLabel="Cambiar fondo"');
        expect(sheet).toContain('uploadPrivateProfileCover(user.id, prepared.uri, \'image/jpeg\')');
        expect(read('lib/privateFiles.ts')).toContain("'/files/profile-cover/complete'");
    });

    it('the cover shows behind the profile card, shaded so the name stays readable', () => {
        expect(profile).toContain("resolvePrivateFileUrl('profile_cover', user.id)");
        expect(profile).toContain('<CachedImage uri={coverUrl} style={styles.cover} />');
        expect(profile).toContain('colors={gradients.coverShade}');
    });
});
