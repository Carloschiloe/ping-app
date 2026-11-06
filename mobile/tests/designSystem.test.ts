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
        'components/ChatInput.tsx',
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

    it('groups its settings in one glass card and shows its sheets as lit glass', () => {
        const profile = read('screens/ProfileScreen.tsx');
        expect(profile).toContain('<Glass style={[StyleSheet.absoluteFill, styles.cardGlass]}');
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

describe('Chat info and add participants in the new design', () => {
    const files = [
        'screens/ChatInfoScreen.tsx',
        'screens/AddParticipantsScreen.tsx',
        'components/chat-info/GroupMembersSection.tsx',
        'components/shared-content/SharedContentThumbnail.tsx',
    ];

    it('read every color from the design tokens', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toContain('useAppTheme');
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source, file).not.toMatch(/rgba\(/);
        }
        expect(read('screens/ChatInfoScreen.tsx')).toContain('<ScreenHeader');
        expect(read('screens/AddParticipantsScreen.tsx')).toContain('<ScreenHeader');
    });

    it('reads the people list out of the search answer', () => {
        expect(read('screens/AddParticipantsScreen.tsx')).toContain('searchResults?.users || []');
    });
});

describe('Shared content in the new design', () => {
    const files = [
        'screens/SharedContentScreen.tsx',
        'screens/SharedVisualContentScreen.tsx',
        'components/shared-content/SharedContentActionSheet.tsx',
        'components/shared-content/SharedMediaViewer.tsx',
    ];

    it('reads every color from the design tokens', () => {
        for (const file of files) {
            const source = read(file);
            expect(source, file).not.toContain('useAppTheme');
            expect(source, file).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
            expect(source, file).not.toMatch(/rgba\(/);
        }
        expect(read('screens/SharedContentScreen.tsx')).toContain('<ScreenHeader');
        expect(read('screens/SharedVisualContentScreen.tsx')).toContain('<ScreenHeader');
        expect(read('components/shared-content/SharedContentActionSheet.tsx')).toContain('<SheetFill />');
    });
});

describe('Task history and the Ping screen in the new design', () => {
    const screens = ['screens/TaskHistoryScreen.tsx', 'screens/AgentPreviewScreen.tsx'];
    for (const file of screens) {
        const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf-8');
        it(`${file} uses the design tokens only`, () => {
            expect(source).not.toContain('useAppTheme');
            expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}/);
            expect(source).not.toContain('rgba(');
        });
    }

    it('Ping draws its own frosted bar and keeps measuring it for the keyboard', () => {
        const source = fs.readFileSync(path.join(__dirname, '../src/screens/AgentPreviewScreen.tsx'), 'utf-8');
        expect(source).toContain('<PingOrb');
        expect(source).toContain('<SheetFill />');
        expect(source).not.toContain('SafeAreaView');
    });
});

describe('The old light/dark theme is gone', () => {
    it('no separate palette is left, not even for sign-in', () => {
        expect(fs.existsSync(path.join(__dirname, '../src/theme'))).toBe(false);
    });

    for (const file of ['navigation/index.tsx', 'components/AgreementParticipantsList.tsx']) {
        it(`${file} uses the design tokens only`, () => {
            const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf-8');
            expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
            expect(source).not.toContain("'white'");
        });
    }
});

describe('Lock screen, Ping Voz and calls in the new design', () => {
    for (const file of ['components/LockScreen.tsx', 'components/agent/LiveVoiceSession.tsx', 'screens/CallScreen.tsx', 'screens/IncomingCallScreen.tsx']) {
        it(`${file} uses the design tokens only`, () => {
            const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf-8');
            expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
            expect(source).not.toContain('rgba(');
            expect(source).not.toContain('"white"');
        });
    }
});

describe("Ping's living aura", () => {
    const orb = read('design/PingOrb.tsx');
    const ping = read('screens/AgentPreviewScreen.tsx');

    it('turns every frame, with arcs orbiting a core of drifting light', () => {
        expect(orb).toContain('useFrameCallback');
        expect(orb).toContain('const ARCS');
        expect(orb).toContain('const BLOBS');
        expect(orb).toContain("thinking: 3.8");
    });

    it('rests while its screen is covered by another one', () => {
        expect(orb).toContain('frames.setActive(!paused)');
        expect(ping).toContain('paused={liveVoiceVisible}');
        expect(read('screens/ConversationsScreen.tsx')).toContain('<PingOrb size={44} paused={!isFocused} />');
    });
});

describe('Sign-in screens in the glass design', () => {
    const files = ['components/auth/AuthKit.tsx', 'screens/AuthScreen.tsx', 'screens/CompleteProfileScreen.tsx', 'screens/PasswordRecoveryScreen.tsx'];
    for (const file of files) {
        it(`${file} reads every color from the design tokens`, () => {
            const source = read(file);
            expect(source).not.toContain('authColors');
            expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}/);
            expect(source).not.toContain('rgba(');
            expect(source).not.toContain('fontWeight');
        });
    }

    it('shows the aura, the glass backdrop and what Ping does', () => {
        const kit = read('components/auth/AuthKit.tsx');
        expect(kit).toContain('<GlassBackdrop>');
        expect(kit).toContain('<PingOrb size={compact ? 96 : 128} />');
        expect(kit).toContain('Lo que acuerdas en tus chats, Vorian lo recuerda por ti.');
    });

    it('a failed profile read retries instead of asking for the name again', () => {
        const auth = read('context/AuthContext.tsx');
        expect(auth).toContain('void loadProfile(userId);');
        expect(auth).not.toContain('setProfileComplete(false)');
    });
});

describe('Photos stay cached across signed-link renewals', () => {
    const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

    it('keys the image cache on the file, not on its one-minute link', () => {
        const src = read('src/design/CachedImage.tsx');
        expect(src).toContain("uri.split('?')[0]");
        expect(src).toContain('cachePolicy="memory-disk"');
    });

    it('chat media is not renewed on a timer', () => {
        expect(read('src/components/MessageItem.tsx')).not.toContain('getPrivateFileRefreshDelay');
        expect(read('src/hooks/useSharedContentUrl.ts')).not.toContain('getPrivateFileRefreshDelay');
    });
});
