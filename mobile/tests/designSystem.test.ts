import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('Silver and blue design', () => {
    const chats = read('screens/ConversationsScreen.tsx');
    const row = read('components/ConversationRow.tsx');
    const nav = read('navigation/index.tsx');

    it('Chats and its rows read every color from the design tokens', () => {
        for (const source of [chats, row]) {
            expect(source).not.toContain('useAppTheme');
            expect(source).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source).toContain("from '../design/tokens'");
        }
    });

    it('the tab bar is the floating frosted bar', () => {
        expect(nav).toContain('tabBar={(props) => <FloatingTabBar {...props} />}');
        expect(nav).not.toContain('tabBarStyle');
    });

    it('the app waits for the Inter font before drawing', () => {
        expect(fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8')).toContain('if (!fontsLoaded) return null;');
    });
});

describe('Conversation in the new design', () => {
    const files = [
        'screens/ChatScreen.tsx',
        'components/ChatHeader.tsx',
        'components/ChatInput.tsx',
        'components/MessageItem.tsx',
        'components/AudioPlayer.tsx',
        'components/PingActivityCard.tsx',
        'components/chat/DeliveryTicks.tsx',
        'components/GroupTaskCard.tsx',
        'components/OperationPanel.tsx',
        'components/MessageActionsModal.tsx',
        'components/ReactionsModal.tsx',
        'components/AISuggestionModal.tsx',
        'components/SummaryModal.tsx',
        'components/MediaSourceSheet.tsx',
        'components/ForwardMessagesModal.tsx',
        'components/MentionPopup.tsx',
        'components/LocationConfirmModal.tsx',
    ];

    it('the conversation reads every color from the design tokens', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toContain('useAppTheme');
            expect(source, file).not.toContain("theme/theme'");
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
        }
    });

    it('draws its own glass header over the waves', () => {
        const chat = read('screens/ChatScreen.tsx');
        expect(chat).toContain('<GlassBackdrop>');
        expect(chat).toContain('<ChatHeader');
        expect(chat).not.toContain('navigation.setOptions');
    });

    it('my bubbles are the blue gradient', () => {
        expect(read('components/MessageItem.tsx')).toContain('colors={gradients.accent}');
    });
});

describe('Hoy in the new design', () => {
    const files = [
        'screens/HoyScreen.tsx',
        'components/compromisos/CommitmentRow.tsx',
        'components/compromisos/CommitmentDetailSheet.tsx',
        'components/compromisos/ConfirmCommitmentModal.tsx',
        'components/compromisos/RescheduleModal.tsx',
        'components/hoy/WeekStrip.tsx',
    ];

    it('reads every color from the design tokens', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toContain('useAppTheme');
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source, file).not.toMatch(/rgba\(/);
        }
    });

    it('sits on the waves with glass rows and clears the floating tab bar', () => {
        const hoy = read('screens/HoyScreen.tsx');
        expect(hoy).toContain("<SafeAreaView edges={['top']} style={styles.container}>");
        expect(hoy).toContain('<Glass style={[StyleSheet.absoluteFill, styles.bandGlass]}');
        expect(hoy).toContain('TAB_BAR_CLEARANCE');
    });
});

describe('Perfil in the new design', () => {
    const files = [
        'screens/ProfileScreen.tsx',
        'components/perfil/CalendarsSheet.tsx',
        'components/perfil/EditProfileSheet.tsx',
        'components/perfil/FocusModeSheet.tsx',
        'components/perfil/MemorySheet.tsx',
    ];

    it('reads every color from the design tokens', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toContain('useAppTheme');
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source, file).not.toMatch(/rgba\(/);
        }
    });

    it('shows settings on full-width glass bands and its sheets as lit glass', () => {
        const profile = read('screens/ProfileScreen.tsx');
        expect(profile).toContain('<Glass style={[StyleSheet.absoluteFill, styles.band]}');
        expect(profile).toContain('TAB_BAR_CLEARANCE');
        for (const file of files.slice(1)) {
            expect(read(file), file).toContain('<SheetFill />');
        }
    });
});

describe('New chat and new group in the new design', () => {
    const files = ['screens/NewChatScreen.tsx', 'screens/NewGroupScreen.tsx'];

    it('read every color from the design tokens and use the glass header', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source, file).not.toMatch(/rgba\(/);
            expect(source, file).not.toContain("'white'");
            expect(source, file).toContain('<ScreenHeader');
        }
    });
});
