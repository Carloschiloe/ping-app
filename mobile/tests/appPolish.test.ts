import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');

describe('Small polish across the app', () => {
    it('the chat bar ends with the same Ping orb as Hoy', () => {
        const header = read('components/ChatHeader.tsx');
        expect(header).toContain("<PingOrb size={38} state={summarizing ? 'thinking' : 'idle'} paused={!isFocused} />");
        expect(header).not.toContain('name="sparkles"');
    });

    it('one word per action: "Poner fecha" for a date, "Crear compromiso" from a message', () => {
        expect(read('components/compromisos/CommitmentRow.tsx')).not.toContain('Agendar');
        expect(read('components/compromisos/RescheduleModal.tsx')).not.toContain('Agendar');
        expect(read('components/AISuggestionModal.tsx')).not.toContain("'Agendar'");
        expect(read('components/MessageItem.tsx')).toContain('Crear compromiso');
    });

    it('the date on Hoy stays on one line', () => {
        const hoy = read('screens/HoyScreen.tsx');
        expect(hoy).toContain("format(new Date(), 'EEEE d MMM', { locale: es })");
        expect(hoy).toContain('numberOfLines={1}>{todayLabel.toUpperCase()}');
    });

    it('a video still loading shows a soft card that says Video, not an empty box', () => {
        const item = read('components/MessageItem.tsx');
        expect(item).toContain('styles.videoLoadingTag');
        expect(item).not.toContain('<View style={[style, { backgroundColor: colors.glassDim }]} />');
    });
});

describe('Calls and the chat bar', () => {
    it('every chat and group can call and video call again; Para mí cannot', () => {
        const header = read('components/ChatHeader.tsx');
        expect(header).toContain('accessibilityLabel="Llamar"');
        expect(header).toContain('accessibilityLabel="Videollamada"');
        const chat = read('screens/ChatScreen.tsx');
        expect(chat).toContain("onVoiceCall={isSelf ? undefined : () => navigation.navigate('Call', { conversationId, otherUser, isGroup: !!isGroup, type: 'voice' })}");
        expect(chat).toContain("onVideoCall={isSelf ? undefined : () => navigation.navigate('Call', { conversationId, otherUser, isGroup: !!isGroup, type: 'video' })}");
    });

    it('the orb sums the chat up and offers to ask Ping from there', () => {
        const chat = read('screens/ChatScreen.tsx');
        expect(chat).toContain('onSummary={handleSummarize}');
        expect(chat).toContain('onAskPing={() => {');
    });
});
