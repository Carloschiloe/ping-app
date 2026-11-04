import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

// ProfileScreen pulls in native modules, so its summary is checked as code.
const profile = read('screens/ProfileScreen.tsx');

describe('Perfil stays tidy and can carry a cover photo', () => {
    it('Avisos de Ping starts closed and says in one line how it is set', () => {
        expect(profile).toContain('const [noticesOpen, setNoticesOpen] = useState(false);');
        expect(profile).toContain('{noticesOpen && (<>');
        expect(profile).toContain('subtitle={noticesSummary(dailySummaryEnabled, summaryHour, overdueNoticesEnabled)}');
        expect(profile).toContain("return parts.length ? parts.join(' · ') : 'Apagados';");
    });

    it('Privacidad also starts closed with a one-line summary', () => {
        expect(profile).toContain('const [privacyOpen, setPrivacyOpen] = useState(false);');
        expect(profile).toContain('{privacyOpen && (<>');
        expect(profile).toContain('subtitle={privacySummary(hasBiometricHw && biometricEnabled, readReceiptsEnabled, lastSeenEnabled)}');
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
