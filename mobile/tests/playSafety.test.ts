import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

describe('What Google Play and Ley 21.719 ask of the app', () => {
    it('Perfil offers feedback, blocked people, legal pages and account deletion', () => {
        const profile = read('screens/ProfileScreen.tsx');
        expect(profile).toContain('Comentarios y sugerencias');
        expect(profile).toContain('Personas bloqueadas');
        expect(profile).toContain("openLegal('privacy')");
        expect(profile).toContain("openLegal('terms')");
        expect(profile).toContain('<DeleteAccountSheet');
    });

    it('deleting the account needs the typed word and signs out after', () => {
        const sheet = read('components/perfil/DeleteAccountSheet.tsx');
        expect(sheet).toContain("const CONFIRM_WORD = 'ELIMINAR'");
        expect(sheet).toContain('actionDisabled={!confirmed}');
        expect(sheet).toContain('supabase.auth.signOut()');
        expect(read('api/query-modules/safety.ts')).toContain("apiClient.post('/user/account/delete', { confirm: 'ELIMINAR' })");
    });

    it('a chat can block and report, and messages and Ping replies can be reported', () => {
        expect(read('screens/ChatInfoScreen.tsx')).toContain('Denunciar a {name}');
        expect(read('components/MessageActionsModal.tsx')).toContain('Denunciar');
        expect(read('screens/AgentPreviewScreen.tsx')).toContain("kind: 'assistant'");
        expect(read('components/SummaryModal.tsx')).toContain('Denunciar este resumen');
        expect(read('screens/ChatScreen.tsx')).toContain('chatBlocked ?');
    });

    it('sign up needs the terms accepted and the age confirmed', () => {
        const auth = read('screens/AuthScreen.tsx');
        expect(auth).toContain("(mode === 'signup' && !acceptedTerms)");
        expect(auth).toContain('Tengo 14 años o más');
    });

    it('contacts are explained before Android asks, never on opening the screen', () => {
        const newChat = read('screens/NewChatScreen.tsx');
        expect(newChat).toContain('if (askNow && permission.status');
        expect(newChat).toContain('loadContacts(true)');
        expect(newChat).not.toMatch(/useEffect\(\(\) => \{\s*loadContacts\(true\)/);
    });

    it('legal pages live on the same server as the API', () => {
        const links = read('utils/legalLinks.ts');
        expect(links).toContain("privacy: '/privacidad'");
        expect(links).toContain("deleteAccount: '/cuenta/eliminar'");
        expect(links).toContain('carlos@marvex.cl');
    });
});

describe('a Ping reply offers copy and report', () => {
    it('the long-press menu copies the same text or opens the report', () => {
        const screen = read('screens/AgentPreviewScreen.tsx');
        expect(screen).toContain("{ text: 'Copiar', onPress: () => { handleCopyMessage(text); } }");
        expect(screen).toContain("setReportTarget({ kind: 'assistant', excerpt: text })");
    });
});
